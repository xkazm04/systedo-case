/** Marketing-campaign domain model. A campaign mirrors a Google Ads campaign:
 *  one advertising-channel type, a status and aggregated performance metrics over
 *  the synced period. Kept framework-free (no React, no DB, no formatting) so it
 *  is shared by the connector, the SQLite store, the AI evaluation and the UI. */

import { cpa, cpc, cr, ctr, pno, roas } from "@/lib/metrics/ratios";
import { PAID_PORTFOLIO_TARGET_PNO, PAID_PORTFOLIO_TARGET_ROAS } from "@/lib/targets";
import type { SupportedLocale } from "@/lib/format";

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

export const CAMPAIGN_STATUS_LABELS_EN: Record<CampaignStatus, string> = {
  enabled: "Active",
  paused: "Paused",
};

export function campaignStatusLabel(s: CampaignStatus, locale: SupportedLocale): string {
  return (locale === "en" ? CAMPAIGN_STATUS_LABELS_EN : CAMPAIGN_STATUS_LABELS)[s];
}

// --- periods ----------------------------------------------------------------

export const CAMPAIGN_PERIODS = ["7d", "30d", "90d"] as const;
export type CampaignPeriod = (typeof CAMPAIGN_PERIODS)[number];

export const CAMPAIGN_PERIOD_LABELS: Record<CampaignPeriod, string> = {
  "7d": "7 dní",
  "30d": "30 dní",
  "90d": "90 dní",
};

export const CAMPAIGN_PERIOD_LABELS_EN: Record<CampaignPeriod, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

export function campaignPeriodLabel(p: CampaignPeriod, locale: SupportedLocale): string {
  return (locale === "en" ? CAMPAIGN_PERIOD_LABELS_EN : CAMPAIGN_PERIOD_LABELS)[p];
}

export const CAMPAIGN_PERIOD_DAYS: Record<CampaignPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function isCampaignPeriod(v: unknown): v is CampaignPeriod {
  return typeof v === "string" && (CAMPAIGN_PERIODS as readonly string[]).includes(v);
}

// --- target (agreed with the client) ----------------------------------------

/** Target cost share of revenue (PNO) for the *paid* portfolio — looser than the
 *  blended dashboard goal (15 %) because the campaign mix includes prospecting.
 *  Both targets are defined together in `@/lib/targets` (single source of truth);
 *  surfaces must label the scope so 18 % (paid) vs 15 % (blended) never reads as a
 *  contradiction. Used to colour ROAS / PNO and to score campaigns. */
export const TARGET_PNO = PAID_PORTFOLIO_TARGET_PNO;
/** Equivalent target ROAS (≈ 5.6×). */
export const TARGET_ROAS = PAID_PORTFOLIO_TARGET_ROAS;

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
  /** daily budget, CZK — optional (older synced docs predate the field; live rows
   *  without a resolvable campaign budget omit it). Never aggregated: budgets are
   *  caps, not spend, so summing them across campaigns would be meaningless. */
  budgetPerDay?: number;
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

// --- daily budget & pacing ----------------------------------------------------

/** A profitable campaign counts as "budget-capped" when it has spent at least
 *  this share of its period budget (days × daily budget). 95 % rather than 100 %
 *  because Google's own delivery smoothing routinely leaves a small remainder
 *  even on campaigns that are effectively limited by budget. */
export const BUDGET_CAP_PACING_MIN = 0.95;

export interface BudgetPacing {
  /** share of the period budget actually spent = cost / (days × budgetPerDay).
   *  Can exceed 1 — Google may overdeliver on individual days. */
  pacing: number;
  /** the classic "winner starved by its budget": enabled, ROAS at/above target,
   *  yet pacing at/above BUDGET_CAP_PACING_MIN — the highest-leverage place to
   *  add budget instead of shifting it away */
  capped: boolean;
}

/** Pure pacing computation for one campaign over the synced period. Returns
 *  null when the campaign has no (positive) daily budget — older synced docs
 *  and live rows without a resolvable budget stay unflagged, never mis-flagged. */
export function budgetPacing(
  c: Pick<CampaignRow, "cost" | "roas" | "status" | "budgetPerDay">,
  period: CampaignPeriod
): BudgetPacing | null {
  const budget = c.budgetPerDay;
  if (typeof budget !== "number" || budget <= 0) return null;
  const pacing = c.cost / (CAMPAIGN_PERIOD_DAYS[period] * budget);
  const capped =
    c.status === "enabled" && c.roas >= TARGET_ROAS && pacing >= BUDGET_CAP_PACING_MIN;
  return { pacing, capped };
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

/** Index a change summary's items by campaign id — the lookup shape the
 *  change-aware triage consumers (table badges, alerts, digest) share. Pure and
 *  null-safe, so callers can pass a store result straight through. */
export function indexChanges(
  changes: ChangesSummary | null | undefined
): Record<string, CampaignChange> {
  const out: Record<string, CampaignChange> = {};
  for (const item of changes?.items ?? []) out[item.campaignId] = item;
  return out;
}

export interface TypeGroup {
  type: CampaignType;
  total: CampaignTotals;
  /** the group's member campaigns — lets consumers roll up per-type triage
   *  (e.g. „2 vyžadují pozornost") without regrouping */
  campaigns: Campaign[];
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
    .map(([type, group]) => ({ type, total: aggregate(group), campaigns: group }))
    .sort((a, b) => b.total.cost - a.total.cost);
}
