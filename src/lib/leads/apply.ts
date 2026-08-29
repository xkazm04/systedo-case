/** `applyLeadEvent` — the ONE path every connector's output converges on.
 *
 *      LeadEvent ──▶ dedup ──▶ contact upsert (auto-merge) ──▶ activity ──▶ score
 *
 *  IDEMPOTENT BY CONSTRUCTION. The unique key `${connectorId}:${externalId}` is
 *  checked before anything is written, so re-applying the same event is a no-op
 *  that returns the contact it originally landed on. That property is not a nicety:
 *  a Gmail poller re-reads its window, Meta retries webhooks for an undocumented
 *  period and LinkedIn's notifications are at-least-once — without it every retry
 *  would duplicate a person in the operator's CRM.
 *
 *  GDPR: nothing here calls an LLM. Lead text must never reach `generateStructured`
 *  un-redacted, because the chokepoint mirrors traffic to LightTrack — see
 *  docs/leads/design.md §B7. Keep this module LLM-free.
 *
 *  Server-only (it writes the store); the decisions it makes are pure helpers
 *  exported alongside so they are testable without a database. */
import "server-only";
import {
  ACTIVITY_CAP,
  CONTACT_CAP,
  clampText,
  dedupKey,
  BODY_MAX,
  EMAIL_MAX,
  NAME_MAX,
  PHONE_MAX,
  SUMMARY_MAX,
  type Activity,
  type ActivityActor,
  type Attribution,
  type Contact,
  type LeadEvent,
  type PipelineStage,
} from "./types";
import { contactKeys, type PhoneRegion } from "./normalize";
import { scoreContact } from "./score";
import {
  appendActivity,
  countContacts,
  findContactByKeys,
  getContact,
  getLeadEvent,
  listActivities,
  saveContact,
  saveLeadEvent,
} from "./store";
import { conversionFromApply, conversionValue } from "./conversion-events";
import { appendConversionEvents } from "./conversion-store";

/** Collision-resistant opaque id (the annotations/lp-exp precedent — no dependency). */
export function newLeadId(prefix = "c"): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ApplyOptions {
  /** evaluation instant — injected so the whole path is deterministic in tests */
  now?: Date;
  /** default calling region for phone normalisation */
  region?: PhoneRegion;
  /** the stage a brand-new contact enters at (default "new") */
  initialStage?: PipelineStage;
  /** minutes from first contact to the SLA deadline; omitted ⇒ no clock is set
   *  (better an absent deadline than an invented one) */
  responseTargetMinutes?: number;
  /** how much of the message body may be persisted — the connector's policy */
  bodyRetention?: "full" | "snippet" | "none";
}

export type ApplyOutcome = "created" | "merged" | "duplicate" | "rejected";

export interface ApplyResult {
  outcome: ApplyOutcome;
  contact: Contact | null;
  /** the stored event as it now stands (status reflects the outcome) */
  event: LeadEvent;
  /** set when outcome is "rejected" */
  reason?: string;
}

const SNIPPET_MAX = 280;

/** Trim a body to the connection's retention policy. Data minimisation is a design
 *  requirement for a connector that can see whole mailboxes, not a setting. */
export function retainBody(
  text: string | undefined,
  policy: ApplyOptions["bodyRetention"] = "snippet"
): string | undefined {
  if (policy === "none") return undefined;
  const t = clampText(text, BODY_MAX);
  if (!t) return undefined;
  return policy === "full" ? t : t.slice(0, SNIPPET_MAX);
}

/** A one-line timeline summary from the event. Deliberately LOCALE-FREE: it carries
 *  only identity, because the *kind* of entry is already on `Activity.kind` and the
 *  UI localises that from its own cs/en dict (the repo's colocated-i18n contract).
 *  Storing a Czech sentence here would bake one locale into persisted data. Pure. */
export function eventSummary(event: LeadEvent): string {
  const who =
    event.identity.name ||
    event.identity.email ||
    event.identity.phone ||
    event.identity.handle ||
    event.connectorId;
  return clampText(who, SUMMARY_MAX) ?? event.connectorId;
}

