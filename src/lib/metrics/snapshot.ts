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
import { channelRowsCompared, type ChannelRow } from "./channels";
import { detectAnomalies, type Anomaly } from "./anomalies";
import { detectTrends, type Trend } from "./trends";
import { monthlyPacing, type MonthlyPacing } from "./pacing";

/** Bumped when the MetricsSnapshot shape changes, so cached/serialised snapshots
 *  (and any future /api/snapshot consumer) can detect a schema mismatch. */
export const SNAPSHOT_SCHEMA_VERSION = 3;

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
  current: Totals;
  previous: Totals;
  delta: Record<MetricKey, number>;
  significance: Record<MetricKey, Significance>;
  /** chart buckets for the current window */
  buckets: Bucket[];
  /** channel rows carrying period-over-period deltas */
  channels: ChannelRow[];
  /** flagged days (spike/drop/outage/goal-breach) */
  anomalies: Anomaly[];
  /** sustained multi-week drifts ending at the latest data ("slow bleed") */
  trends: Trend[];
  /** monthly goal pacing + forecast band (null when no data) */
  pacing: MonthlyPacing | null;
  goals: { pno: number; monthlyRevenue: number };
}

/** Compose the engine's outputs into the single MetricsSnapshot contract. */
export function buildMetricsSnapshot(data: PerformanceData, period: SnapshotPeriod): MetricsSnapshot {
  const result = evaluatePeriod(data.daily, period.days, period.baseline ?? "previous");
  const granularity = period.granularity ?? (period.days > 90 ? "month" : "day");
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    period: { key: period.key, label: period.label, days: period.days },
    baseline: result.baseline,
    truncated: result.truncated,
    current: result.current,
    previous: result.previous,
    delta: result.delta,
    significance: result.significance,
    buckets: bucketize(result.points, granularity),
    channels: channelRowsCompared(data.channels, result.current, result.previous),
    anomalies: detectAnomalies(data.daily, data.goals),
    trends: detectTrends(data.daily),
    pacing: monthlyPacing(data.daily, data.goals.monthlyRevenue),
    goals: data.goals,
  };
}
