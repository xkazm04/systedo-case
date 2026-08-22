/** The lead ENTITY layer — the thing Adamant never had. Every existing "lead"
 *  surface is either an aggregate tally row (lead-quality) or a hardcoded sample
 *  constant (speed-lead); nothing stored an identified person with a name, an
 *  email, a stage history or a consent record. This module is that missing spine.
 *
 *  Design rules (docs/leads/design.md):
 *   - The COLLAPSED CRM model: Contact (the person, carrying the lifecycle stage),
 *     optional Company, optional Deal. No separate unconverted-Lead entity.
 *   - `PipelineStage` EXTENDS lead-quality's `LeadStage`; it never replaces it.
 *     `toLeadStage` projects back onto the funnel's four-stage vocabulary so
 *     `lead-quality/compute.ts` keeps running unchanged (see aggregate.ts).
 *   - `LeadEvent` (immutable connector output, replayable, dedup-keyed) is kept
 *     distinct from `Activity` (the human-meaningful timeline row).
 *   - Consent is per PURPOSE with a lawful basis and append-only history — this is
 *     a GDPR/ZoZOÚ requirement for a Czech-first product, not a nicety.
 *
 *  Framework-free and pure: no React, no firebase, no clock reads, no I/O. The two
 *  imports are TYPE-ONLY so this file stays free of runtime dependencies. */
import type { LeadStage } from "@/lib/lead-quality/types";
import type { TwinChannel } from "@/lib/twin/types";

/* ── stages: EXTENDS lead-quality's LeadStage, never replaces it ─────────────── */

/** The working states `LeadStage` cannot express — "someone is actively on it" and
 *  "it ended badly". The union stays a SUPERSET of `LeadStage`, so any
 *  `PipelineStage` is projectable back onto the funnel's four stages. */
export type PipelineStage = LeadStage | "new" | "working" | "lost" | "disqualified";

/** Board order: new → working → lead → qualified → opportunity → won, then the two
 *  terminal negatives. */
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  "new",
  "working",
  "lead",
  "qualified",
  "opportunity",
  "won",
  "lost",
  "disqualified",
] as const;

export function isPipelineStage(v: unknown): v is PipelineStage {
  return typeof v === "string" && (PIPELINE_STAGES as readonly string[]).includes(v);
}

/** Rank inside the cumulative funnel. The OLD FOUR keep their `STAGE_RANK` values
 *  (0..3) so an aggregate built from contacts is byte-comparable with one built
 *  from `aggregateLeads`; `new`/`working` sit at rank 0 alongside `lead`, and the
 *  terminal negatives get -1 (outside the cumulative funnel entirely). */
export const PIPELINE_RANK: Record<PipelineStage, number> = {
  new: 0,
  working: 0,
  lead: 0,
  qualified: 1,
  opportunity: 2,
  won: 3,
  lost: -1,
  disqualified: -1,
};

/** Project a pipeline stage onto the funnel's four-stage vocabulary. `null` means
 *  the contact is OUTSIDE the cumulative funnel (a terminal negative) — the caller
 *  decides whether to count it as an entered lead. Pure. */
export function toLeadStage(s: PipelineStage): LeadStage | null {
  switch (s) {
    case "new":
    case "working":
    case "lead":
      return "lead";
    case "qualified":
      return "qualified";
    case "opportunity":
      return "opportunity";
    case "won":
      return "won";
    case "lost":
    case "disqualified":
      return null;
  }
}

/** True for the two stages a contact cannot progress out of without being reopened. */
export function isTerminalStage(s: PipelineStage): boolean {
  return s === "lost" || s === "disqualified";
}

/** Loss reasons are a FIXED preset (the twin's `REJECT_REASONS` precedent) because
 *  they are counted — a free-text-only reason produces an unanalysable tally. The
 *  free text rides alongside in `lostNote`. */
