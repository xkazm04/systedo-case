/** Sklik → neutral campaign-model adapter: the three fetchers the AdsConnector
 *  seam needs (campaigns list, portfolio daily series, per-campaign daily series),
 *  each mapping Sklik's wire shapes onto this app's framework-free Campaign /
 *  DailyPoint. DATA-IN only — this module maps what comes back and writes nothing.
 *  Pure over a {@link SklikClient}, so a fixture transport exercises the whole
 *  mapping with no network.
 *
 *  WP S1 gave Sklik a write path, but NOT here: budget/status mutations go through
 *  `campaigns/mutator.ts` → `SklikClient.setCampaignDayBudget` /
 *  `setCampaignStatus`, behind three rails (isolated method constants that degrade,
 *  a settled money-unit verdict, and the default-off `SKLIK_WRITES_ENABLED` flag).
 *  The one seam that matters here: this adapter STRINGIFIES Sklik's numeric ids into
 *  `Campaign.id` (below), so the write path converts them back with `Number(...)`.
 *
 *  Parallels @/lib/google/ads (the Google provider's raw fetchers): the connector
 *  wraps whichever set with the same degrade-to-sample fallback. Money is native
 *  CZK here (no micros division — see moneyToCzk). */
import {
  CAMPAIGN_PERIOD_DAYS,
  type Campaign,
  type CampaignPeriod,
  type DailyPoint,
} from "@/lib/campaigns/types";
import type { SklikClient } from "./client";
import { moneyToCzk, sklikChannelType, sklikStatus, type SklikMoneyMode, type SklikStatRow } from "./types";

/** YYYY-MM-DD window for the period (matches the Google connector's dateRange). */
function dateRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

/** Fold a Sklik stat row into a mutable DailyPoint accumulator. conversionValue is
 *  accumulated RAW and rounded exactly ONCE at the aggregate boundary
 *  ({@link finalizePoint}) — summing per-row rounded values drifts by up to half a
 *  unit per row (mirrors the Google connector's round-once fix). Both money fields
 *  (cost + conversionValue = revenue) flow through the moneyToCzk `mode`, so a
 *  confirmed haléře account's spend AND revenue are divided by 100; the daily budget
 *  is NOT (it is the trusted native-CZK reference the verdict compares against). */
function addRow(p: DailyPoint, s: SklikStatRow, mode: SklikMoneyMode): void {
  p.cost += moneyToCzk(s.money, mode);
  p.conversions += Number(s.conversions ?? 0);
  // Raw here (unit applied once, with round-once, in finalizePoint).
  p.conversionValue += Number(s.conversionValue ?? 0);
  p.clicks = (p.clicks ?? 0) + Number(s.clicks ?? 0);
  p.impressions = (p.impressions ?? 0) + Number(s.impressions ?? 0);
}

function emptyPoint(date: string): DailyPoint {
  return { date, cost: 0, conversions: 0, conversionValue: 0, clicks: 0, impressions: 0 };
}

/** Apply the money `mode` to a raw revenue/spend accumulator (÷100 for haléře). */
function scaleMoney(raw: number, mode: SklikMoneyMode): number {
  return mode === "halere" ? raw / 100 : raw;
}

/** Round the raw-accumulated conversionValue once, applying the money mode. */
function finalizePoint(p: DailyPoint, mode: SklikMoneyMode): DailyPoint {
  return { ...p, conversionValue: Math.round(scaleMoney(p.conversionValue, mode)) };
}

/** Campaigns + period-aggregated metrics, mapped into the app's Campaign model.
 *  Lists campaigns, then pulls one total-granularity stats report and joins them
 *  by id. A campaign with no stats row still appears (all-zero metrics), exactly
 *  like the Google path. */
export async function fetchSklikCampaigns(
  client: SklikClient,
  period: CampaignPeriod,
  mode: SklikMoneyMode = "czk"
): Promise<Campaign[]> {
  const { start, end } = dateRange(CAMPAIGN_PERIOD_DAYS[period]);
  const campaigns = await client.listCampaigns();
  if (campaigns.length === 0) return [];

  const report = await client.campaignStats({
    campaignIds: campaigns.map((c) => c.id),
    dateFrom: start,
    dateTo: end,
    granularity: "total",
  });
  // Sum every stat row per campaign (a total report is normally one row, but be
  // robust to several).
  const totals = new Map<number, DailyPoint>();
  for (const r of report) {
    const acc = totals.get(r.campaignId) ?? emptyPoint("");
    for (const s of r.stats ?? []) addRow(acc, s, mode);
    totals.set(r.campaignId, acc);
  }

  return campaigns.map((c) => {
    const t = totals.get(c.id) ?? emptyPoint("");
    // Daily budget stays NATIVE CZK — the trusted reference the money-unit verdict
    // compares spend against; never haléře-scaled.
    const budgetPerDay = c.dayBudget != null ? Math.round(c.dayBudget) : 0;
    return {
      id: String(c.id),
      name: c.name ?? `Kampaň ${c.id}`,
      type: sklikChannelType(c.type),
      status: sklikStatus(c.status),
      impressions: t.impressions ?? 0,
      clicks: t.clicks ?? 0,
      cost: t.cost,
      conversions: t.conversions,
      // Round the raw-accumulated value once, applying the money mode.
      conversionValue: Math.round(scaleMoney(t.conversionValue, mode)),
      // Optional on the model: only emit a positive resolvable budget.
      ...(budgetPerDay > 0 ? { budgetPerDay } : {}),
    } satisfies Campaign;
  });
}

/** Portfolio daily series over the period — daily stats across all campaigns,
 *  summed per date. Powers the trend chart, same as the Google connector. */
export async function fetchSklikSeries(
  client: SklikClient,
  period: CampaignPeriod,
  mode: SklikMoneyMode = "czk"
): Promise<DailyPoint[]> {
  const { start, end } = dateRange(CAMPAIGN_PERIOD_DAYS[period]);
  const report = await client.campaignStats({
    dateFrom: start,
    dateTo: end,
    granularity: "daily",
  });

  const byDate = new Map<string, DailyPoint>();
  for (const r of report) {
    for (const s of r.stats ?? []) {
      if (!s.date) continue;
      const p = byDate.get(s.date) ?? emptyPoint(s.date);
      addRow(p, s, mode);
      byDate.set(s.date, p);
    }
  }
  return [...byDate.values()].map((p) => finalizePoint(p, mode)).sort((a, b) => a.date.localeCompare(b.date));
}

/** Per-campaign daily series (campaign id → points) for the table sparklines. */
export async function fetchSklikCampaignSeries(
  client: SklikClient,
  period: CampaignPeriod,
  mode: SklikMoneyMode = "czk"
): Promise<Record<string, DailyPoint[]>> {
  const { start, end } = dateRange(CAMPAIGN_PERIOD_DAYS[period]);
  const report = await client.campaignStats({
    dateFrom: start,
    dateTo: end,
    granularity: "daily",
  });

  const out: Record<string, DailyPoint[]> = {};
  for (const r of report) {
    const byDate = new Map<string, DailyPoint>();
    for (const s of r.stats ?? []) {
      if (!s.date) continue;
      const p = byDate.get(s.date) ?? emptyPoint(s.date);
      addRow(p, s, mode);
      byDate.set(s.date, p);
    }
    out[String(r.campaignId)] = [...byDate.values()]
      .map((p) => finalizePoint(p, mode))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}
