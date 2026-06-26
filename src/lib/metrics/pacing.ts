/** Monthly revenue goal pacing and a seasonality-aware month-end forecast. */

import type { DailyPoint } from "../types";
import { dailyRevenueSigma, normalCdf, weekdayWeights } from "./seasonality";

/** Days that must have elapsed before goalProbability is quoted as a hard number.
 *  Below this the i.i.d.-normal forecast is too volatile to state a precise %. */
const MIN_ELAPSED_DAYS_FOR_PROBABILITY = 5;

export interface MonthlyPacing {
  /** ISO first-of-month for the current month ("2026-05-01"), for labels */
  monthStart: string;
  /** total calendar days in the month */
  daysInMonth: number;
  /** calendar days elapsed = day-of-month of the latest data point */
  daysElapsed: number;
  /** daysInMonth − daysElapsed */
  daysRemaining: number;
  /** the whole month is represented in the data (no days left to project) */
  complete: boolean;
  /** monthly revenue goal (CZK) */
  goal: number;
  /** month-to-date actual revenue */
  mtd: number;
  /** goal prorated to today on a flat daily pace (where we "should" be) */
  proratedTarget: number;
  /** (mtd − proratedTarget) / proratedTarget — how far ahead/behind pace */
  pace: number;
  /** mtd ≥ proratedTarget */
  onPace: boolean;
  /** seasonality-weighted month-end revenue projection */
  projection: number;
  /** P10 month-end revenue — lower confidence band */
  projectionLow: number;
  /** P90 month-end revenue — upper confidence band */
  projectionHigh: number;
  /** probability the month ends at or above goal (0..1), from the normal CDF */
  goalProbability: number;
  /** whether goalProbability is trustworthy yet. The model treats the remaining
   *  days as i.i.d.-normal, so very early in the month (few elapsed days) the
   *  probability is a near-coin-flip dressed as a hard percentage. False until
   *  enough days have elapsed (or the month is complete) — the UI then suppresses
   *  the "X % chance" label rather than show false precision. */
  probabilityReliable: boolean;
  /** projection / goal */
  attainment: number;
  /** projection ≥ goal */
  willHitGoal: boolean;
}

/**
 * Monthly revenue goal pacing and a seasonality-aware month-end forecast,
 * anchored on the most recent day in the series (the dashboard's "today").
 *
 * The projection scales the month-to-date actual by the ratio of the whole
 * month's expected weekday weight to the elapsed days' weight, so the remaining
 * days are weighted by their day-of-week shape rather than a flat linear
 * run-rate. When the month is already complete the ratio is 1, so the
 * projection equals the actual.
 */
export function monthlyPacing(daily: DailyPoint[], goal: number): MonthlyPacing | null {
  if (daily.length === 0) return null;

  const last = daily[daily.length - 1];
  const ym = last.date.slice(0, 7); // YYYY-MM
  const [year, month] = ym.split("-").map(Number); // month is 1-based
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysElapsed = Number(last.date.slice(8, 10)); // day-of-month of latest point
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  const mtd = daily
    .filter((p) => p.date.slice(0, 7) === ym)
    .reduce((a, p) => a + p.revenue, 0);

  const proratedTarget = goal * (daysElapsed / daysInMonth);

  // Weight every calendar day of the month by its weekday, then scale the MTD
  // actual by full-month-weight / elapsed-weight to forecast the remainder.
  const weights = weekdayWeights(daily);
  let weightElapsed = 0;
  let weightMonth = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const w = weights[new Date(Date.UTC(year, month - 1, d)).getUTCDay()];
    weightMonth += w;
    if (d <= daysElapsed) weightElapsed += w;
  }
  const projection = weightElapsed > 0 ? (mtd * weightMonth) / weightElapsed : mtd;

  // Confidence band: only the remaining days are uncertain (mtd is banked).
  // Treat remaining de-seasonalised days as iid, so the remaining-sum std grows
  // with √daysRemaining. ±1.2816σ ≈ the P10/P90 interval.
  const sigma = dailyRevenueSigma(daily, weights);
  const remainingStd = sigma * Math.sqrt(daysRemaining);
  const z90 = 1.2816;
  const projectionLow = Math.max(mtd, projection - z90 * remainingStd);
  const projectionHigh = projection + z90 * remainingStd;
  const goalProbability =
    remainingStd > 0 ? normalCdf((projection - goal) / remainingStd) : projection >= goal ? 1 : 0;

  return {
    monthStart: `${ym}-01`,
    daysInMonth,
    daysElapsed,
    daysRemaining,
    complete: daysRemaining === 0,
    goal,
    mtd,
    proratedTarget,
    pace: proratedTarget > 0 ? (mtd - proratedTarget) / proratedTarget : 0,
    onPace: mtd >= proratedTarget,
    projection,
    projectionLow,
    projectionHigh,
    goalProbability,
    probabilityReliable: daysRemaining === 0 || daysElapsed >= MIN_ELAPSED_DAYS_FOR_PROBABILITY,
    attainment: goal > 0 ? projection / goal : 0,
    willHitGoal: projection >= goal,
  };
}