export const LOST_REASONS = [
  "price",
  "timing",
  "competitor",
  "no_response",
  "not_qualified",
  "duplicate",
  "spam",
  "other",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export function isLostReason(v: unknown): v is LostReason {
  return typeof v === "string" && (LOST_REASONS as readonly string[]).includes(v);
}

/* ── attribution ─────────────────────────────────────────────────────────────── */

/** The standard source tuple. Never a single `source: string` — the tuple is what
 *  lets a contact set reconcile with BOTH `LeadSource.source` and campaign data.
 *  The DISPLAY label is derived from (source, campaign) at read time
 *  (`sourceLabel` in aggregate.ts), never stored twice. */
export interface Attribution {
  /** normalised channel key: google-ads | sklik | meta-lead-form | organic |
   *  referral | whatsapp | linkedin | email | direct | import | … */
  source: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  landingPath?: string;
  referrerHost?: string;
  gclid?: string;
  /** which connector delivered it (see connectors/types.ts) */
  connectorId?: string;
  /** the record's id in the source system — half of the idempotency key */
  externalId?: string;
}

/* ── consent (per purpose, provable, append-only) ────────────────────────────── */

export const CONSENT_PURPOSES = ["service", "marketing_email", "marketing_sms", "profiling"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const LAWFUL_BASES = ["consent", "contract", "legitimate_interest", "legal_obligation"] as const;
export type LawfulBasis = (typeof LAWFUL_BASES)[number];

/** One provable consent fact. Append-only — a withdrawal is `withdrawnAt` on the
 *  existing record plus a new record, never an overwrite. */
export interface ConsentRecord {
  purpose: ConsentPurpose;
  granted: boolean;
  basis: LawfulBasis;
  /** ISO timestamp the basis was established */
  at: string;
  /** where it was captured: a form URL, a connector id, "import", "manual" */
  origin: string;
  /** the exact wording shown to the person — the evidence */
  evidenceText?: string;
  ip?: string;
  withdrawnAt?: string;
}

/** The consent currently in force for a purpose (the newest non-withdrawn grant),
 *  or null when nothing was ever recorded. Pure. */
export function consentInForce(
  records: readonly ConsentRecord[],
  purpose: ConsentPurpose
): ConsentRecord | null {
  let best: ConsentRecord | null = null;
  for (const r of records) {
    if (r.purpose !== purpose) continue;
    if (r.withdrawnAt) continue;
    if (!best || r.at > best.at) best = r;
  }
  return best;
}

/** May we send this contact a marketing message on this purpose? Deliberately
 *  fail-closed: an absent record is NOT a permission. */
export function mayContact(records: readonly ConsentRecord[], purpose: ConsentPurpose): boolean {
  const r = consentInForce(records, purpose);
  return r !== null && r.granted;
}

/* ── scoring: two axes, never one number ─────────────────────────────────────── */

export type LeadGrade = "A" | "B" | "C" | "D";

export interface LeadScore {
  /** 0–100, deterministic from catalog/firmographics — computable at creation */
  fit: number;
  /** 0–100, behavioural + BANT + a recency decay */
  engagement: number;
  /** the 2×2 cell: A = fit≥60 & eng≥60 */
  grade: LeadGrade;
  computedAt: string;
}

/* ── activity timeline ───────────────────────────────────────────────────────── */

export const ACTIVITY_KINDS = [
  "inbound_message",
  "outbound_message",
  "call",
  "meeting",
  "note",
  "stage_change",
  "assignment",
  "field_change",
  "consent_change",
  "task",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export function isActivityKind(v: unknown): v is ActivityKind {
  return typeof v === "string" && (ACTIVITY_KINDS as readonly string[]).includes(v);
}

export interface ActivityActor {
  type: "user" | "twin" | "connector" | "system";
  id?: string;
}

export interface Activity {
  id: string;
  /** ISO timestamp */
  at: string;
  kind: ActivityKind;
  actor: ActivityActor;
  /** one-line summary rendered in the timeline */
  summary: string;
  /** full text, subject to the connector's `bodyRetention` policy */
  body?: string;
  /** e.g. { twinDraftId, leadEventId, dealId, from, to } */
  refs?: Record<string, string>;
}

/* ── company (optional; materialised only when known) ────────────────────────── */

export interface Company {
  id: string;
  projectId: string;
  name: string;
  /** Czech company registration number — the best natural key we have */
  ico?: string;
  dic?: string;
  domain?: string;
  size?: "solo" | "small" | "mid" | "large";
  createdAt: string;
  updatedAt: string;
}

/* ── the contact = the collapsed Lead/Contact ────────────────────────────────── */

export interface Contact {
  id: string;
  projectId: string;

  // identity (raw, for display)
  name?: string;
  email?: string;
  phone?: string;
  companyId?: string;
  /** denormalised for list rendering */
  companyName?: string;

  // coarse location — ADDITIVE and optional. A lead's geography is the one
  // aggregate a local/leadgen operator asks for that stage and source cannot
  // answer ("where is the demand"), and it is cheap to carry when a connector
  // happens to know it. Nothing derives one; a contact without them simply does
  // not appear in the regional breakdown (see summary.ts), which is honest.
  city?: string;
  postalCode?: string;
  /** free-form region/kraj label when the source supplies one */
  region?: string;

  // identity (normalised, for dedup — never displayed)
  /** normalizeEmail(email) */
  emailKey?: string;
  /** normalizePhone(phone) → E.164 */
  phoneKey?: string;
  /** normalizeForSearch(name) — FUZZY SUGGESTION ONLY, never an auto-merge key */
  nameKey?: string;

  // lifecycle
  stage: PipelineStage;
  stageEnteredAt: string;
  lostReason?: LostReason;
  lostNote?: string;

  // ownership + SLA
  ownerId?: string;
  assignedAt?: string;
  assignmentReason?: "manual" | "round_robin" | "rule" | "unassigned";
  /** firstSeenAt + the project's responseTargetMinutes — the work queue's clock */
  slaDueAt?: string;
  firstRespondedAt?: string;

  attribution: Attribution;
  score?: LeadScore;

  /** which twin channel this person is reachable on (bridges to twin drafts) */
  preferredChannel?: TwinChannel;

  consent: ConsentRecord[];
  /** GDPR retention sweep target */
  retainUntil?: string;

  /** merge bookkeeping — auto-merge must be reversible */
  mergedFrom?: string[];

  tags: string[];
  notes?: string;

  firstSeenAt: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;

  /** GDPR Art. 17 TOMBSTONE. When set, every PII field above has been hard-cleared
   *  and only the anonymous funnel skeleton (stage, attribution, timestamps)
   *  survives — Art. 17 does not require destroying anonymous statistics, and
   *  silently changing historic funnel counts would be the dishonest alternative.
   *  A tombstoned contact must never be rendered as a person. */
  erasedAt?: string;
  eraseReason?: string;
}

export function isErased(c: Contact): boolean {
  return typeof c.erasedAt === "string" && c.erasedAt.length > 0;
}

/** Timeline is stored beside the contact, capped; the raw `LeadEvent` archive is
 *  kept separately (mirrors twin/archive-store.ts splitting a hot blob from a cold
 *  archive). */
export const ACTIVITY_CAP = 500;

export interface ContactTimeline {
  contactId: string;
  items: Activity[];
  updatedAt: string;
}

/* ── deal (optional; only where money is tracked) ────────────────────────────── */

export interface Deal {
  id: string;
  projectId: string;
  contactId: string;
  title: string;
  /** CZK */
  value?: number;
  currency: "CZK";
  stage: PipelineStage;
  expectedCloseAt?: string;
  closedAt?: string;
  lostReason?: LostReason;
  createdAt: string;
  updatedAt: string;
}

/* ── the connector's inbound unit ────────────────────────────────────────────── */

export const LEAD_EVENT_KINDS = ["message", "form_submission", "call", "row"] as const;
export type LeadEventKind = (typeof LEAD_EVENT_KINDS)[number];

export interface LeadEvent {
  id: string;
  projectId: string;
  connectorId: string;
  /** the id in the source system; `${connectorId}:${externalId}` is UNIQUE */
  externalId: string;
  kind: LeadEventKind;
  occurredAt: string;
  /** best-effort identity extracted by the connector's normaliser */
  identity: { name?: string; email?: string; phone?: string; handle?: string };
  text?: string;
  attribution: Partial<Attribution>;
  /** untouched provider payload, retained per the connection's bodyRetention */
  raw?: unknown;
  receivedAt: string;
  /** processing outcome — replayable */
  status: "pending" | "applied" | "duplicate" | "failed";
  error?: string;
  /** set once applied — which contact the event landed on */
  contactId?: string;
}

/** The unique idempotency key. This — and only this — is what makes polling safely
 *  re-runnable and webhook retries harmless (Meta retries for an undocumented
 *  window, LinkedIn is at-least-once). Pure. */
export function dedupKey(connectorId: string, externalId: string): string {
  return `${connectorId}:${externalId}`;
}

/* ── honest bounds, mirroring lead-quality/types.ts ──────────────────────────── */

/** Max contacts per project. Row-based storage means this is a policy ceiling, not
 *  a document-size cliff — but an unbounded archive still deserves a stated bound. */
export const CONTACT_CAP = 20_000;
export const NAME_MAX = 200;
export const EMAIL_MAX = 320;
export const PHONE_MAX = 40;
export const NOTE_MAX = 4_000;
export const TAG_MAX = 40;
export const TAGS_CAP = 20;
export const SUMMARY_MAX = 240;
export const BODY_MAX = 8_000;
/** Max raw events kept per project before oldest-first eviction. */
export const EVENT_CAP = 20_000;

/** Clamp + trim a free-text field to its bound. Pure; `undefined` in → `undefined`. */
export function clampText(v: string | undefined | null, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

/** Sanitise a tag list: trimmed, deduped, bounded in both item length and count. */
export function clampTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    const t = clampText(typeof raw === "string" ? raw : undefined, TAG_MAX);
    if (!t) continue;
    if (out.includes(t)) continue;
    out.push(t);
    if (out.length >= TAGS_CAP) break;
  }
  return out;
}
