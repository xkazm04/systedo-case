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
  // Catch-all for advertising-channel types outside the mapped set (HOTEL, LOCAL,
  // SMART, TRAVEL, legacy MULTI_CHANNEL, …). Kept explicit so unmapped types are
  // NOT silently filed under "search" — see CHANNEL_TYPE in @/lib/google/ads.
  "other",
] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  search: "Search",
  performance_max: "Performance Max",
  shopping: "Shopping",
  display: "Display",
  demand_gen: "Demand Gen",
  video: "Video",
  other: "Ostatní",
};

/** One stable colour per type, so the by-type breakdown and the table dots always
 *  agree. These are SNAPSHOT hex values captured at authoring time — NOT a live
 *  reference to the design tokens (this module is client-shared, so it cannot import
 *  the server-only token reader). Most track a brand/navy/coral ramp step
 *  (search=brand-500, shopping=brand-400, display=coral-500, video=navy-600), but
 *  `performance_max` and `demand_gen` are bespoke; nothing enforces the equivalence,
 *  so a palette refresh in globals.css must be mirrored here by hand. `other` uses a
 *  neutral slate so an unmapped channel type reads as "uncategorised", never a real
 *  Search share. */
export const CAMPAIGN_TYPE_COLORS: Record<CampaignType, string> = {
  search: "#14b8b1",
  performance_max: "#1f8f88",
  shopping: "#2dd4ce",
  display: "#fb7141",
  demand_gen: "#f59e0b",
  video: "#15324b",
  other: "#64748b",
};

/** Funnel role of each channel type. Performance types answer existing demand
 *  and are fairly judged by direct (last-click) ROAS; prospecting types *create*
 *  demand, which last-click attribution systematically under-credits — so they
 *  trend "red" against the same target without being broken. Encoded once here
 *  so the prompts, breakdowns and any future per-role tolerance read one map.
 *  Deliberately informational: no triage threshold moves based on the role. */
export type CampaignTypeRole = "performance" | "prospecting" | "neutral";

export const CAMPAIGN_TYPE_ROLES: Record<CampaignType, CampaignTypeRole> = {
  search: "performance",
  performance_max: "performance",
  shopping: "performance",
  display: "prospecting",
  demand_gen: "prospecting",
  video: "prospecting",
  // Unmapped channel types carry no funnel framing — judged neither by the strict
  // performance lens nor the prospecting one, so they never distort either rollup.
  other: "neutral",
};

export const CAMPAIGN_TYPE_ROLE_LABELS: Record<CampaignTypeRole, string> = {
  performance: "výkonnostní",
  prospecting: "prospekční",
  neutral: "nezařazené",
};

export const CAMPAIGN_TYPE_ROLE_LABELS_EN: Record<CampaignTypeRole, string> = {
  performance: "performance",
  prospecting: "prospecting",
  neutral: "uncategorized",
};

export function campaignTypeRoleLabel(role: CampaignTypeRole, locale: SupportedLocale): string {
  return (locale === "en" ? CAMPAIGN_TYPE_ROLE_LABELS_EN : CAMPAIGN_TYPE_ROLE_LABELS)[role];
}

/** Localized labels of every type playing `role`, for prose that must stay in
 *  sync with the map ("prospekční (Display, Demand Gen, Video)"). */
export function campaignTypesForRole(role: CampaignTypeRole): string {
  return CAMPAIGN_TYPES.filter((t) => CAMPAIGN_TYPE_ROLES[t] === role)
    .map((t) => CAMPAIGN_TYPE_LABELS[t])
    .join(", ");
}

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

/** Stable id of the data source behind a connector, persisted alongside the data
 *  and surfaced in the UI. An OPEN union: new providers extend it without reshaping
 *  the seam (the store already types SyncMeta.source as string).
 *
 *  Lives here (and is re-exported from `./connector` for every existing importer)
 *  because ADR-0010 made it part of the DATA model — `Campaign.source` — and the
 *  framework-free model must not import the server-only connector to name its own
 *  field. */
export type AdsSource = "sample" | "google-ads" | "sklik";

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
  /** ADR-0010: which network this row came from, stamped at sync time. OPTIONAL —
   *  every row synced before the ledger existed omits it, and such a row reads as
   *  its own tenant's `SyncMeta.source` (the tenant is per-account, so the tenant
   *  always knows). Never inferred from the row itself. */
  source?: AdsSource;
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
  /** clicks on the day — OPTIONAL so points written before the spine carried
   *  clicks/impressions (and any provider that can't supply them) read cleanly.
   *  Present, it unlocks a CPC (cost/clicks) trend without a second ingestion. */
  clicks?: number;
  /** impressions on the day — OPTIONAL for the same backward-compat reason.
   *  With `clicks`, it unlocks a CTR (clicks/impressions) trend. */
  impressions?: number;
}

/** CTR for a daily point, or null when impressions weren't captured (legacy
 *  points) or are zero. Pure + null-safe so a chart/diff can map straight over a
 *  stored series without guarding each point. */
