/** Direction 1 — the loop actually closes. A persisted diagnosis records an
 *  at-diagnosis KEY-METRIC snapshot (DiagnosisSnapshot); at render time the CURRENT
 *  value of the SAME key metric is re-derived from the (already re-computed) page
 *  data and compared, so the operator sees whether the diagnosed problem actually
 *  improved — not just that a status was flipped to "resolved".
 *
 *  The snapshot is extracted from the SERVER-rebuilt request (the tamper-proof
 *  numbers Direction 1 already re-derives), so it can never be forged by the client.
 *  The metric per kind is chosen from what the shared request builders already
 *  compute:
 *    - cohort      → the worst cohort's LTV:CAC  (lowest ltvCac across cohorts —
 *                    the deterministic "worst" the demo/normalizer already pick)
 *    - lead-source → the source's qualification rate (qualRate)
 *    - ads         → portfolio PNO (cost share of revenue) — the ONE metric where
 *                    LOWER is better, so the comparison inverts it explicitly.
 *    - local       → overall coverage %  (coveragePct — closing the worst gap raises it)
 *  HIGHER is better for all but `pno`, which INVERSE_METRIC_KEYS flips.
 *
 *  Pure — no I/O, no framework — so the extraction + comparison are unit-testable in
 *  isolation. Imports only the client-safe request/snapshot contracts from ai-types. */
import type {
  AdsDiagnosisRequest,
  CohortDiagnosisRequest,
  DiagnosisMetricKey,
  DiagnosisSnapshot,
  LeadSourceDiagnosisRequest,
  LocalDiagnosisRequest,
} from "../ai-types";
import type { DiagnosisKind, StoredDiagnosis } from "./types";

// --------------------------------------------------------------------------
// Snapshot extraction — from the SERVER-rebuilt request (never the wire).
// --------------------------------------------------------------------------

/** The worst cohort's LTV:CAC (lowest ratio) — the metric a cohort diagnosis is
 *  about. Null when there are no cohorts (nothing to snapshot). */
export function extractCohortSnapshot(req: CohortDiagnosisRequest): DiagnosisSnapshot | null {
  if (!req.cohorts || req.cohorts.length === 0) return null;
  const worst = req.cohorts.reduce((w, c) => (c.ltvCac < w.ltvCac ? c : w), req.cohorts[0]!);
  return { key: "ltvCac", metric: worst.ltvCac };
}

/** The diagnosed source's qualification rate — higher is better. */
export function extractLeadSourceSnapshot(req: LeadSourceDiagnosisRequest): DiagnosisSnapshot {
  return { key: "qualRate", metric: req.qualRate };
}

/** Overall coverage % — now GENUINELY movable (D1): coveragePct is derived from the
 *  resolved coverage matrix (live page-presence over the seed), so publishing a page
 *  for the worst gap — via the CSV import or a matrix toggle — actually raises it, and
 *  the outcome chip reflects real progress instead of a snapshot==current constant. */
export function extractLocalSnapshot(req: LocalDiagnosisRequest): DiagnosisSnapshot {
  return { key: "coverage", metric: req.coveragePct };
}

/** The paid portfolio's PNO (cost share of revenue) at diagnosis time — LOWER is
 *  better, which `compareOutcome` handles through INVERSE_METRIC_KEYS. Acting on the
 *  diagnosed waste moves it down, so the outcome chip reflects real progress. Null
 *  when the request carries no usable portfolio total (nothing to snapshot), like
 *  the cohort extractor — a missing baseline means no chip, never a fabricated one. */
export function extractAdsSnapshot(req: AdsDiagnosisRequest): DiagnosisSnapshot | null {
  const pno = req.totals?.pno;
  return typeof pno === "number" && Number.isFinite(pno) ? { key: "pno", metric: pno } : null;
}

// --------------------------------------------------------------------------
// Outcome comparison — snapshot (at-diagnosis) vs current (re-derived at render).
// --------------------------------------------------------------------------

export type OutcomeStatus = "improved" | "unchanged" | "worse";

export interface OutcomeVerdict {
  status: OutcomeStatus;
  /** signed RELATIVE change vs the snapshot (e.g. +0.12 = +12 %); 0 when unchanged
   *  from a zero baseline. The chip renders it as a signed percent for improved/worse. */
  deltaPct: number;
}

/** The snapshot metrics where a FALL is the improvement. Every other key reads
 *  "higher is better"; PNO (cost share of revenue) is the one that does not, so the
 *  VERDICT inverts for it. The reported `deltaPct` is deliberately NOT inverted — it
 *  always states what the tracked metric itself did (a PNO that fell 20 % reads
 *  "improved −20 %"), because a sign-flipped number beside the word "improved"
 *  would claim the metric rose. */
export const INVERSE_METRIC_KEYS: ReadonlySet<DiagnosisMetricKey> = new Set<DiagnosisMetricKey>([
  "pno",
]);

/** The relative band within which a metric counts as UNCHANGED. A move must clear
 *  ±5 % (relative) to read as improved / worse — a deterministic dead-band so tiny
 *  wiggles don't flip the chip. */
export const OUTCOME_THRESHOLD = 0.05;

/** Compare a stored snapshot to the current metric value. Returns null (no chip)
 *  when there is no snapshot (a pre-Direction-1 record) or no current value (the
 *  subject no longer exists / isn't derivable). Higher is better for every metric
 *  except the INVERSE_METRIC_KEYS (PNO), where the verdict — but not the reported
 *  delta — is flipped. Backward-tolerant by design. */
export function compareOutcome(
  snapshot: DiagnosisSnapshot | undefined | null,
  current: number | undefined | null
): OutcomeVerdict | null {
  if (!snapshot || current == null || !Number.isFinite(current)) return null;
  const base = snapshot.metric;
  if (!Number.isFinite(base)) return null;
  // Relative delta against the snapshot. When the baseline is 0 (or negative), fall
  // back to a sign comparison so we still classify honestly instead of dividing by 0.
  const delta =
    base !== 0
      ? (current - base) / Math.abs(base)
      : current > 0
        ? 1
        : current < 0
          ? -1
          : 0;
  // For an inverse metric a FALL is the improvement: the direction of the VERDICT
  // flips, the reported delta does not (see INVERSE_METRIC_KEYS).
  const good = INVERSE_METRIC_KEYS.has(snapshot.key) ? -delta : delta;
  if (good >= OUTCOME_THRESHOLD) return { status: "improved", deltaPct: delta };
  if (good <= -OUTCOME_THRESHOLD) return { status: "worse", deltaPct: delta };
  return { status: "unchanged", deltaPct: delta };
}

/** Direction 1 — the "already handled" guard. True when a NEW diagnosis run's subject
 *  matches a RESOLVED diagnosis of the same kind whose key metric is UNCHANGED since
 *  it was resolved — i.e. the operator is about to be told "news" about something they
 *  already closed and which hasn't moved. Display-only (the panel shows a note); it
 *  never blocks the run. `currentFor` supplies the current metric for a stored
 *  diagnosis (so this stays pure and testable). */
export function alreadyResolvedUnchanged(
  history: StoredDiagnosis[],
  kind: DiagnosisKind,
  subject: string,
  currentFor: (d: StoredDiagnosis) => number | undefined | null
): boolean {
  return history.some(
    (d) =>
      d.kind === kind &&
      d.status === "resolved" &&
      d.subject === subject &&
      compareOutcome(d.snapshot, currentFor(d))?.status === "unchanged"
  );
}
