/** Sustained multi-week drifts ("slow bleed") — the complement to the per-day
 *  anomaly detector. A gradual four-week revenue or cost drift never breaches a
 *  daily |z| threshold, so `detectAnomalies` cannot see the most dangerous
 *  failure mode for an account. This module de-seasonalises the daily values,
 *  rolls them into consecutive 7-day means (each block carries every weekday
 *  exactly once) and flags a run of same-direction weekly moves that each exceed
 *  the weekly noise. Pure; no React, no formatting. */

import type { DailyPoint, RawMetric } from "../types";
import { dayOfWeek, seasonalWeight, weekdayWeightsFor, type WeekdayWeights } from "./seasonality";
import { sampleVariance } from "./config";

export interface Trend {
  metric: RawMetric;
  /** length of the run: the value moved in this direction for `weeks`
   *  consecutive weekly steps ("klesá 4 týdny v řadě") */
  weeks: number;
  /** relative change from the weekly mean just before the run to the latest
   *  weekly mean (fraction; negative for a decline) */
  cumulativeChange: number;
  direction: "up" | "down";
}

export interface TrendOptions {
  /** trailing 7-day buckets to inspect (also the noise-estimation span) */
  weeks?: number;
  /** minimum consecutive same-direction weekly moves to call it a trend */
  minRun?: number;
  /** per-move noise threshold, in z units of a weekly-mean difference */
  z?: number;
  /** precomputed raw-metric weekday weights, shared across a snapshot build so the
   *  detector doesn't re-derive them (numerically identical to computing here) */
  weights?: WeekdayWeights;
}

/** One variance-gated sustained run of weekly moves ending at the latest bucket. */
export interface WeeklyRun {
  /** length of the run: this many consecutive same-direction weekly moves reach
   *  the latest bucket */
  run: number;
  direction: "up" | "down";
  /** the weekly value just before the run began */
  base: number;
  /** the latest weekly value */
  last: number;
  /** (last − base) / base, signed (0 when base ≤ 0) */
  cumulativeChange: number;
}

/**
 * The engine's ONE variance-gated decline/rise detector. Given weekly bucket
 * means (oldest → newest) and the per-move noise floor `seMove` (the standard
 * error of a difference of two 7-day means), walk the moves backward from the
 * latest bucket and count the run of same-direction moves that each clear
 * `z · seMove`. Returns null when the run is shorter than `minRun` or has no
 * direction.
 *
 * Shared by {@link detectTrends} (one raw-metric series at a time) and the
 * campaign slow-bleed rule (a weekly ROAS series bridged through the same ratio
 * spine), so there is exactly ONE decline implementation rather than two that
 * drift apart. Pure and total.
 */
export function detectWeeklyRun(
  weekly: number[],
  seMove: number,
  minRun: number,
  z: number
): WeeklyRun | null {
  let run = 0;
  let dir = 0;
  for (let i = weekly.length - 1; i >= 1; i--) {
    const diff = weekly[i] - weekly[i - 1];
    const stepDir = diff > 0 ? 1 : diff < 0 ? -1 : 0;
    const beyondNoise = seMove > 0 && Math.abs(diff) / seMove >= z;
    if (stepDir === 0 || !beyondNoise || (dir !== 0 && stepDir !== dir)) break;
    dir = stepDir;
    run += 1;
  }
  if (run < minRun || dir === 0) return null;
  const base = weekly[weekly.length - 1 - run]; // the week just before the run
  const last = weekly[weekly.length - 1];
  return {
    run,
    direction: dir > 0 ? "up" : "down",
    base,
    last,
    cumulativeChange: base > 0 ? (last - base) / base : 0,
  };
}

/**
 * Detect sustained trends ending at the latest data: for each raw metric, the
 * de-seasonalised series is averaged into trailing 7-day buckets (anchored on
 * the last day), and a `Trend` is emitted when the most recent `minRun`+ weekly
 * moves all point one way and each clears the noise floor. The noise floor is
 * the standard error of a difference of two 7-day means, estimated from the
 * daily variance over the inspected span — conservative by construction (the
 * drift itself inflates the estimate), so quiet accounts stay quiet.
 * Sorted by |cumulativeChange|, biggest drift first.
 */
export function detectTrends(daily: DailyPoint[], options: TrendOptions = {}): Trend[] {
  const weeksWanted = options.weeks ?? 12;
  const minRun = options.minRun ?? 3;
  const zThreshold = options.z ?? 1;

  const weekCount = Math.min(weeksWanted, Math.floor(daily.length / 7));
  // A run of minRun moves spans minRun+1 weekly buckets.
  if (weekCount < minRun + 1) return [];

  const metrics: RawMetric[] = ["revenue", "cost", "conversions", "visits"];
  const out: Trend[] = [];

  for (const key of metrics) {
    // De-seasonalise so a weekday-mix artefact can't fake a move (blocks are
    // exactly 7 days, but the weights also neutralise level differences when a
    // strong weekly shape meets the variance estimate below).
    const weights = options.weights?.[key] ?? weekdayWeightsFor(daily, key);
    // Floor the weight so a tiny weekday weight can't manufacture a drift when we
    // divide by it (see seasonalWeight); ≥ floor is unchanged.
    const adj = daily.map((p) => p[key] / seasonalWeight(weights[dayOfWeek(p.date)]));

    // Trailing 7-day means, oldest → newest, anchored on the last day.
    const weekly: number[] = [];
    for (let j = weekCount; j >= 1; j--) {
      const end = adj.length - (j - 1) * 7;
      const block = adj.slice(end - 7, end);
      weekly.push(block.reduce((a, b) => a + b, 0) / 7);
    }

    // Noise floor: the engine's one (sample) variance estimator over the span →
    // the standard error of the difference of two independent 7-day means. The
    // walk itself (run must reach "now", each move beyond the floor) is the shared
    // detectWeeklyRun so trends and the campaign slow-bleed can't diverge.
    const span = adj.slice(adj.length - weekCount * 7);
    const seMove = Math.sqrt((2 * sampleVariance(span)) / 7);

    const found = detectWeeklyRun(weekly, seMove, minRun, zThreshold);
    if (found) {
      out.push({
        metric: key,
        weeks: found.run,
        cumulativeChange: found.cumulativeChange,
        direction: found.direction,
      });
    }
  }

  return out.sort((a, b) => Math.abs(b.cumulativeChange) - Math.abs(a.cumulativeChange));
}
