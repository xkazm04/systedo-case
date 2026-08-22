/** The work queue's clock — pure, no React, no store, no `Date.now()` of its own.
 *
 *  Reuses the SHAPE `speed-lead/useLeadSla.ts` established (a phase per row, a
 *  breached-first sort, an analytics band) but reads real `Contact` timestamps
 *  instead of the hardcoded `InboundLead` constants: `firstSeenAt` is the arrival,
 *  `slaDueAt` the deadline the store wrote (falling back to arrival + the target),
 *  and `firstRespondedAt` settles the row. A settled row can never be overdue.
 *
 *  Pure so the numbers in the analytics band are testable and so the module can
 *  re-derive everything from one clock tick. */
import { PIPELINE_RANK, isTerminalStage, type Contact, type LeadGrade } from "./types";

/** Minutes we promise ourselves to answer a new enquiry in. Deliberately NOT
 *  `speed-lead`'s 5 min: that module simulates a live phone-desk drill, this one
 *  is the day's work queue and the mock's band states the goal as 15 minutes. */
export const LEAD_SLA_TARGET_MIN = 15;
const MIN_MS = 60_000;

export type SlaPhase = "ontrack" | "warning" | "breached" | "settled";

/** ≤ this share of the target left → the pre-breach warning state. */
const WARNING_RATIO = 0.35;

export interface ContactSla {
  phase: SlaPhase;
  /** whole minutes left until the deadline; negative once breached */
  remainingMin: number;
  dueAt: number;
}

/** The deadline for a contact: what the store wrote, else arrival + the target. */
export function slaDueMs(c: Contact): number {
  const explicit = c.slaDueAt ? Date.parse(c.slaDueAt) : NaN;
  if (Number.isFinite(explicit)) return explicit;
  const seen = Date.parse(c.firstSeenAt);
  return (Number.isFinite(seen) ? seen : Date.now()) + LEAD_SLA_TARGET_MIN * MIN_MS;
}

export function contactSla(c: Contact, nowMs: number): ContactSla {
  const dueAt = slaDueMs(c);
  const remainingMin = Math.round((dueAt - nowMs) / MIN_MS);
  if (c.firstRespondedAt) return { phase: "settled", remainingMin, dueAt };
  const targetMs = LEAD_SLA_TARGET_MIN * MIN_MS;
  const phase: SlaPhase =
    dueAt - nowMs < 0
      ? "breached"
      : dueAt - nowMs <= targetMs * WARNING_RATIO
        ? "warning"
        : "ontrack";
  return { phase, remainingMin, dueAt };
}

/** Does this contact belong in the "handle now" queue? Everything still awaiting a
 *  first reply and not parked in a terminal stage — an answered lead has left the
 *  queue even if it is still open, and a lost one is not work. */
export function isQueued(c: Contact): boolean {
  return !c.firstRespondedAt && !isTerminalStage(c.stage);
}

const GRADE_ORDER: Record<LeadGrade, number> = { A: 0, B: 1, C: 2, D: 3 };

/** Queue order: deadline first (the thing that is actually being lost), then grade
 *  — an A and a D both 3 minutes from breach are not equally expensive to drop. */
export function sortQueue(contacts: readonly Contact[]): Contact[] {
  return [...contacts].sort((a, b) => {
    const d = slaDueMs(a) - slaDueMs(b);
    if (d !== 0) return d;
    const g = GRADE_ORDER[a.score?.grade ?? "D"] - GRADE_ORDER[b.score?.grade ?? "D"];
    if (g !== 0) return g;
    return PIPELINE_RANK[a.stage] - PIPELINE_RANK[b.stage];
  });
}

/** How many rows the urgent queue will ever show. The queue is NOT "every open
 *  lead ranked" — a thousand-row ranked list is a database view wearing a to-do
 *  list's clothes. It is the short, finishable set whose clock is running:
 *  breached, warning, or due inside the target window. */
export const URGENT_QUEUE_CAP = 50;

/** The urgent subset, ordered and capped. `overflow` is how many more qualified
 *  than the cap could show — surfaced rather than silently dropped. */
export function urgentQueue(
  contacts: readonly Contact[],
  nowMs: number,
  cap: number = URGENT_QUEUE_CAP
): { rows: Contact[]; overflow: number } {
  // Everything still awaiting a first reply has a running clock by construction
  // (breached, warning, or inside the target window); the CAP — not a phase
  // filter — is what keeps this a finishable list instead of a second database.
  const sorted = sortQueue(contacts.filter(isQueued).filter((c) => Number.isFinite(contactSla(c, nowMs).dueAt)));
  return { rows: sorted.slice(0, cap), overflow: Math.max(0, sorted.length - cap) };
}

export interface QueueAnalytics {
  /** median minutes from arrival to first reply, over contacts that HAVE replied */
  medianResponseMin: number | null;
  /** share of replied contacts answered before the deadline (0–1), null when none */
  withinSlaRatio: number | null;
  /** open, unanswered contacts */
  waiting: number;
  /** of those, past the deadline */
  breached: number;
  /** contacts first seen in the last 7 days */
  weekLeads: number;
  weekQualified: number;
  weekWon: number;
}

const WEEK_MS = 7 * 24 * 3_600_000;

/** The four band figures, all derived from the SAME contact set the rows render —
 *  never a separate sample, so a tile can't disagree with the list under it. */
export function queueAnalytics(contacts: readonly Contact[], nowMs: number): QueueAnalytics {
  const responses: number[] = [];
  let withinSla = 0;
  let waiting = 0;
  let breached = 0;
  let weekLeads = 0;
  let weekQualified = 0;
  let weekWon = 0;

  for (const c of contacts) {
    const seen = Date.parse(c.firstSeenAt);
    if (Number.isFinite(seen) && nowMs - seen <= WEEK_MS) {
      weekLeads += 1;
      if (PIPELINE_RANK[c.stage] >= PIPELINE_RANK.qualified) weekQualified += 1;
      if (c.stage === "won") weekWon += 1;
    }
    const responded = c.firstRespondedAt ? Date.parse(c.firstRespondedAt) : NaN;
    if (Number.isFinite(responded) && Number.isFinite(seen)) {
      responses.push((responded - seen) / MIN_MS);
      if (responded <= slaDueMs(c)) withinSla += 1;
      continue;
    }
    if (!isQueued(c)) continue;
    waiting += 1;
    if (contactSla(c, nowMs).phase === "breached") breached += 1;
  }

  return {
    medianResponseMin: median(responses),
    withinSlaRatio: responses.length > 0 ? withinSla / responses.length : null,
    waiting,
    breached,
    weekLeads,
    weekQualified,
    weekWon,
  };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
