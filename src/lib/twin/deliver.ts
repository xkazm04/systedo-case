/** WP S2 — THE ONE PLACE A TWIN MESSAGE LEAVES THE BUILDING.
 *
 *  This is `send/route.ts`'s atomic claim, lifted out of the route so the route and
 *  the `twin-dispatch` ledger step share it instead of growing a second copy. That
 *  is not tidiness: `sentAt` is the repo's assertion that a claim path ran, and two
 *  claim paths would be two places to get it wrong. `sentAt` is minted HERE and
 *  nowhere else: grepping the assignment across `src/lib/twin` and `src/app/api`
 *  returns exactly the one line below, and the acceptance of this WP is that it stays
 *  that way. (The read-path sanitizer re-hydrates a STORED stamp through a
 *  conditional spread rather than an assignment, deliberately, so that grep keeps
 *  telling the truth.)
 *
 *  THE SHAPE OF THE CLAIM (unchanged from the route it came from):
 *   1. Inside `mutateTwin`'s transaction, re-read the STORED draft (never a caller's
 *      copy), refuse anything not `approved`, and flip it to `sent` up front. A
 *      second concurrent send therefore finds `sent` and is an idempotent no-op
 *      rather than a second delivery.
 *   2. Call the connector OUTSIDE the transaction (it does I/O; a transaction must
 *      not wait on a mail API).
 *   3. On a connector throw, RETRY the revert (`send-claim.retryRevert`) and report a
 *      strand loudly when every attempt fails.
 *
 *  WHAT S2 ADDS, AND WHY IT IS INSIDE THE CLAIM. The weekly cap is counted from the
 *  SAME state the claim mutates, so two concurrent sends on `maxPerWeek: 1` cannot
 *  both pass: whichever transaction commits first is visible to the second, which
 *  then counts one send already made and refuses. A cap checked before the mutate
 *  would be a check-then-act gap with a real message on the other side of it.
 *
 *  CONSENT FAILS CLOSED. The consent READ happens before the claim (it is a
 *  different store, and a transaction must not fan out), but its result is only ever
 *  used to refuse: no linked contact, no record, or an unreadable CRM all produce
 *  `null`, which `decideDelivery` treats exactly like an explicit "no". A refusal
 *  never touches the connector.
 *
 *  Server-only. The pure verdict is `decideDelivery` in ./types. */
import "server-only";
import { mutateTwin, getTwin } from "./store";
import {
  connectorFor as defaultConnectorFor,
  replySubject,
  type SendPayload,
  type SendResult,
  type TwinConnector,
} from "./connectors";
import { retryRevert } from "./send-claim";
import {
  channelConfig,
  decideDelivery,
  defaultConsentRequired,
  type TwinChannel,
  type TwinDraft,
  type TwinState,
} from "./types";
import { weekStartIso } from "@/lib/publishing/cadence";
import { mayContact, type ConsentPurpose } from "@/lib/leads/types";

/* -------------------------------------------------------------------------- */
/*  The consent purpose map                                                    */
/* -------------------------------------------------------------------------- */

/** WHICH LAWFUL PURPOSE A CHANNEL'S MESSAGE FALLS UNDER.
 *
 *  Written down here — not inferred at the call site — because the whole consent
 *  gate is only as honest as this table:
 *
 *   • `email`     → `marketing_email`. A generic outbound e-mail is the classic
 *                   direct-marketing surface; if an operator switches the gate on for
 *                   it, the marketing grant is the one they mean.
 *   • `leads`     → `service`. This channel IS someone's own enquiry. Answering the
 *                   person who just wrote to you is service communication under a
 *                   contract/pre-contract basis, not marketing — demanding a
 *                   marketing grant here would refuse the reply they asked for.
 *   • `sms`       → `marketing_sms`  ┐ the two channels where an unsolicited message
 *   • `whatsapp`  → `marketing_sms`  ┘ costs the recipient and is regulated hardest;
 *                   these are also the two that default `consentRequired: true`.
 *   • `chat`      → `service`  ┐ all three are replies inside a conversation the
 *   • `social`    → `service`  │ other side opened (a chat widget, a DM/comment, a
 *   • `reviews`   → `service`  ┘ public review), i.e. service communication.
 *
 *  Note the gate only consults this when `consentRequired` is on for the channel, so
 *  a `service` mapping is not a licence — it is which grant we look for when asked. */
