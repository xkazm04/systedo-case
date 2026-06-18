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
  /** roas ≥ breakEvenRoas */
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