export function dailyCtr(p: DailyPoint): number | null {
  if (typeof p.clicks !== "number" || typeof p.impressions !== "number" || p.impressions <= 0) {
    return null;
  }
  return p.clicks / p.impressions;
}

/** CPC for a daily point (CZK), or null when clicks weren't captured or are zero. */
export function dailyCpc(p: DailyPoint): number | null {
  if (typeof p.clicks !== "number" || p.clicks <= 0) return null;
  return p.cost / p.clicks;
}

/** The metrics a daily series can be plotted by (the trend sparkline's toggle). */
export type SeriesMetric = "cost" | "ctr" | "cpc";

/** Is a CTR/CPC series available for these points? True only when the widened
 *  spine (clicks + impressions) is present on enough of the series to draw it —
 *  legacy series (cost only) return false so the toggle stays cost-only for them. */
export function seriesSupportsMetric(points: DailyPoint[], metric: SeriesMetric): boolean {
  if (metric === "cost") return points.length >= 2;
  const derive = metric === "ctr" ? dailyCtr : dailyCpc;
  return points.filter((p) => derive(p) !== null).length >= 2;
}

/** Extract the plottable value series for `metric`, dropping points where the
 *  ratio is undefined (legacy points / zero denominators). For "cost" this is
 *  every point's cost; for CTR/CPC only the points that carry clicks/impressions.
 *  Pure so the chart maps straight over a stored series. */
export function dailyMetricValues(points: DailyPoint[], metric: SeriesMetric): number[] {
  if (metric === "cost") return points.map((p) => p.cost);
  const derive = metric === "ctr" ? dailyCtr : dailyCpc;
  const out: number[] = [];
  for (const p of points) {
    const v = derive(p);
    if (v !== null) out.push(v);
  }
  return out;
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
  /** share of the period budget actually spent = cost / (activeDays × budgetPerDay).
   *  Can exceed 1 — Google may overdeliver on individual days.
   *
   *  KNOWN under-estimate when `activeDays` is unavailable: the denominator then
   *  assumes the campaign ran (and was budgeted) the FULL period, so a campaign
   *  that only existed / delivered for part of the window — young, recently
   *  un-paused, or recently re-budgeted — paces low even while spending 100 % of
   *  its budget every live day. When the per-campaign daily series is passed, the
   *  denominator uses the count of days that actually spent, so the metric only
   *  tightens (catches those starved winners), never loosens. */
  pacing: number;
  /** the classic "winner starved by its budget": enabled, ROAS at/above target,
   *  yet pacing at/above BUDGET_CAP_PACING_MIN — the highest-leverage place to
   *  add budget instead of shifting it away */
  capped: boolean;
}

/** Days a campaign's daily series actually spent (cost > 0), clamped to [1, period
 *  days]. The honest denominator for pacing: a campaign live for 6 of 30 days should
 *  be judged against those 6 days, not the full window. Clamped at period days so a
 *  series with overdelivery days can only TIGHTEN pacing, never loosen it below the
 *  full-period baseline; floored at 1 so a non-empty series never divides by zero. */
export function activeBudgetDays(points: DailyPoint[] | undefined, period: CampaignPeriod): number | null {
  if (!points || points.length === 0) return null;
  const spent = points.filter((p) => p.cost > 0).length;
  if (spent === 0) return null;
  return Math.min(spent, CAMPAIGN_PERIOD_DAYS[period]);
}

/** Pure pacing computation for one campaign over the synced period. Returns
 *  null when the campaign has no (positive) daily budget — older synced docs
 *  and live rows without a resolvable budget stay unflagged, never mis-flagged.
 *
 *  `activeDays` (from {@link activeBudgetDays}) overrides the full-period day count
 *  in the denominator when the per-campaign daily series is available, so partial-
 *  window campaigns are paced against the days they actually ran. Absent → the
 *  documented full-period under-estimate. */
export function budgetPacing(
  c: Pick<CampaignRow, "cost" | "roas" | "status" | "budgetPerDay">,
  period: CampaignPeriod,
  activeDays?: number | null
): BudgetPacing | null {
  const budget = c.budgetPerDay;
  if (typeof budget !== "number" || budget <= 0) return null;
  const days =
    typeof activeDays === "number" && activeDays > 0
      ? Math.min(activeDays, CAMPAIGN_PERIOD_DAYS[period])
      : CAMPAIGN_PERIOD_DAYS[period];
  const pacing = c.cost / (days * budget);
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
  /** CTR / CPC before & after — OPTIONAL: present only when the widened spine
   *  (clicks + impressions) is available on the snapshots being diffed. Legacy
   *  snapshots omit clicks/impressions, so a diff over old history keeps its exact
   *  prior shape. A null on one side means the ratio is undefined there (that side
   *  is an add/remove, or has zero impressions/clicks). */
  ctrBefore?: number | null;
  ctrAfter?: number | null;
  cpcBefore?: number | null;
  cpcAfter?: number | null;
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
