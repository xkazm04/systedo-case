/** Shared day-of-week / forecast math used by BOTH monthly pacing and anomaly
 *  detection. Extracted into its own module so pacing and anomalies depend on this
 *  rather than on each other (no cycle). Captures the day-of-week seasonality baked
 *  into the series so days can be weighted by their weekday mix (forecast) or
 *  de-seasonalised (anomaly detection). */

import type { DailyPoint, RawMetric } from "../types";

/** σ of the de-seasonalised daily revenue over a trailing window — the day-to-day
 *  noise used to size the forecast confidence band. */
export function dailyRevenueSigma(daily: DailyPoint[], weights: number[]): number {
  const window = Math.min(daily.length, 56);
  const recent = daily.slice(daily.length - window);
  if (recent.length < 2) return 0;
  const adj = recent.map((p) => p.revenue / (weights[dayOfWeek(p.date)] || 1));
  const mean = adj.reduce((a, b) => a + b, 0) / adj.length;
  const variance = adj.reduce((a, b) => a + (b - mean) ** 2, 0) / adj.length;
  return Math.sqrt(variance);
}

/** Standard normal CDF (Abramowitz-Stegun 26.2.17), dependency-free. */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** UTC day-of-week (0=Sun..6=Sat) for an ISO date string. */
export const dayOfWeek = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Average value per weekday (Sun..Sat) for an additive metric over a trailing
 *  window of whole weeks, normalised so the mean weekday weight is 1. Falls back
 *  to flat weights when there is too little data. Captures the day-of-week
 *  seasonality baked into the series so days can be weighted by their weekday mix
 *  (used by the forecast) or de-seasonalised (used by anomaly detection). */
export function weekdayWeightsFor(daily: DailyPoint[], key: RawMetric): number[] {
  const window = Math.min(daily.length, 84); // up to 12 whole weeks
  const recent = daily.slice(daily.length - window);
  const sum = new Array(7).fill(0);
  const count = new Array(7).fill(0);
  for (const p of recent) {
    const d = dayOfWeek(p.date);
    sum[d] += p[key];
    count[d] += 1;
  }
  const avg = sum.map((s, i) => (count[i] > 0 ? s / count[i] : 0));
  const present = avg.filter((_, i) => count[i] > 0);
  const mean = present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : 0;
  if (!(mean > 0)) return new Array(7).fill(1);
  return avg.map((a, i) => (count[i] > 0 && a > 0 ? a / mean : 1));
}

/** Revenue weekday weights — the seasonality baseline used by the forecast. */
export function weekdayWeights(daily: DailyPoint[]): number[] {
  return weekdayWeightsFor(daily, "revenue");
}

/** One weekday's slot in the day-of-week performance profile. */
export interface WeekdayProfilePoint {
  /** UTC day-of-week (0 = Sunday … 6 = Saturday) */
  day: number;
  /** performance index vs the weekday average — 1 = average, 1.2 = 20 % above */
  index: number;
  /** the single strongest weekday (false everywhere when the profile is flat) */
  best: boolean;
  /** the single weakest weekday (false everywhere when the profile is flat) */
  worst: boolean;
}

/**
 * The user-facing view of {@link weekdayWeightsFor}: the engine has always
 * computed per-weekday indices (to de-seasonalise anomalies and weight the
 * forecast) but never showed them. Normalised around 1 like the weights —
 * "Sunday runs 35 % below average, Tuesday 20 % above" — which is exactly the
 * shape ad-scheduling / bid-adjustment decisions need. Falls back to a flat
 * profile (all 1, no best/worst) when the series is too short to know better.
 */
export function weekdayProfile(
  daily: DailyPoint[],
  key: RawMetric = "revenue"
): WeekdayProfilePoint[] {
  const weights = weekdayWeightsFor(daily, key);
  let bestDay = 0;
  let worstDay = 0;
  weights.forEach((w, i) => {
    if (w > weights[bestDay]) bestDay = i;
    if (w < weights[worstDay]) worstDay = i;
  });
  const flat = weights.every((w) => w === weights[0]);
  return weights.map((index, day) => ({
    day,
    index,
    best: !flat && day === bestDay,
    worst: !flat && day === worstDay,
  }));
}