export const CONSENT_PURPOSE_BY_CHANNEL: Record<TwinChannel, ConsentPurpose> = {
  leads: "service",
  email: "marketing_email",
  chat: "service",
  social: "service",
  reviews: "service",
  sms: "marketing_sms",
  whatsapp: "marketing_sms",
};

export function consentPurposeFor(channel: TwinChannel): ConsentPurpose {
  return CONSENT_PURPOSE_BY_CHANNEL[channel] ?? "service";
}

/* -------------------------------------------------------------------------- */
/*  Outcomes                                                                   */
/* -------------------------------------------------------------------------- */

/** Every non-deliverable outcome the claim can decide. The first four are the
 *  route's original vocabulary, byte-for-byte; `cap-exceeded` and `consent-required`
 *  are S2's two new gates. */
export type SendSignalKind =
  | "not-found"
  | "not-approved"
  | "connector-unconfigured"
  | "already-sent"
  | "cap-exceeded"
  | "consent-required";

export interface SendSignalInfo {
  /** the recorded stamp of an ALREADY-sent draft */
  sentAt?: string;
  /** the connector the channel names, for the refusal message */
  connectorLabel?: string;
  /** true when the refusal is "this draft has no delivery address" rather than "the
   *  connector has no credentials" — same 409, different sentence. */
  missingAddress?: boolean;
  /** the cap that refused, and how many sends this ISO week already used */
  cap?: number;
  sentThisWeek?: number;
}

/** Thrown INSIDE the mutator so the transaction rolls back without a write (except
 *  the deliberate claim). Never escapes this module. */
class SendSignal extends Error {
  // Plain fields, not TypeScript parameter properties: this module is imported by
  // node:test's type-stripping loader, which does not support that sugar.
  readonly kind: SendSignalKind;
  readonly info: SendSignalInfo;

  constructor(kind: SendSignalKind, info: SendSignalInfo = {}) {
    super(kind);
    this.kind = kind;
    this.info = info;
  }
}

export type DeliverOutcome =
  | { ok: true; delivered: boolean; mode: SendResult["mode"]; detail?: string; sentAt: string }
  | { ok: false; kind: SendSignalKind; info: SendSignalInfo }
  | { ok: false; kind: "delivery-failed"; error: unknown; channel: TwinChannel; reverted: boolean };

export interface DeliverDeps {
  /** connector registry override (fixtures) */
  connectorFor?: (id: string) => TwinConnector;
  /** consent read override (fixtures). `null` = could not establish ⇒ refuse. */
  readConsent?: (projectId: string, contactId: string, purpose: ConsentPurpose) => Promise<boolean | null>;
  /** fan out the audit trail (activity + outbound event + CRM row). Default true;
   *  a fixture turns it off to keep a unit test free of store side effects. */
  audit?: boolean;
  now?: () => Date;
}

/* -------------------------------------------------------------------------- */
/*  The weekly cap's counter                                                   */
/* -------------------------------------------------------------------------- */

/** How many drafts on `channel` have already been SENT in the ISO week containing
 *  `at`. Pure over the same drafts array the claim mutates, which is what makes the
 *  cap race-free. Weeks are Monday-start and LOCAL — the same `weekStartIso` the
 *  publishing cadence uses, because "3 a week" is a human promise about a human
 *  week, and two different week definitions in one product is a bug waiting. */
export function sentThisWeek(drafts: readonly TwinDraft[], channel: TwinChannel, at: string): number {
  const week = weekStartIso(at);
  if (!week) return 0;
  let n = 0;
  for (const d of drafts) {
    if (d.channel !== channel || d.status !== "sent") continue;
    if (typeof d.sentAt !== "string" || !d.sentAt) continue;
    if (weekStartIso(d.sentAt) === week) n++;
  }
  return n;
}

/* -------------------------------------------------------------------------- */
/*  Consent                                                                    */
/* -------------------------------------------------------------------------- */

/** The CRM answer for one draft, or `null` when we could not establish one. Every
 *  `null` path is deliberate and refuses downstream: no linked contact (nothing to
 *  ask about), an erased/absent contact, or a store failure. */
async function readConsentDefault(
  projectId: string,
  contactId: string,
  purpose: ConsentPurpose
): Promise<boolean | null> {
  try {
    const { getContact } = await import("@/lib/leads/store");
    const contact = await getContact(projectId, contactId);
    if (!contact) return null;
    return mayContact(contact.consent, purpose);
  } catch (err) {
    console.error(`[twin] consent read failed for ${projectId}/${contactId}:`, err);
    return null; // fail CLOSED — an unreadable CRM is not a permission
  }
}

