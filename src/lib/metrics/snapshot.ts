/** The canonical, serialisable snapshot contract — composes the engine's outputs
 *  (totals, deltas+significance, buckets, compared channels, anomalies, pacing)
 *  into one artefact so the dashboard, the AI grounding and any export reconcile
 *  by construction. (This is the *metrics* snapshot, distinct from `../snapshot`.) */

import type { MetricKey, PerformanceData } from "../types";
import type { Totals } from "./totals";
import {
  evaluatePeriod,
  bucketize,
  type Bucket,
  type PeriodBaseline,
  type Significance,
} from "./series";
import { channelRowsCompared, resolveChannelTime, type ChannelRow } from "./channels";
import { detectAnomalies, type Anomaly } from "./anomalies";
import { detectTrends, type Trend } from "./trends";
import { monthlyPacing, type MonthlyPacing } from "./pacing";
import { seriesCoverage, type Coverage } from "./config";
import { decomposeRevenueMove, type FunnelAttribution } from "./funnel";
import { weekdayWeightsBundle, type WeekdayWeights } from "./seasonality";

/** Bumped when the MetricsSnapshot shape changes, so cached/serialised snapshots
 *  (and any future /api/snapshot consumer) can detect a schema mismatch.
 *  v5: channel rows may carry `revenueShareDelta` (real mix-shift) when the dataset
 *  supplies a per-day channel mix; legacy datasets omit it and read identically.
 *  v6: carries `weekdayWeights` (the per-metric weekday-seasonality bundle the build
 *  already computes) so consumers reuse it instead of re-deriving a weekday pass. */
export const SNAPSHOT_SCHEMA_VERSION = 6;

export interface SnapshotPeriod {
  key: string;
  label: string;
  days: number;
  granularity?: "day" | "month";
  /** comparison baseline — adjacent previous window (default) or year-over-year */
  baseline?: PeriodBaseline;
}

/**
 * One canonical, serialisable artefact representing "the state of this account"
 * for a period — totals, deltas + significance, chart buckets, compared channel
 * rows, anomalies and the pacing forecast, all derived from one source of truth
 * so the dashboard, the AI grounding and any future export reconcile by
 * construction. This is the contract; the bag-of-functions above are its parts.
 */
export interface MetricsSnapshot {
  schemaVersion: number;
  period: { key: string; label: string; days: number };
  /** the comparison baseline actually used (a YoY request the series can't
   *  satisfy falls back to "previous" — see PeriodResult.baseline) */
  baseline: PeriodBaseline;
  /** true when the series was too short to fill the requested window at equal
   *  current/comparison length (span < requestedDays) — so current totals cover
   *  fewer days than the period label claims and the delta is not a true
   *  full-period comparison. Consumers that quote the period as an absolute span
   *  (e.g. a "12 months / YoY" grounding line) must honor this. */
  truncated: boolean;
  /** how much daily history the anomaly/trend detectors had to work with:
   *  "full" (≥29 days, unchanged detection), "degraded" (10–28 days: shorter
   *  baseline + wider z bar, so weaker signals), or "insufficient" (<10 days:
   *  no anomalies). Lets the UI and the AI grounding stay honest about sensitivity
   *  instead of reading an empty feed as "all clear". */
  coverage: Coverage;
  current: Totals;
  previous: Totals;
  delta: Record<MetricKey, number>;
  significance: Record<MetricKey, Significance>;
  /** chart buckets for the current window */
  buckets: Bucket[];
  /** channel rows carrying period-over-period deltas */
  channels: ChannelRow[];
  /** flagged days (spike/drop/outage/goal-breach). NOTE: FULL-SERIES, not windowed
   *  to `period` — the detector scans the whole daily feed so short-window snapshots
   *  still see recent history. A consumer that presents these as "events in the
   *  period" MUST filter by the period window itself (`date >= asOf − (days − 1)`),
   *  as `snapshot-to-article` and the AI grounding (`snapshotToPromptText`) do. */
  anomalies: Anomaly[];
  /** sustained multi-week drifts ending at the latest data ("slow bleed").
   *  FULL-SERIES by construction (a drift is measured back from `asOf`); its span
   *  can exceed `period.days`, so it is reported as a current trajectory, not an
   *  "in-period event". */
  trends: Trend[];
  /** funnel-consistency attribution of the revenue move (traffic vs conversion
   *  rate vs AOV), present only when the revenue delta is statistically strong and
   *  the decomposition is defined (all factor endpoints > 0); null otherwise */
  funnel: FunnelAttribution | null;
  /** monthly goal pacing + forecast band (null when no data) */
  pacing: MonthlyPacing | null;
  goals: { pno: number; monthlyRevenue: number };
  /** per-raw-metric weekday-seasonality weights (mean = 1) the build already
   *  computed for the anomaly/trend/pacing passes — exposed so consumers (e.g. the
   *  weekday profile) reuse it rather than re-deriving the same weekday pass */
  weekdayWeights: WeekdayWeights;
}

/** Compose the engine's outputs into the single MetricsSnapshot contract. */
export function buildMetricsSnapshot(data: PerformanceData, period: SnapshotPeriod): MetricsSnapshot {
  const result = evaluatePeriod(data.daily, period.days, period.baseline ?? "previous");
  const granularity = period.granularity ?? (period.days > 90 ? "month" : "day");
  // Compute the raw-metric weekday weights ONCE and share them with the anomaly,
  // trend and pacing passes, which each used to re-derive them (~6 redundant
  // passes per build). No global cache — just plumbed through this one build.
  const weights = weekdayWeightsBundle(data.daily);
  // Time-resolve the channel mix when the dataset carries a per-day breakdown that
  // covers both comparison windows — else undefined, and channelRowsCompared keeps
  // its static projection (byte-identical for live/legacy datasets).
  const channelTime = resolveChannelTime(
    data.channels.length,
    data.channelDaily,
    result.points,
    result.comparePoints
  );
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    period: { key: period.key, label: period.label, days: period.days },
    baseline: result.baseline,
    truncated: result.truncated,
    coverage: seriesCoverage(data.daily.length),
    current: result.current,
    previous: result.previous,
    delta: result.delta,
    significance: result.significance,
    buckets: bucketize(result.points, granularity),
    channels: channelRowsCompared(data.channels, result.current, result.previous, channelTime),
    anomalies: detectAnomalies(data.daily, data.goals, { weights }),
    trends: detectTrends(data.daily, { weights }),
    // Attribute the revenue move across the funnel only when it's a real signal —
    // a statistically strong delta — so the recap never explains away noise.
    funnel:
      result.significance.revenue === "strong"
        ? decomposeRevenueMove(result.current, result.previous)
        : null,
    pacing: monthlyPacing(data.daily, data.goals.monthlyRevenue, weights.revenue),
    goals: data.goals,
    weekdayWeights: weights,
  };
}
