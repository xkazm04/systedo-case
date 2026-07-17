/** Pure builder: turn a project's synced daily rows into the PerformanceData shape
 *  the report/snapshot consume. Keeps the project's client label + goals (from the
 *  per-project spine) and swaps in the live daily series. Extracted from the seam so
 *  it's unit-testable without the store. The MetricRow fields are exactly
 *  PerformanceData.daily's, so the series drops straight in. */
import type { PerformanceData } from "@/lib/types";
import type { Project } from "@/lib/projects/types";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { normalizeCurrency } from "@/lib/campaigns/currency";
import type { MetricRow } from "./types";

/** A live PerformanceData for the project from its synced rows. Sorted by date.
 *
 *  Only `daily` is substantiated by the sync. The rest of the sample spine is
 *  illustrative content that must NOT be presented under the "Živá data" label:
 *  - `channels` is a sample ChannelShare mix; projecting it onto the client's REAL
 *    totals fabricates a per-channel revenue/PNO/ROAS breakdown the account-level
 *    Ads sync has no data for. Neutralize to [] (consumers suppress the block).
 *  - `events` is the demo story-event calendar ("Black Friday — špička poptávky",
 *    etc.) annotated onto sample dates; dropping it keeps demo events off real dates.
 *  - `meta` on the sample spine is {disclaimer, asOf, days, seed}: the sample-data
 *    disclaimer, the sample series' span, and a determinism seed the live series has
 *    no analogue for. Riding it under "Živá data" is the exact confusion the seam
 *    exists to prevent, so overwrite it FROM THE ROWS: asOf = last synced date,
 *    days = row count, disclaimer = "" (the numbers are real; the sample disclaimer
 *    must not travel), seed = 0 (no fabricated determinism).
 *  - `client` is retained (name/domain/segment are the project's real labels). Its
 *    `currency` now carries the synced account's captured ISO currency code when present
 *    (`currencyCode`, additive) so the money surfaces can label a non-CZK account in its
 *    own currency — no conversion, the stored amounts are already the account's native
 *    values. Absent / CZK → the base default, byte-identical to before.
 *  `goals` is retained: it is a forward-looking target (the pacing/anomaly engine
 *  needs a non-zero PNO threshold), not a fabricated historical result. */
export function buildLiveDataset(
  project: Project,
  rows: MetricRow[],
  currencyCode?: string | null
): PerformanceData {
  const base = getProjectDataset(project);
  // Carry the account's captured currency into the tile model; a junk / absent code
  // keeps the base client.currency so CZK tenants are byte-identical.
  const currency = normalizeCurrency(currencyCode);
  const client = currency ? { ...base.client, currency } : base.client;
  const daily = [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: r.date,
      visits: Math.round(r.visits),
      cost: Math.round(r.cost),
      conversions: r.conversions,
      revenue: Math.round(r.revenue),
      // Canonical optional paid-traffic pair (types.ts DailyPoint) — present only
      // when the synced row carried them, so legacy blobs stay clean and the metrics
      // engine's CTR/CPC derive from real numbers rather than a fabricated 0.
      ...(r.impressions !== undefined ? { impressions: Math.round(r.impressions) } : {}),
      ...(r.clicks !== undefined ? { clicks: Math.round(r.clicks) } : {}),
    }));
  const meta = {
    disclaimer: "",
    asOf: daily.length > 0 ? daily[daily.length - 1]!.date : base.meta.asOf,
    days: daily.length,
    seed: 0,
  };
  return { ...base, client, channels: [], events: undefined, daily, meta };
}
