/** Sustained multi-week drifts ("slow bleed") — the complement to the per-day
 *  anomaly detector. A gradual four-week revenue or cost drift never breaches a
 *  daily |z| threshold, so `detectAnomalies` cannot see the most dangerous
 *  failure mode for an account. This module de-seasonalises the daily values,
 *  rolls them into consecutive 7-day means (each block carries every weekday
 *  exactly once) and flags a run of same-direction weekly moves that each exceed
 *  the weekly noise. Pure; no React, no formatting. */

import type { DailyPoint, RawMetric } from "../types";
import { dayOfWeek, weekdayWeightsFor } from "./seasonality";

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
    const weights = weekdayWeightsFor(daily, key);
    const adj = daily.map((p) => {
      const w = weights[dayOfWeek(p.date)] || 1;
      return p[key] / (w > 0 ? w : 1);
    });

    // Trailing 7-day means, oldest → newest, anchored on the last day.
    const weekly: number[] = [];
    for (let j = weekCount; j >= 1; j--) {
      const end = adj.length - (j - 1) * 7;
      const block = adj.slice(end - 7, end);
      weekly.push(block.reduce((a, b) => a + b, 0) / 7);
    }

    // Noise floor: sample variance of the daily values over the span → the
    // standard error of the difference of two independent 7-day means.
    const span = adj.slice(adj.length - weekCount * 7);
    const mean = span.reduce((a, b) => a + b, 0) / span.length;
    const variance =
      span.length > 1
        ? span.reduce((a, b) => a + (b - mean) ** 2, 0) / (span.length - 1)
        : 0;
    const seMove = Math.sqrt((2 * variance) / 7);

    // Walk the moves backwards from the latest week; the run must reach "now".
    let run = 0;
    let dir = 0;
    for (let i = weekly.length - 1; i >= 1; i--) {
      const diff = weekly[i] - weekly[i - 1];
      const stepDir = diff > 0 ? 1 : diff < 0 ? -1 : 0;
      const beyondNoise = seMove > 0 && Math.abs(diff) / seMove >= zThreshold;
      if (stepDir === 0 || !beyondNoise || (dir !== 0 && stepDir !== dir)) break;
      dir = stepDir;
      run += 1;
    }

    if (run >= minRun && dir !== 0) {
      const base = weekly[weekly.length - 1 - run]; // the week just before the run
      const last = weekly[weekly.length - 1];
      out.push({
        metric: key,
        weeks: run,
        cumulativeChange: base > 0 ? (last - base) / base : 0,
        direction: dir > 0 ? "up" : "down",
      });
    }
  }

  return out.sort((a, b) => Math.abs(b.cumulativeChange) - Math.abs(a.cumulativeChange));
}
