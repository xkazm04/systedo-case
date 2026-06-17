/** CAC / LTV / payback math over acquisition cohorts. Extrapolates the retention
 *  tail geometrically to a fixed horizon, then derives lifetime value, the
 *  LTV:CAC ratio and the payback month. Pure. */
import type { Cohort } from "./sample";

export const LTV_HORIZON = 12;

export interface CohortMetrics extends Cohort {
  cac: number;
  /** retained months M3 (for the table) */
  m3: number;
  ltv: number;
  ltvCac: number;
  /** 1-based month the cumulative revenue/user covers CAC, or null within horizon */
  paybackMonth: number | null;
}

export interface LtvSummary {
  signups: number;
  blendedCac: number;
  avgLtvCac: number;
  avgPayback: number | null;
}

/** Retention curve extended to `horizon` months by continuing the last observed
 *  month-over-month survival ratio (clamped to a sane band). */
function survivalCurve(retention: number[], horizon: number): number[] {
  const out = retention.slice(0, horizon);
  const n = retention.length;
  const ratio = n >= 2 ? Math.min(0.98, Math.max(0.8, retention[n - 1]! / retention[n - 2]!)) : 0.9;
  let last = retention[n - 1]!;
  for (let m = n; m < horizon; m++) {
    last *= ratio;
    out.push(last);
  }
  return out;
}

export function withMetrics(c: Cohort): CohortMetrics {
  const cac = c.signups > 0 ? c.spend / c.signups : 0;
  const survival = survivalCurve(c.retention, LTV_HORIZON);
  const ltv = survival.reduce((a, s) => a + s * c.arpu, 0);

  let cum = 0;
  let paybackMonth: number | null = null;
  for (let m = 0; m < survival.length; m++) {
    cum += survival[m]! * c.arpu;
    if (cum >= cac) {
      paybackMonth = m + 1;
      break;
    }
  }

  return { ...c, cac, m3: c.retention[3] ?? c.retention[c.retention.length - 1] ?? 0, ltv, ltvCac: cac > 0 ? ltv / cac : 0, paybackMonth };
}

export function ltvSummary(cohorts: Cohort[]): LtvSummary {
  const rows = cohorts.map(withMetrics);
  const signups = rows.reduce((a, r) => a + r.signups, 0);
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const paybacks = rows.map((r) => r.paybackMonth).filter((p): p is number => p != null);
  return {
    signups,
    blendedCac: signups > 0 ? spend / signups : 0,
    avgLtvCac: rows.length ? rows.reduce((a, r) => a + r.ltvCac, 0) / rows.length : 0,
    avgPayback: paybacks.length ? paybacks.reduce((a, p) => a + p, 0) / paybacks.length : null,
  };
}
