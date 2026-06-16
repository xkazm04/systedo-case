/** Marketing-campaign domain model. A campaign mirrors a Google Ads campaign:
 *  one advertising-channel type, a status and aggregated performance metrics over
 *  the synced period. Kept framework-free (no React, no DB, no formatting) so it
 *  is shared by the connector, the SQLite store, the AI evaluation and the UI. */

import { cpa, cpc, cr, ctr, pno, roas } from "@/lib/metrics/ratios";

// --- advertising channel types ----------------------------------------------

export const CAMPAIGN_TYPES = [
  "search",
  "performance_max",
  "shopping",
  "display",
  "demand_gen",
  "video",
] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  search: "Search",
  performance_max: "Performance Max",
  shopping: "Shopping",
  display: "Display",
  demand_gen: "Demand Gen",
  video: "Video",
};

/** One stable colour per type, drawn from the design tokens, so the by-type
 *  breakdown and the table dots always agree. */
export const CAMPAIGN_TYPE_COLORS: Record<CampaignType, string> = {
  search: "#14b8b1",
  performance_max: "#1f8f88",
  shopping: "#2dd4ce",
  display: "#fb7141",
  demand_gen: "#f59e0b",
  video: "#15324b",
};

export const CAMPAIGN_STATUSES = ["enabled", "paused"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  enabled: "Aktivní",
  paused: "Pozastavená",
};

// --- periods ----------------------------------------------------------------

export const CAMPAIGN_PERIODS = ["7d", "30d", "90d"] as const;
export type CampaignPeriod = (typeof CAMPAIGN_PERIODS)[number];

export const CAMPAIGN_PERIOD_LABELS: Record<CampaignPeriod, string> = {
  "7d": "7 dní",
  "30d": "30 dní",
  "90d": "90 dní",
};

export const CAMPAIGN_PERIOD_DAYS: Record<CampaignPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function isCampaignPeriod(v: unknown): v is CampaignPeriod {
  return typeof v === "string" && (CAMPAIGN_PERIODS as readonly string[]).includes(v);
}

// --- target (agreed with the client) ----------------------------------------

/** Target cost share of revenue (PNO) for the paid portfolio. A touch looser
 *  than the blended dashboard goal (15 %) because the campaign mix includes
 *  prospecting. Used to colour ROAS / PNO and to score campaigns. */
export const TARGET_PNO = 0.18;
/** Equivalent target ROAS (≈ 5.6×). */
export const TARGET_ROAS = 1 / TARGET_PNO;

// --- the model ---------------------------------------------------------------

/** Raw, additive metrics — exactly what the Ads connector returns and what the
 *  SQLite store persists. */
export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  impressions: number;
  clicks: number;
  /** media spend, CZK */
  cost: number;
  conversions: number;
  /** value of conversions = revenue attributed to the campaign, CZK */
  conversionValue: number;
}

/** One day of portfolio totals — the date-segmented series behind the trend
 *  chart. Summed across campaigns at the source (the per-campaign sync is
 *  date-aggregated and so can't produce a series). */
export interface DailyPoint {
  /** YYYY-MM-DD */
  date: string;
  /** media spend, CZK */
  cost: number;
  conversions: number;
  /** value of conversions, CZK */
  conversionValue: number;
}

/** Ratios derived from the raw metrics — never stored, always recomputed so the
 *  table, the by-type breakdown and the totals can never drift apart. */
export interface CampaignMetrics {
  /** click-through rate = clicks / impressions */
  ctr: number;
  /** cost per click = cost / clicks */
  cpc: number;
  /** cost per acquisition = cost / conversions */
  cpa: number;
  /** return on ad spend = conversionValue / cost */
  roas: number;
  /** cost share of revenue = cost / conversionValue */
  pno: number;
  /** conversion rate = conversions / clicks */
  convRate: number;
}

export type CampaignRow = Campaign & CampaignMetrics;

export function deriveMetrics(c: Pick<Campaign, "impressions" | "clicks" | "cost" | "conversions" | "conversionValue">): CampaignMetrics {
  return {
    ctr: ctr(c.clicks, c.impressions),
    cpc: cpc(c.cost, c.clicks),
    cpa: cpa(c.cost, c.conversions),
    roas: roas(c.conversionValue, c.cost),
    pno: pno(c.cost, c.conversionValue),
    convRate: cr(c.conversions, c.clicks),
  };
}

export function withMetrics(c: Campaign): CampaignRow {
  return { ...c, ...deriveMetrics(c) };
}

// --- aggregation -------------------------------------------------------------

export interface CampaignTotals extends CampaignMetrics {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionValue: number;
  /** how many campaigns are folded into this total */
  count: number;
}

/** Sum the raw metrics of many campaigns and re-derive the ratios from the sums
 *  (so e.g. portfolio PNO is total cost / total revenue, not an average of PNOs). */
export function aggregate(rows: Campaign[]): CampaignTotals {
  const sum = rows.reduce(
    (a, c) => ({
      impressions: a.impressions + c.impressions,
      clicks: a.clicks + c.clicks,
      cost: a.cost + c.cost,
      conversions: a.conversions + c.conversions,
      conversionValue: a.conversionValue + c.conversionValue,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 }
  );
  return { ...sum, ...deriveMetrics(sum), count: rows.length };
}

// --- sync-over-sync change diff (client-safe shapes) -------------------------

/** One campaign's movement between the two most recent syncs. */
export interface CampaignChange {
  campaignId: string;
  name: string;
  kind: "added" | "removed" | "changed";
  costBefore: number;
  costAfter: number;
  /** relative change in cost / conversion value vs the prior sync */
  costDelta: number;
  valueDelta: number;
  roasBefore: number;
  roasAfter: number;
}

/** "What changed since the last sync" — diff of the two most recent snapshots. */
export interface ChangesSummary {
  /** ISO timestamp of the prior sync the diff is against */
  since: string;
  /** ISO timestamp of the current sync */
  current: string;
  added: number;
  removed: number;
  changed: number;
  /** the most notable movers, biggest value swing first */
  items: CampaignChange[];
}

export interface TypeGroup {
  type: CampaignType;
  total: CampaignTotals;
}

/** Group campaigns by advertising-channel type, aggregate each group, and sort
 *  by spend (the lens most useful for budget decisions). */
export function groupByType(rows: Campaign[]): TypeGroup[] {
  const byType = new Map<CampaignType, Campaign[]>();
  for (const c of rows) {
    const arr = byType.get(c.type);
    if (arr) arr.push(c);
    else byType.set(c.type, [c]);
  }
  return [...byType.entries()]
    .map(([type, group]) => ({ type, total: aggregate(group) }))
    .sort((a, b) => b.total.cost - a.total.cost);
}
