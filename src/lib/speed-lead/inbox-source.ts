/** The speed-to-lead inbox over the project's REAL CRM queue — pure, client-safe
 *  (no store, no `server-only`, no clock read of its own: `nowMs` is passed in).
 *
 *  Maps the urgent queue (`leads/sla.ts#urgentQueue`) onto the inbox's `InboundLead`
 *  row, carrying what the drill rows never had: the `contactId` the write-back
 *  PATCHes, the recorded response time, and the queue's own 15-minute target — so
 *  the drill's 5 minutes and the queue's 15 are each labelled on their own data.
 *
 *  It also owns the twin-reply request for a row, because that is where the PII rule
 *  of docs/leads/design.md §7 has to hold: NO LEAD PII IN THE LLM CHOKEPOINT. A row
 *  mapped from a live contact builds no request at all (the operator writes that
 *  reply by hand); only a sample row still drafts with the model. */
import { LEAD_SLA_TARGET_MIN, urgentQueue } from "@/lib/leads/sla";
import { PIPELINE_RANK, isErased, isTerminalStage, type Contact, type PipelineStage } from "@/lib/leads/types";
import { SLA_TARGET_MIN } from "./draft";
import type { Qualification } from "./qualification";
import type { InboundLead, LeadChannel } from "./sample";

const MIN_MS = 60_000;

/** How the person reached us, read from what the CRM knows. Deliberately coarse:
 *  the arrival kind only steers the deterministic draft's contact-back sentence. */
function arrivalChannel(c: Contact): LeadChannel {
  const s = `${c.preferredChannel ?? ""} ${c.attribution?.source ?? ""}`.toLowerCase();
  if (/call|phone|tel/.test(s)) return "call";
  if (/chat|whatsapp|messenger|sms/.test(s)) return "chat";
  if (/mail/.test(s)) return "email";
  return "form";
}

/** The target this contact's clock runs on: the deadline the store wrote, else
 *  the queue's LEAD_SLA_TARGET_MIN. Never the drill's 5 minutes. */
function targetMin(c: Contact, seenMs: number): number {
  const due = c.slaDueAt ? Date.parse(c.slaDueAt) : NaN;
  if (Number.isFinite(due) && Number.isFinite(seenMs) && due > seenMs) return Math.round((due - seenMs) / MIN_MS);
  return LEAD_SLA_TARGET_MIN;
}

/** One CRM contact as an inbox row. */
export function contactToInboundLead(c: Contact, nowMs: number): InboundLead {
  const seen = Date.parse(c.firstSeenAt);
  const responded = c.firstRespondedAt ? Date.parse(c.firstRespondedAt) : NaN;
  return {
    id: c.id,
    contactId: c.id,
    name: c.name ?? c.companyName ?? c.email ?? c.phone ?? "",
    channel: arrivalChannel(c),
    message: c.notes?.trim() ?? "",
    minutesAgo: Number.isFinite(seen) ? Math.max(0, Math.round((nowMs - seen) / MIN_MS)) : 0,
    stage: c.stage,
    slaTargetMin: targetMin(c, seen),
    ...(Number.isFinite(responded) && Number.isFinite(seen)
      ? { respondedSec: Math.max(0, Math.round((responded - seen) / 1000)) }
      : {}),
  };
}

/** The inbox for a live project: the urgent queue (open, unanswered, capped, in
 *  deadline order), minus GDPR tombstones — an erased contact is never a person. */
export function inboxLeadsFromContacts(contacts: readonly Contact[], nowMs: number): InboundLead[] {
  const people = contacts.filter((c) => !isErased(c));
  return urgentQueue(people, nowMs).rows.map((c) => contactToInboundLead(c, nowMs));
}

export interface QualifyPatch {
  stage?: PipelineStage;
  qualification: Qualification;
  /** the route stamps its own clock; `true` only says "record it now" */
  firstRespondedAt: true;
}