/** Merge the event's attribution over a contact's, WITHOUT overwriting a known
 *  first touch. First-touch wins for `source` and `gclid`; last-touch fills the
 *  blanks. Pure — this is the whole attribution policy in one readable function. */
export function mergeAttribution(prev: Attribution | undefined, next: Partial<Attribution>): Attribution {
  const base: Attribution = prev ?? { source: next.source || "unknown" };
  return {
    ...base,
    ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== "")),
    // first touch is never rewritten — an attribution argument you cannot win later
    source: base.source || next.source || "unknown",
    // WP W3-C: the click id is first-touch for the same reason, and for one more —
    // it is what an offline conversion is MATCHED on. Letting a later import
    // overwrite it would re-attribute an already-uploaded conversion to a different
    // click, which is a double-count the ad platform cannot undo. A blank existing
    // gclid is still fillable (that is a first touch arriving late, not a rewrite).
    ...(base.gclid ? { gclid: base.gclid } : {}),
  };
}

/** The SLA deadline for a contact first seen at `firstSeenAt`. `undefined` target
 *  ⇒ no deadline (an absent clock is honest; an invented one is not). Pure. */
export function slaDueAt(firstSeenAt: string, responseTargetMinutes?: number): string | undefined {
  if (!responseTargetMinutes || responseTargetMinutes <= 0) return undefined;
  const t = Date.parse(firstSeenAt);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t + responseTargetMinutes * 60_000).toISOString();
}

/** Apply one connector event to a project's lead layer. Never throws on a
 *  well-formed event; a rejected event is recorded with `status: "failed"` so it is
 *  visible and replayable rather than silently dropped. */
