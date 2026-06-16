/** Shared ratio primitives. The divide-guard plus the named marketing ratios,
 *  expressed generically so both the dashboard analytics (revenue/visits naming)
 *  and the Google-Ads campaign domain (conversionValue/clicks naming) compute the
 *  exact same numbers from one source of truth — every helper is just `safe(...)`
 *  with a name, so there is no behavioural difference vs the formulas inlined before. */

/** Divide guarding a zero/absent denominator. */
export const safe = (num: number, den: number): number => (den > 0 ? num / den : 0);

/** return on ad spend = value / cost */
export const roas = (value: number, cost: number): number => safe(value, cost);

/** cost share of revenue (PNO) = cost / value */
export const pno = (cost: number, value: number): number => safe(cost, value);

/** average order value = value / conversions */
export const aov = (value: number, conversions: number): number => safe(value, conversions);

/** conversion rate = conversions / denom (visits for the dashboard, clicks for campaigns) */
export const cr = (conversions: number, denom: number): number => safe(conversions, denom);

/** cost per acquisition = cost / conversions */
export const cpa = (cost: number, conversions: number): number => safe(cost, conversions);

/** cost per click = cost / clicks */
export const cpc = (cost: number, clicks: number): number => safe(cost, clicks);

/** click-through rate = clicks / impressions */
export const ctr = (clicks: number, impressions: number): number => safe(clicks, impressions);
