/** Funnel-consistency decomposition: split a period-over-period revenue move into
 *  the three multiplicative drivers of an e-shop funnel — traffic, conversion rate
 *  and average order value — so a headline "obrat +18 %" can say WHY. Pure math.
 *
 *  Identity: revenue = visits × CR × AOV, where CR = conversions/visits and
 *  AOV = revenue/conversions (visits × conversions/visits × revenue/conversions =
 *  revenue). Taking logs turns the product into a sum, so the log of the revenue
 *  move splits exactly into three additive contributions (an LMDI decomposition):
 *  ln(rev₁/rev₀) = ln(v₁/v₀) + ln(cr₁/cr₀) + ln(aov₁/aov₀). Each driver's share is
 *  its log-term over the total, and the three shares sum to exactly 1. */

import type { Totals } from "./totals";

/** One driver's contribution to a revenue move. */
export interface FunnelDriver {
  /** relative change of this factor over the period (fraction, e.g. +0.12) */
  change: number;
  /** signed share of the total (log) revenue move this factor explains; the three
   *  driver shares sum to 1, so 0.7 = "70 % of the move came from here" */
  share: number;
}

/** A revenue move attributed across the funnel's three multiplicative drivers. */
export interface FunnelAttribution {
  metric: "revenue";
  /** relative revenue change over the period (fraction) */
  totalChange: number;
  drivers: {
    /** site traffic (visits) */
    traffic: FunnelDriver;
    /** conversion rate (conversions / visits) */
    conversion: FunnelDriver;
    /** average order value (revenue / conversions) */
    aov: FunnelDriver;
  };
  /** the driver explaining the largest absolute share of the move */
  dominant: "traffic" | "conversion" | "aov";
}

/**
 * Decompose the revenue change from `previous` to `current` into its traffic /
 * conversion-rate / AOV drivers. Returns null when the decomposition is undefined
 * — any factor endpoint ≤ 0 (a log would be undefined) or a negligible move —
 * so callers on legacy/degenerate data silently get nothing rather than noise.
 */
export function decomposeRevenueMove(current: Totals, previous: Totals): FunnelAttribution | null {
  const v0 = previous.visits;
  const v1 = current.visits;
  const c0 = previous.conversions;
  const c1 = current.conversions;
  const r0 = previous.revenue;
  const r1 = current.revenue;
  // The log-decomposition needs strictly positive endpoints on every factor.
  if (!(v0 > 0 && v1 > 0 && c0 > 0 && c1 > 0 && r0 > 0 && r1 > 0)) return null;

  const lTotal = Math.log(r1 / r0);
  if (!(Math.abs(lTotal) > 1e-9)) return null; // a flat period has nothing to attribute

  const cr0 = c0 / v0;
  const cr1 = c1 / v1;
  const aov0 = r0 / c0;
  const aov1 = r1 / c1;

  const lTraffic = Math.log(v1 / v0);
  const lConversion = Math.log(cr1 / cr0);
  const lAov = Math.log(aov1 / aov0);

  const drivers = {
    traffic: { change: v1 / v0 - 1, share: lTraffic / lTotal },
    conversion: { change: cr1 / cr0 - 1, share: lConversion / lTotal },
    aov: { change: aov1 / aov0 - 1, share: lAov / lTotal },
  };

  const dominant = (
    [
      ["traffic", lTraffic],
      ["conversion", lConversion],
      ["aov", lAov],
    ] as const
  ).reduce((best, cur) => (Math.abs(cur[1]) > Math.abs(best[1]) ? cur : best))[0];

  return { metric: "revenue", totalChange: r1 / r0 - 1, drivers, dominant };
}
