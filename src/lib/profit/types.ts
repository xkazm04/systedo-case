/** Profit / POAS domain — margin-aware view over the channel mix. Framework-free.
 *  The killer idea: optimize for profit on ad spend (POAS), not ROAS, by applying
 *  a per-channel gross margin so channels that look fine on ROAS but lose money
 *  after cost of goods are surfaced. */

export interface ChannelMargin {
  channel: string;
  /** gross margin as a fraction of revenue (0..1) */
  marginPct: number;
}

export interface ProfitRow {
  channel: string;
  color: string;
  revenue: number;
  cost: number;
  roas: number;
  marginPct: number;
  /** revenue × margin */
  grossProfit: number;
  /** grossProfit − ad spend */
  netProfit: number;
  /** grossProfit / ad spend */
  poas: number;
  /** the ROAS at which a channel breaks even given its margin (= 1 / margin) */
  breakEvenRoas: number;
  /** netProfit ≥ 0 — not roas ≥ breakEvenRoas, so a zero-cost channel isn't a
   *  false loss (see computeMarginRow in profit/compute.ts) */
  profitable: boolean;
}

export interface ProfitSummary {
  revenue: number;
  cost: number;
  grossProfit: number;
  netProfit: number;
  roas: number;
  poas: number;
  /** revenue-weighted blended margin */
  blendedMargin: number;
  /** channels that are profitable on ROAS but lose money after margin */
  unprofitableCount: number;
}

// --- #3 Profit & POAS trend over time ---------------------------------------

/** One bucketed window of the daily series, with the margin model already
 *  applied so the trend line plots net profit and POAS over time. */
export interface ProfitTrendPoint {
  /** ISO date of the bucket start (YYYY-MM-DD) */
  date: string;
  /** human label for the bucket ("2026-05", "t. 21") */
  label: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  netProfit: number;
  /** grossProfit / cost (POAS) for the window */
  poas: number;
  /** false when this is a partial calendar-month bucket (the current month, before
   *  it ends). trendDelta skips such buckets so a mid-month value with ~1/3 the days
   *  can't fake a net-profit/POAS collapse. Undefined (treated as complete) for weekly. */
  complete?: boolean;
}

export type TrendGranularity = "week" | "month";

// --- #5 Overhead allocation -------------------------------------------------

/** Režijní náklady model: a monthly fixed overhead spread across channels by
 *  revenue share, plus a per-order fulfilment cost charged on each conversion.
 *  Turns gross-margin POAS into a true contribution-margin POAS. */
export interface OverheadOptions {
  /** whether the overhead adjustment is applied at all */
  enabled: boolean;
  /** fixed monthly overhead in Kč (rent, salaries, tooling) */
  monthlyOverhead: number;
  /** variable fulfilment cost per order/conversion in Kč */
  perOrderCost: number;
  /** number of whole months the analysed window spans, so the monthly overhead
   *  is scaled to the period before being allocated */
  months: number;
}

/** A ProfitRow with overhead allocated on top — the contribution-margin view. */
export interface OverheadRow extends ProfitRow {
  /** number of orders/conversions attributed to the channel */
  conversions: number;
  /** share of the monthly overhead allocated to this channel (by revenue) */
  allocatedOverhead: number;
  /** perOrderCost × conversions */
  fulfilmentCost: number;
  /** grossProfit − allocatedOverhead − fulfilmentCost */
  contributionProfit: number;
  /** contributionProfit ≥ cost — the single "profitable once overhead is loaded
   *  in" verdict the unprofitableCount and the row colour both read */
  contributionProfitable: boolean;
  /** contributionProfit / cost — the overhead-adjusted POAS */
  contributionPoas: number;
  /** the ROAS at which the channel breaks even once overhead is loaded in */
  adjustedBreakEvenRoas: number;
}

export interface OverheadSummary {
  totalOverhead: number;
  totalFulfilment: number;
  contributionProfit: number;
  /** contributionProfit / cost across the portfolio */
  contributionPoas: number;
  /** channels unprofitable once overhead is loaded in */
  unprofitableCount: number;
}

// --- #4 Margin scenarios ----------------------------------------------------

/** A named, saved set of per-channel margins the user can reload and compare. */
export interface MarginScenario {
  id: string;
  name: string;
  margins: ChannelMargin[];
  /** epoch millis the scenario was saved (for ordering; injected, never read in render) */
  savedAt: number;
}

// --- #2 Product / category margin breakdown ---------------------------------

/** A product category in the dataset: its share of revenue and its cost of
 *  goods (as a fraction of revenue) → a per-category gross margin. */
export interface ProductCategory {
  category: string;
  color: string;
  /** fraction of total revenue this category represents (0..1) */
  revenueShare: number;
  /** cost of goods as a fraction of category revenue (0..1) */
  cogsPct: number;
}

/** A product/category-level profit row. Mirrors ProfitRow's profit fields but is
 *  keyed by `category` and derives its margin from cost of goods rather than a
 *  user-set channel margin. Ad cost is allocated by revenue share. */
export interface ProductRow {
  category: string;
  color: string;
  revenue: number;
  /** ad cost allocated to the category by revenue share */
  cost: number;
  revenueShare: number;
  /** 1 − cogsPct */
  marginPct: number;
  /** revenue × margin */
  grossProfit: number;
  /** grossProfit − allocated ad cost */
  netProfit: number;
  /** grossProfit / allocated ad cost */
  poas: number;
  breakEvenRoas: number;
  roas: number;
  profitable: boolean;
}

export interface ProductSummary {
  revenue: number;
  cost: number;
  grossProfit: number;
  netProfit: number;
  poas: number;
  blendedMargin: number;
  unprofitableCount: number;
}

/** Strategy for the budget-reallocation simulator.
 *  - `max-profit`: greedily push budget to the highest marginal-profit channels.
 *  - `hold-revenue`: protect total revenue — only drain a channel into a more
 *    profitable one when revenue (held via ROAS) does not fall. */
export type ReallocStrategy = "max-profit" | "hold-revenue";

export interface ReallocOptions {
  /** total budget to distribute (default = current total cost) */
  totalBudget?: number;
  /** allocation strategy (default = "max-profit") */
  strategy?: ReallocStrategy;
  /** cap a channel's suggested spend at this multiple of its current spend
   *  (default 3). A channel with zero current spend is capped at 0. */
  maxSpendMultiple?: number;
}

/** One channel's before/after spend in a reallocation plan. */
export interface ReallocChannel {
  channel: string;
  color: string;
  roas: number;
  marginPct: number;
  /** marginal net profit per koruna of spend = roas × margin − 1 */
  marginalProfit: number;
  currentSpend: number;
  suggestedSpend: number;
  /** suggestedSpend − currentSpend */
  spendDelta: number;
  /** suggestedSpend × roas */
  projectedRevenue: number;
  /** projectedRevenue × margin − suggestedSpend */
  projectedNetProfit: number;
}

export interface ReallocPlan {
  rows: ReallocChannel[];
  totalBudget: number;
  /** sum of suggested spend actually allocated (≤ totalBudget) */
  allocatedSpend: number;
  currentRevenue: number;
  projectedRevenue: number;
  currentNetProfit: number;
  projectedNetProfit: number;
  /** projectedNetProfit − currentNetProfit */
  profitDelta: number;
}
