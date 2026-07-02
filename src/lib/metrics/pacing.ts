/** Monthly revenue goal pacing and a seasonality-aware month-end forecast. */

import type { DailyPoint } from "../types";
import { dailyRevenueSigma, normalCdf, weekdayWeights } from "./seasonality";
import { totalsOf } from "./totals";

/** Trailing window whose ROAS converts a revenue-pace shortfall into the extra
 *  daily ad spend it would take to close it (matches the anomaly baseline span). */
const ROAS_WINDOW_DAYS = 28;

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
  /** revenue/day the remaining days must average for the month to still hit the
   *  goal: max(0, goal − mtd) / daysRemaining. 0 when the month is complete or
   *  the goal is already banked — the prescription behind "behind plan". */
  requiredDailyRevenue: number;
  /** revenue/day the remaining days are expected to deliver at the current pace,
   *  implied by the seasonality-weighted projection ((projection − mtd) /
   *  daysRemaining) — so it already carries the weekday shape of the recent past
   *  rather than a flat linear run-rate. 0 when the month is complete. */
  recentDailyRevenue: number;
  /** requiredDailyRevenue / recentDailyRevenue — how much the remaining pace must
   *  accelerate (> 1 = behind, ≤ 1 = current pace suffices); 0 when recent is 0 */
  requiredVsRecent: number;
  /** extra ad spend per day implied by the pace shortfall at the trailing 28-day
   *  ROAS: max(0, required − recent) / roas. The steering number — "at current
   *  ROAS that's ≈ +X Kč/day of spend". 0 when on pace or ROAS is unknown. */
  impliedExtraDailySpend: number;
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

  // Required-pace prescription: what the remaining days must average vs what
  // they are on track to deliver, and the extra daily spend the gap implies.
  const requiredDailyRevenue = daysRemaining > 0 ? Math.max(0, goal - mtd) / daysRemaining : 0;
  const recentDailyRevenue = daysRemaining > 0 ? Math.max(0, projection - mtd) / daysRemaining : 0;
  const requiredVsRecent = recentDailyRevenue > 0 ? requiredDailyRevenue / recentDailyRevenue : 0;
  const recentRoas = totalsOf(daily.slice(-ROAS_WINDOW_DAYS)).roas;
  const impliedExtraDailySpend =
    recentRoas > 0 ? Math.max(0, requiredDailyRevenue - recentDailyRevenue) / recentRoas : 0;

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
    requiredDailyRevenue,
    recentDailyRevenue,
    requiredVsRecent,
    impliedExtraDailySpend,
  };
}

// --- goal attainment track record --------------------------------------------

export interface MonthAttainment {
  /** ISO first-of-month ("2026-04-01"), for labels */
  month: string;
  /** total revenue of that complete calendar month */
  revenue: number;
  /** revenue / goal */
  attainment: number;
  /** revenue ≥ goal */
  hit: boolean;
}

/**
 * Month-by-month goal attainment over the last `n` COMPLETE calendar months —
 * the track record behind the pacing card's point-in-time gauge. A month counts
 * only when every calendar day is present in the series: a partial leading (or
 * in-progress current) month would otherwise read as a fake miss.
 * NOTE: the goal is the single constant `goals.monthlyRevenue` applied to every
 * month — the dataset carries no per-month goal history.
 */
export function monthlyAttainmentHistory(
  daily: DailyPoint[],
  goal: number,
  n = 6
): MonthAttainment[] {
  const groups = new Map<string, { revenue: number; count: number }>();
  for (const p of daily) {
    const key = p.date.slice(0, 7); // YYYY-MM
    const g = groups.get(key) ?? { revenue: 0, count: 0 };
    g.revenue += p.revenue;
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .filter(([key, g]) => {
      const [y, m] = key.split("-").map(Number); // m is 1-based
      return g.count >= new Date(Date.UTC(y, m, 0)).getUTCDate();
    })
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-n)
    .map(([key, g]) => ({
      month: `${key}-01`,
      revenue: g.revenue,
      attainment: goal > 0 ? g.revenue / goal : 0,
      hit: g.revenue >= goal,
    }));
}
