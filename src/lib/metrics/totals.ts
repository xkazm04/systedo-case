/** Period totals: sum the raw additive metrics and derive the ratios. Plus the
 *  relative-change helper used everywhere deltas are computed. */

import type { DailyPoint, RawMetric } from "../types";
import { aov, cr, pno, roas } from "./ratios";

export interface Totals {
  visits: number;
  cost: number;
  conversions: number;
  revenue: number;
  /** podíl nákladů na obratu = cost / revenue */
  pno: number;
  /** average order value = revenue / conversions */
  aov: number;
  /** conversion rate = conversions / visits */
  cr: number;
  /** return on ad spend = revenue / cost */
  roas: number;
}

const EMPTY: Pick<Totals, RawMetric> = { visits: 0, cost: 0, conversions: 0, revenue: 0 };

/** Relative change (fraction), guarding a zero/absent baseline. */
export const rel = (cur: number, prev: number): number => (prev > 0 ? (cur - prev) / prev : 0);

/** Sum the raw additive metrics and derive the ratios. */
export function totalsOf(points: DailyPoint[]): Totals {
  const sum = points.reduce(
    (a, p) => ({
      visits: a.visits + p.visits,
      cost: a.cost + p.cost,
      conversions: a.conversions + p.conversions,
      revenue: a.revenue + p.revenue,
    }),
    { ...EMPTY }
  );
  return {
    ...sum,
    pno: pno(sum.cost, sum.revenue),
    aov: aov(sum.revenue, sum.conversions),
    cr: cr(sum.conversions, sum.visits),
    roas: roas(sum.revenue, sum.cost),
  };
}
