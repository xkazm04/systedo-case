/** Pure builder: turn a project's synced daily rows into the PerformanceData shape
 *  the report/snapshot consume. Keeps the project's client label + goals (from the
 *  per-project spine) and swaps in the live daily series. Extracted from the seam so
 *  it's unit-testable without the store. The MetricRow fields are exactly
 *  PerformanceData.daily's, so the series drops straight in. */
import type { PerformanceData } from "@/lib/types";
import type { Project } from "@/lib/projects/types";
import { getProjectDataset } from "@/lib/project-data/dataset";
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
 *  `goals` is retained: it is a forward-looking target (the pacing/anomaly engine
 *  needs a non-zero PNO threshold), not a fabricated historical result. */
export function buildLiveDataset(project: Project, rows: MetricRow[]): PerformanceData {
  const base = getProjectDataset(project);
  const daily = [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: r.date,
      visits: Math.round(r.visits),
      cost: Math.round(r.cost),
      conversions: r.conversions,
      revenue: Math.round(r.revenue),
    }));
  return { ...base, channels: [], events: undefined, daily };
}
