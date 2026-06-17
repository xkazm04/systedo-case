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