export async function applyLeadEvent(
  projectId: string,
  event: LeadEvent,
  opts: ApplyOptions = {}
): Promise<ApplyResult> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const key = dedupKey(event.connectorId, event.externalId);

  // 1 ── DEDUP. The check happens BEFORE any write, so a retry touches nothing.
  const seen = await getLeadEvent(projectId, key);
  if (seen && seen.status === "applied") {
    const contact = seen.contactId ? await getContact(projectId, seen.contactId) : null;
    return { outcome: "duplicate", contact, event: { ...seen, status: "applied" } };
  }

  const identity = {
    name: clampText(event.identity.name, NAME_MAX),
    email: clampText(event.identity.email, EMAIL_MAX),
    phone: clampText(event.identity.phone, PHONE_MAX),
  };
  const keys = contactKeys(identity, opts.region ?? "CZ");

  // An event with no usable identity cannot become a person. Record the failure —
  // never invent a nameless contact that the operator then has to clean up.
  if (!keys.emailKey && !keys.phoneKey && !identity.name) {
    const failed: LeadEvent = { ...event, status: "failed", error: "no-identity", receivedAt: nowIso };
    await saveLeadEvent(projectId, key, failed);
    return { outcome: "rejected", contact: null, event: failed, reason: "no-identity" };
  }

  // 2 ── CONTACT UPSERT. Auto-merge only on an exact normalised email or E.164
  //      phone (normalize.ts §B6); a name collision is never an auto-merge.
  const existing = await findContactByKeys(projectId, keys);
  let contact: Contact;
  let outcome: ApplyOutcome;

  if (existing) {
    outcome = "merged";
    contact = {
      ...existing,
      name: existing.name ?? identity.name,
      email: existing.email ?? identity.email,
      phone: existing.phone ?? identity.phone,
      // A newly-learned key must be indexed, but an existing one is never rewritten
      // (that would move the contact out from under a concurrent lookup).
      emailKey: existing.emailKey ?? keys.emailKey,
      phoneKey: existing.phoneKey ?? keys.phoneKey,
      nameKey: existing.nameKey ?? keys.nameKey,
      attribution: mergeAttribution(existing.attribution, event.attribution),
      lastActivityAt: maxIso(existing.lastActivityAt, event.occurredAt),
      updatedAt: nowIso,
    };
  } else {
    const count = await countContacts(projectId);
    if (count >= CONTACT_CAP) {
      const failed: LeadEvent = { ...event, status: "failed", error: "contact-cap", receivedAt: nowIso };
      await saveLeadEvent(projectId, key, failed);
      return { outcome: "rejected", contact: null, event: failed, reason: "contact-cap" };
    }
    outcome = "created";
    const firstSeenAt = event.occurredAt || nowIso;
    contact = {
      id: newLeadId(),
      projectId,
      ...(identity.name ? { name: identity.name } : {}),
      ...(identity.email ? { email: identity.email } : {}),
      ...(identity.phone ? { phone: identity.phone } : {}),
      ...keys,
      stage: opts.initialStage ?? "new",
      stageEnteredAt: firstSeenAt,
      attribution: mergeAttribution(undefined, {
        ...event.attribution,
        connectorId: event.connectorId,
        externalId: event.externalId,
      }),
      consent: [],
      tags: [],
      firstSeenAt,
      lastActivityAt: firstSeenAt,
      createdAt: nowIso,
      updatedAt: nowIso,
      ...(slaDueAt(firstSeenAt, opts.responseTargetMinutes)
        ? { slaDueAt: slaDueAt(firstSeenAt, opts.responseTargetMinutes) }
        : {}),
    };
  }

  // 3 ── ACTIVITY. One inbound entry per event, capped by the store (ACTIVITY_CAP).
  const actor: ActivityActor = { type: "connector", id: event.connectorId };
  const activity: Activity = {
    id: `ev-${event.id}`,
    at: event.occurredAt || nowIso,
    kind: event.kind === "call" ? "call" : "inbound_message",
    actor,
    summary: eventSummary(event),
    ...(retainBody(event.text, opts.bodyRetention) ? { body: retainBody(event.text, opts.bodyRetention) } : {}),
    refs: { leadEventId: event.id },
  };
  await saveContact(projectId, contact); // contact must exist before its timeline
  await appendActivity(projectId, contact.id, activity);

  // 4 ── SCORE. Deterministic, no LLM. The timeline is re-read (bounded) so the
  //      engagement axis sees the entry we just appended.
  const activities = await listActivities(projectId, contact.id, ACTIVITY_CAP);
  contact = {
    ...contact,
    score: scoreContact({
      contact,
      enquiry: event.text,
      activities,
      firstRespondedAt: contact.firstRespondedAt,
      lastActivityAt: contact.lastActivityAt,
      now,
    }),
    updatedAt: nowIso,
  };
  await saveContact(projectId, contact);

  // 5 ── CONVERSION LEDGER (WP W3-C, append site 2). A contact CREATED (or
  //      auto-merged) at rank ≥ 1 never passes through `changeStage` — the initial
  //      stage is set inline above — so an import of an already-`won` row would
  //      otherwise leave no ledger trace at all. Same upsert id as append site 1,
  //      which is what makes the two safe to overlap.
  //
  //      BEST-EFFORT and AFTER the save: a ledger outage must never fail an import.
  //      The deal value rides `raw.value` (the CSV connector's `value` column) —
  //      absent ⇒ null, never 0.
  try {
    const rawValue =
      event.raw && typeof event.raw === "object"
        ? (event.raw as { value?: unknown }).value
        : undefined;
    await appendConversionEvents(
      projectId,
      conversionFromApply(contact, now, {
        value: conversionValue(rawValue),
        connectorId: event.connectorId,
      })
    );
  } catch (err) {
    console.error(`[leads] conversion ledger append failed for ${contact.id}:`, err);
  }

  const applied: LeadEvent = { ...event, status: "applied", contactId: contact.id, receivedAt: nowIso };
  await saveLeadEvent(projectId, key, applied);
  return { outcome, contact, event: applied };
}

function maxIso(a: string, b: string | undefined): string {
  if (!b) return a;
  return b > a ? b : a;
}