/** Resolve consent only when the channel's config actually demands it — a channel
 *  with the gate off never pays for a CRM read. */
async function resolveConsent(
  projectId: string,
  draftId: string,
  deps: DeliverDeps
): Promise<boolean | null> {
  let state: TwinState | null = null;
  try {
    state = await getTwin(projectId);
  } catch {
    return null; // unreadable twin ⇒ the claim below will refuse anyway
  }
  const draft = state?.drafts.find((d) => d.id === draftId);
  if (!state || !draft) return null;
  const cfg = channelConfig(state.channels, draft.channel);
  const required = cfg.consentRequired ?? defaultConsentRequired(draft.channel);
  if (!required) return true; // not asked ⇒ not a refusal reason
  if (!draft.contactId) return null; // nobody to ask about ⇒ refuse
  const read = deps.readConsent ?? readConsentDefault;
  return read(projectId, draft.contactId, consentPurposeFor(draft.channel));
}

/* -------------------------------------------------------------------------- */
/*  Deliver                                                                    */
/* -------------------------------------------------------------------------- */

/** Claim, deliver, audit. The route and the dispatcher both call exactly this. */
export async function deliverDraft(
  userId: string | null,
  projectId: string,
  draftId: string,
  deps: DeliverDeps = {}
): Promise<DeliverOutcome> {
  const resolveConnector = deps.connectorFor ?? defaultConnectorFor;

  // ── THE ONE MINT ──────────────────────────────────────────────────────────
  const sentAt = (deps.now?.() ?? new Date()).toISOString();

  // Consent is a DIFFERENT store, so it is read before the transaction; its result is
  // only ever used to refuse, and every failure path yields `null` (= refuse).
  const consentOk = await resolveConsent(projectId, draftId, deps);

  let claimedState: TwinState;
  try {
    claimedState = await mutateTwin(projectId, (prev) => {
      // The mutator may RE-RUN inside the transaction: pure, no side effects.
      const draft = prev?.drafts.find((d) => d.id === draftId);
      if (!prev || !draft) throw new SendSignal("not-found");
      if (draft.status === "sent") throw new SendSignal("already-sent", { sentAt: draft.sentAt });
      if (draft.status !== "approved") throw new SendSignal("not-approved");
      const cfg = channelConfig(prev.channels, draft.channel);
      const connector = resolveConnector(cfg.connector);
      if (!connector.configured) throw new SendSignal("connector-unconfigured", { connectorLabel: connector.label });
      // A connector that really transmits needs somewhere to transmit TO. `contact` is
      // a display label and may well be a name, so this is the last thing standing
      // between "Jana N." and a mail API.
      if (connector.requiresAddress && !draft.to) {
        throw new SendSignal("connector-unconfigured", { connectorLabel: connector.label, missingAddress: true });
      }
      // Counted from THIS state, inside THIS transaction — the whole point.
      const used = sentThisWeek(prev.drafts, draft.channel, sentAt);
      const verdict = decideDelivery(cfg, draft, {
        sentThisWeek: used,
        consentOk,
        connectorConfigured: true,
      });
      if (!verdict.allowed) {
        if (verdict.reason === "cap-exceeded") {
          throw new SendSignal("cap-exceeded", { cap: cfg.maxPerWeek, sentThisWeek: used });
        }
        if (verdict.reason === "consent-required") throw new SendSignal("consent-required");
        if (verdict.reason === "connector-unconfigured") {
          throw new SendSignal("connector-unconfigured", { connectorLabel: connector.label });
        }
        // `disabled` — the channel was switched off after the draft was approved.
        throw new SendSignal("not-approved");
      }
      return {
        ...prev,
        drafts: prev.drafts.map((d) => (d.id === draftId ? { ...d, status: "sent" as const, sentAt } : d)),
        updatedAt: sentAt,
      };
    });
  } catch (e) {
    if (e instanceof SendSignal) return { ok: false, kind: e.kind, info: e.info };
    throw e;
  }

  const draft = claimedState.drafts.find((d) => d.id === draftId);
  if (!draft) return { ok: false, kind: "not-found", info: {} };
  const cfg = channelConfig(claimedState.channels, draft.channel);
  const connector = resolveConnector(cfg.connector);

  const payload: SendPayload = {
    channel: draft.channel,
    contact: draft.contact,
    body: draft.reply,
    ...(draft.to ? { to: draft.to } : {}),
    ...(connector.requiresAddress ? { subject: replySubject(draft.inbound) } : {}),
  };

  let result: SendResult;
  try {
    result = await connector.send(payload);
  } catch (err) {
    // Delivery failed after the optimistic claim — revert to `approved` (only if the
    // claim is still OURS, matched by the sentAt stamp) so the human can retry. The
    // revert is RETRIED, never fire-and-forget: a swallowed revert failure strands a
    // permanently-"sent" draft that never left the building.
    const reverted = await retryRevert(
      async () => {
        try {
          await mutateTwin(projectId, (prev) => {
            if (!prev) throw new SendSignal("not-found");
            return {
              ...prev,
              drafts: prev.drafts.map((d) =>
                d.id === draftId && d.status === "sent" && d.sentAt === sentAt
                  ? { ...d, status: "approved" as const, sentAt: undefined }
                  : d
              ),
            };
          });
        } catch (inner) {
          if (!(inner instanceof SendSignal)) throw inner;
        }
      },
      undefined,
      (inner, attempt) => console.warn(`[twin] send revert attempt ${attempt} failed for ${projectId}/${draftId}:`, inner)
    );
    if (!reverted) {
      console.error(
        `[twin] send revert FAILED for ${projectId}/${draftId} — draft may be stranded as 'sent' although delivery failed`
      );
    }
    return { ok: false, kind: "delivery-failed", error: err, channel: draft.channel, reverted };
  }

  if (deps.audit !== false) await recordDelivery(userId, projectId, draft, connector, result, sentAt);

  return { ok: true, delivered: result.delivered, mode: result.mode, detail: result.detail, sentAt };
}