/** The PATCH body for "Qualify": the BANT capture, the first-response stamp (the
 *  rep has spoken to the lead to learn it), and a move to `qualified` ONLY from an
 *  open pre-qualified stage — a qualify never regresses a later or terminal one. */
export function qualifyPatch(q: Qualification, contact: { stage?: PipelineStage }): QualifyPatch {
  const stage = contact.stage;
  const advance = stage !== undefined && !isTerminalStage(stage) && PIPELINE_RANK[stage] < PIPELINE_RANK.qualified;
  return { ...(advance ? { stage: "qualified" as const } : {}), qualification: q, firstRespondedAt: true };
}

/* ── the SLA clock per row ───────────────────────────────────────────────────── */

/** This row's target in seconds: its own (live) or the drill's. */
export function leadSlaTargetSec(lead: InboundLead): number {
  return (lead.slaTargetMin ?? SLA_TARGET_MIN) * 60;
}

/** Response times already recorded in the CRM, so a row answered elsewhere (Leady's
 *  advance, an earlier session) opens settled instead of re-running its clock. */
export function seedResponded(leads: readonly InboundLead[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of leads) if (typeof l.respondedSec === "number") m.set(l.id, l.respondedSec);
  return m;
}

/** Past its target and not answered. A settled row is never overdue. */
export function isLeadOverdue(
  lead: InboundLead,
  nowMs: number,
  arrivalMs: number,
  responded: ReadonlyMap<string, number>
): boolean {
  if (responded.has(lead.id)) return false;
  return Math.floor((nowMs - arrivalMs) / 1000) > leadSlaTargetSec(lead);
}

/* ── the twin-reply request (the PII rule lives here) ───────────────────────── */

type Locale = "cs" | "en";

/** Neutral fallback used only when the catalog offers no service name at all. It
 *  SEEDS the prompt, so it follows the reader's locale (never rendered). */
const PROJECT_TYPE_FALLBACK: Record<Locale, string> = {
  cs: "poptávaná služba",
  en: "the service being enquired about",
};

/** A short project-type hint grounded in the business's REAL catalog: a service
 *  the lead names in their message, else the primary service, else neutral. */
export function projectTypeFor(lead: InboundLead, hints: readonly string[], locale: Locale): string {
  const m = lead.message.toLowerCase();
  const named = hints.find((h) => h && m.includes(h.toLowerCase()));
  return named || hints[0] || PROJECT_TYPE_FALLBACK[locale];
}

export interface TwinReplyContext {
  serviceHints: readonly string[];
  locale: Locale;
  brand: string;
  /** the rep's captured BANT, already described for the prompt */
  qualification?: string;
  voice?: unknown;
  examples?: readonly string[];
  avoid?: readonly string[];
}

/** Whether the model may draft for this row. A live CRM contact may not. */
export function aiDraftAllowed(lead: InboundLead): boolean {
  return !lead.contactId;
}

/** The twin-reply payload for a row — or NULL for a live CRM contact. The inbound
 *  text and the name of a real person would reach `generateStructured` (and its
 *  LightTrack mirror), which docs/leads/design.md §7 forbids without a redaction
 *  pass that does not exist; so no request is constructed at all. */
export function twinReplyRequestFor(lead: InboundLead, ctx: TwinReplyContext): Record<string, unknown> | null {
  if (!aiDraftAllowed(lead)) return null;
  return {
    inbound: lead.message,
    // The arrival kind (form/call/…) is a sub-kind of the `leads` channel: it steers
    // phrasing, the channel steers the voice.
    channel: "leads",
    arrival: lead.channel,
    projectType: projectTypeFor(lead, ctx.serviceHints, ctx.locale),
    contact: lead.name,
    brand: ctx.brand,
    ...(ctx.qualification ? { qualification: ctx.qualification } : {}),
    ...(ctx.voice ? { voice: ctx.voice } : {}),
    ...(ctx.examples && ctx.examples.length > 0 ? { examples: ctx.examples } : {}),
    ...(ctx.avoid && ctx.avoid.length > 0 ? { avoid: ctx.avoid } : {}),
  };
}
