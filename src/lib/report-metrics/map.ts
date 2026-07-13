/** Pure mapper: Google Ads searchStream rows → daily MetricRows. Kept apart from the
 *  network client (google/ads.ts) so it's unit-testable against a captured API
 *  response with no credentials. Ads reports cost in micros of the account currency;
 *  clicks stand in for visits (Ads has no sessions metric) AND are carried as the
 *  first-class `clicks` field, paired with `impressions`, so the live report can
 *  compute CTR/CPC. Rows are summed per date (a date-segmented query over `campaign`
 *  yields one row per campaign per day, so the account total is the per-date sum). */
import type { MetricRow } from "./types";

/** The subset of a Google Ads searchStream result row this mapper reads. */
export interface AdsMetricRow {
  segments?: { date?: string };
  metrics?: {
    clicks?: string | number;
    impressions?: string | number;
    costMicros?: string | number;
    conversions?: string | number;
    conversionsValue?: string | number;
  };
}

function num(v: string | number | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
}

/** Sum date-segmented Ads rows into one sorted MetricRow per day. Cost micros are
 *  summed RAW and converted once per day (per-row rounding would drift), then all
 *  fields are rounded to whole units. `clicks`/`impressions` are carried as
 *  first-class paid-traffic fields (visits stays the clicks proxy); the shared
 *  fetcher now selects impressions, so both are populated on a fresh sync. */
export function mapAdsRowsToMetrics(rows: AdsMetricRow[]): MetricRow[] {
  // Accumulate raw (cost kept in micros) so the currency conversion rounds once.
  const acc = new Map<
    string,
    { visits: number; costMicros: number; conversions: number; revenue: number; clicks: number; impressions: number }
  >();
  for (const r of rows) {
    const date = r.segments?.date;
    if (!date) continue;
    const m = r.metrics ?? {};
    const a = acc.get(date) ?? { visits: 0, costMicros: 0, conversions: 0, revenue: 0, clicks: 0, impressions: 0 };
    a.visits += num(m.clicks);
    a.costMicros += num(m.costMicros);
    a.conversions += num(m.conversions);
    a.revenue += num(m.conversionsValue);
    a.clicks += num(m.clicks);
    a.impressions += num(m.impressions);
    acc.set(date, a);
  }
  return [...acc.entries()]
    .map(([date, a]) => ({
      date,
      visits: Math.round(a.visits),
      cost: Math.round(a.costMicros / 1_000_000),
      conversions: a.conversions,
      revenue: Math.round(a.revenue),
      clicks: Math.round(a.clicks),
      impressions: Math.round(a.impressions),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
