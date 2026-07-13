/** Shared, server-usable builder for the cohort-diagnosis request. Extracted from
 *  LtvDiagnosisPanel so the SAME mapping (computed cohort rows → the REAL-numbers-
 *  only request the gate-tracked `cohort-diagnosis` tool reads) is reused by both
 *  the client panel (on click) and the weekly-digest cron (Direction 2) instead of
 *  the prompt-building logic being duplicated. Framework-free + pure; imports only
 *  the pure LTV compute types/helpers (client-safe). */
import type { CohortDiagnosisCohort, CohortDiagnosisRequest, TrendDirection } from "../ai-types";
import { cohortTrend, type CohortMetrics, type LtvSummary } from "../ltv/compute";

/** Project a computed cohort row down to the real numbers the model needs —
 *  including the per-channel breakdown and the retention/survival curve, so the
 *  diagnosis can point at the channel and read the decay shape, not only M3. */
export function toDiagnosisCohort(r: CohortMetrics): CohortDiagnosisCohort {
  const cohort: CohortDiagnosisCohort = {
    month: r.month,
    cac: r.cac,
    ltv: r.ltv,
    ltvCac: r.ltvCac,
    paybackMonth: r.paybackMonth,
    m3: r.m3,
    signups: r.signups,
    survival: r.survival,
    observedMonths: r.observedMonths,
  };
  if (r.channelMetrics.length > 0) {
    cohort.channels = r.channelMetrics.map((m) => ({
      channel: m.channel,
      cac: m.cac,
      ltvCac: m.ltvCac,
      paid: m.paid,
      signups: m.signups,
    }));
  }
  return cohort;
}

/** Build the cohort-diagnosis request from computed rows + the portfolio summary.
 *  Identical to the panel's former inline builder. */
export function buildCohortRequest(
  rows: CohortMetrics[],
  summary: LtvSummary,
  eshop: boolean
): CohortDiagnosisRequest {
  const trend: TrendDirection | undefined = cohortTrend(rows)?.direction;
  const req: CohortDiagnosisRequest = {
    cohorts: rows.map(toDiagnosisCohort),
    blendedCac: summary.blendedCac,
    avgLtvCac: summary.avgLtvCac,
    avgPayback: summary.avgPayback,
  };
  if (trend) req.trend = trend;
  if (eshop) req.eshop = true;
  return req;
}