/* -------------------------------------------------------------------------- */
/*  Audit                                                                      */
/* -------------------------------------------------------------------------- */

/** Three trails, all BEST-EFFORT and all after the send: the project timeline (what
 *  the operator reads), the outbound event bus (`twin.sent`, what their systems
 *  read) and the CRM contact's own timeline (what the person's record shows). A
 *  logging failure must never turn a delivered message into an error — the message
 *  is already gone.
 *
 *  Imports are LAZY: the activity emitter drags the ads connector (and the outbound
 *  bus drags firebase-admin) transitively, and the send path should not pay that on
 *  every module load. The `sken-guard.ts` precedent. */
async function recordDelivery(
  userId: string | null,
  projectId: string,
  draft: TwinDraft,
  connector: TwinConnector,
  result: SendResult,
  sentAt: string
): Promise<void> {
  const detail = `${draft.channel} · ${connector.label}${draft.contact ? ` · ${draft.contact}` : ""}`;
  try {
    const { emitProjectActivity } = await import("@/lib/activity/emit");
    await emitProjectActivity(userId, projectId, {
      kind: "update",
      module: "schranka",
      severity: result.delivered ? "success" : "info",
      title: "Zpráva odeslána",
      detail,
      actor: draft.autoApproved ? "Twin" : "Vy",
    });
  } catch (err) {
    console.error(`[twin] delivery activity failed for ${projectId}/${draft.id}:`, err);
  }

  if (userId) {
    try {
      const { emitOutbound } = await import("@/lib/outbound/emit");
      void emitOutbound(userId, projectId, {
        type: "twin.sent",
        title: "Zpráva odeslána",
        body: detail,
        data: {
          draftId: draft.id,
          channel: draft.channel,
          connector: connector.id,
          delivered: result.delivered,
          autoApproved: draft.autoApproved,
          sentAt,
        },
      });
    } catch (err) {
      console.error(`[twin] twin.sent emit failed for ${projectId}/${draft.id}:`, err);
    }
  }

  if (draft.contactId) {
    try {
      const { appendActivity } = await import("@/lib/leads/store");
      await appendActivity(projectId, draft.contactId, {
        id: `tw_${draft.id}`,
        at: sentAt,
        kind: "outbound_message",
        actor: { type: "twin" },
        summary: `Odchozí zpráva (${draft.channel})`,
        body: draft.reply,
        refs: { twinDraftId: draft.id, channel: draft.channel, connector: connector.id },
      });
    } catch (err) {
      console.error(`[twin] CRM activity failed for ${projectId}/${draft.contactId}:`, err);
    }
  }
}
