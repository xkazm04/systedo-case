/** Period totals: sum the raw additive metrics and derive the ratios. Plus the
 *  relative-change helper used everywhere deltas are computed. */

import type { DailyPoint, RawMetric } from "../types";
import { aov, cpc, cr, ctr, pno, roas } from "./ratios";

export interface Totals {
  visits: number;
  cost: number;
  conversions: number;
  revenue: number;
  /** paid ad impressions (0 when the dataset doesn't carry the paid-traffic pair) */
  impressions: number;
  /** paid ad clicks (0 when the dataset doesn't carry the paid-traffic pair) */
  clicks: number;
  /** podíl nákladů na obratu = cost / revenue */
  pno: number;
  /** average order value = revenue / conversions */
  aov: number;
  /** conversion rate = conversions / visits */
  cr: number;
  /** return on ad spend = revenue / cost */
  roas: number;
  /** click-through rate = clicks / impressions (0 without the paid-traffic pair) */
  ctr: number;
  /** cost per click = cost / clicks (0 without the paid-traffic pair) */
  cpc: number;
}

const EMPTY: Pick<Totals, RawMetric | "impressions" | "clicks"> = {
  visits: 0,
  cost: 0,
  conversions: 0,
  revenue: 0,
  impressions: 0,
  clicks: 0,
};

/** Relative change (fraction), guarding a zero/absent baseline. */
export const rel = (cur: number, prev: number): number => (prev > 0 ? (cur - prev) / prev : 0);

/** Sum the raw additive metrics and derive the ratios. The optional paid-traffic
 *  pair sums with a graceful 0 fallback, so its derived ratios (CTR/CPC) simply
 *  read 0 for a dataset that never measured it. */
export function totalsOf(points: DailyPoint[]): Totals {
  const sum = points.reduce(
    (a, p) => ({
      visits: a.visits + p.visits,
      cost: a.cost + p.cost,
      conversions: a.conversions + p.conversions,
      revenue: a.revenue + p.revenue,
      impressions: a.impressions + (p.impressions ?? 0),
      clicks: a.clicks + (p.clicks ?? 0),
    }),
    { ...EMPTY }
  );
  return {
    ...sum,
    pno: pno(sum.cost, sum.revenue),
    aov: aov(sum.revenue, sum.conversions),
    cr: cr(sum.conversions, sum.visits),
    roas: roas(sum.revenue, sum.cost),
    ctr: ctr(sum.clicks, sum.impressions),
    cpc: cpc(sum.cost, sum.clicks),
  };
}
