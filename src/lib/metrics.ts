/** Pure analytics layer over the daily series. Everything the dashboard shows is
 *  derived here from one source of truth, so KPIs, charts and the channel table
 *  always reconcile. No React, no formatting — just numbers in, numbers out. */

import {
  fmtCZK,
  fmtCZKCompact,
  fmtInt,
  fmtMultiple,
  fmtPct,
} from "./format";
import type {
  ChannelShare,
  DailyPoint,
  MetricKey,
  PerformanceData,
  RawMetric,
} from "./types";

export interface Totals {
  visits: number;
  cost: number;
  conversions: number;
  revenue: number;
  /** podíl nákladů na obratu = cost / revenue */
  pno: number;
  /** average order value = revenue / conversions */
  aov: number;
  /** conversion rate = conversions / visits */
  cr: number;
  /** return on ad spend = revenue / cost */
  roas: number;
}

const EMPTY: Pick<Totals, RawMetric> = { visits: 0, cost: 0, conversions: 0, revenue: 0 };

const safe = (num: number, den: number): number => (den > 0 ? num / den : 0);

/** Sum the raw additive metrics and derive the ratios. */
export function totalsOf(points: DailyPoint[]): Totals {
  const sum = points.reduce(
    (a, p) => ({
      visits: a.visits + p.visits,
      cost: a.cost + p.cost,
      conversions: a.conversions + p.conversions,
      revenue: a.revenue + p.revenue,
    }),
    { ...EMPTY }
  );
  return {
    ...sum,
    pno: safe(sum.cost, sum.revenue),
    aov: safe(sum.revenue, sum.conversions),
    cr: safe(sum.conversions, sum.visits),
    roas: safe(sum.revenue, sum.cost),
  };
}

// --- periods ----------------------------------------------------------------

export interface PeriodDef {
  key: string;
  label: string;
  /** length of the window in days; the comparison window is the equal span before it */
  days: number;
  /** chart granularity for this period */
  granularity: "day" | "month";
}

export const PERIODS: PeriodDef[] = [
  { key: "7d", label: "7 dní", days: 7, granularity: "day" },
  { key: "30d", label: "30 dní", days: 30, granularity: "day" },
  { key: "90d", label: "90 dní", days: 90, granularity: "day" },
  { key: "12m", label: "12 měsíců", days: 365, granularity: "month" },
];

export interface PeriodResult {
  current: Totals;
  previous: Totals;
  /** relative change per metric (fraction); previous-window baseline */
  delta: Record<MetricKey, number>;
  /** daily points of the current window (for the trend chart) */
  points: DailyPoint[];
  /** daily points of the equal-length comparison window, for the overlay */
  comparePoints: DailyPoint[];
}

/** Slice the last `days` as the current window and the preceding `days` as the
 *  comparison window, then compute totals and relative deltas for each metric. */
export function evaluatePeriod(daily: DailyPoint[], days: number): PeriodResult {
  const n = daily.length;
  // Cap the window to half the series so the current and comparison windows are
  // always equal length. Without this, a period longer than half the data would
  // be compared against a shorter baseline and inflate every delta.
  const span = Math.min(days, Math.floor(n / 2));
  const current = daily.slice(n - span);
  const previous = daily.slice(n - span * 2, n - span);
  const c = totalsOf(current);
  const p = totalsOf(previous);

  const rel = (cur: number, prev: number): number => (prev > 0 ? (cur - prev) / prev : 0);
  const delta: Record<MetricKey, number> = {
    visits: rel(c.visits, p.visits),
    cost: rel(c.cost, p.cost),
    conversions: rel(c.conversions, p.conversions),
    revenue: rel(c.revenue, p.revenue),
    pno: rel(c.pno, p.pno),
    aov: rel(c.aov, p.aov),
    cr: rel(c.cr, p.cr),
    roas: rel(c.roas, p.roas),
  };
  return { current: c, previous: p, delta, points: current, comparePoints: previous };
}

// --- monthly goal pacing & forecast -----------------------------------------

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
  /** projection / goal */
  attainment: number;
  /** projection ≥ goal */
  willHitGoal: boolean;
}

/** UTC day-of-week (0=Sun..6=Sat) for an ISO date string. */
const dayOfWeek = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Average value per weekday (Sun..Sat) for an additive metric over a trailing
 *  window of whole weeks, normalised so the mean weekday weight is 1. Falls back
 *  to flat weights when there is too little data. Captures the day-of-week
 *  seasonality baked into the series so days can be weighted by their weekday mix
 *  (used by the forecast) or de-seasonalised (used by anomaly detection). */
function weekdayWeightsFor(daily: DailyPoint[], key: RawMetric): number[] {
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
function weekdayWeights(daily: DailyPoint[]): number[] {
  return weekdayWeightsFor(daily, "revenue");
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
    attainment: goal > 0 ? projection / goal : 0,
    willHitGoal: projection >= goal,
  };
}

// --- chart buckets ----------------------------------------------------------

export interface Bucket extends Totals {
  date: string;
  label: string;
}

/** Group daily points into chart buckets (by day or calendar month). */
export function bucketize(points: DailyPoint[], granularity: "day" | "month"): Bucket[] {
  if (granularity === "day") {
    return points.map((p) => ({ date: p.date, label: p.date, ...totalsOf([p]) }));
  }
  const groups = new Map<string, DailyPoint[]>();
  for (const p of points) {
    const key = p.date.slice(0, 7); // YYYY-MM
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.entries()].map(([key, pts]) => ({
    date: `${key}-01`,
    label: key,
    ...totalsOf(pts),
  }));
}

// --- channels ---------------------------------------------------------------

export interface ChannelRow extends Totals {
  channel: string;
  color: string;
  /** share of total revenue, for the breakdown bar */
  revenueShare: number;
}

/** Project the channel mix onto the totals of the selected period. Because the
 *  shares differ per dimension, each channel gets its own realistic CR/AOV/PNO. */
export function channelRows(channels: ChannelShare[], totals: Totals): ChannelRow[] {
  return channels
    .map((ch) => {
      const visits = totals.visits * ch.shares.visits;
      const cost = totals.cost * ch.shares.cost;
      const conversions = totals.conversions * ch.shares.conversions;
      const revenue = totals.revenue * ch.shares.revenue;
      return {
        channel: ch.channel,
        color: ch.color,
        visits,
        cost,
        conversions,
        revenue,
        pno: safe(cost, revenue),
        aov: safe(revenue, conversions),
        cr: safe(conversions, visits),
        roas: safe(revenue, cost),
        revenueShare: ch.shares.revenue,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// --- anomaly detection ------------------------------------------------------

export type AnomalyKind = "spike" | "drop" | "outage" | "goal-breach";

export interface Anomaly {
  date: string;
  /** the metric that anomalies (revenue/cost/conversions/visits, or pno for a breach) */
  metric: MetricKey;
  observed: number;
  /** de-seasonalised rolling expectation for that day (the goal for a breach) */
  expected: number;
  /** standardised deviation from the rolling baseline (signed) */
  z: number;
  kind: AnomalyKind;
}

export interface AnomalyOptions {
  /** trailing baseline window in days (a multiple of 7 keeps weekdays balanced) */
  window?: number;
  /** |z| threshold to flag a point */
  z?: number;
}

/**
 * Flag individual days whose metric value deviates from a de-seasonalised
 * trailing baseline (spike / drop / outage), plus PNO goal-breaches that are
 * actually driven by an anomalous day (a cost spike or a revenue collapse) so
 * normal daily variance isn't reported. Pure; reuses the same weekday-seasonality
 * idea as `monthlyPacing`, so it can't double-count weekend dips.
 */
export function detectAnomalies(
  daily: DailyPoint[],
  goals: { pno: number },
  options: AnomalyOptions = {}
): Anomaly[] {
  const window = options.window ?? 28;
  const threshold = options.z ?? 2.5;
  if (daily.length < window + 1) return [];

  const metrics: RawMetric[] = ["revenue", "cost", "conversions", "visits"];
  const out: Anomaly[] = [];
  const zByMetric: Partial<Record<RawMetric, Map<string, number>>> = {};

  for (const key of metrics) {
    const weights = weekdayWeightsFor(daily, key);
    // De-seasonalise so a normal weekend low isn't mistaken for a drop.
    const adj = daily.map((p) => {
      const w = weights[dayOfWeek(p.date)] || 1;
      return p[key] / (w > 0 ? w : 1);
    });
    const zMap = new Map<string, number>();
    for (let i = window; i < daily.length; i++) {
      const base = adj.slice(i - window, i);
      const mean = base.reduce((a, b) => a + b, 0) / base.length;
      const variance = base.reduce((a, b) => a + (b - mean) ** 2, 0) / base.length;
      const std = Math.sqrt(variance);
      if (!(std > 0)) continue;
      const z = (adj[i] - mean) / std;
      zMap.set(daily[i].date, z);
      if (Math.abs(z) < threshold) continue;
      const w = weights[dayOfWeek(daily[i].date)] || 1;
      const expected = mean * (w > 0 ? w : 1);
      const observed = daily[i][key];
      const nearZero = expected > 0 && observed <= expected * 0.1;
      const kind: AnomalyKind = z < 0 && nearZero ? "outage" : z > 0 ? "spike" : "drop";
      out.push({ date: daily[i].date, metric: key, observed, expected, z, kind });
    }
    zByMetric[key] = zMap;
  }

  // PNO goal-breach: a day whose pno exceeds the goal AND is driven by an
  // anomalous cost spike or revenue collapse (not ordinary daily variance).
  const costZ = zByMetric.cost;
  const revZ = zByMetric.revenue;
  for (let i = window; i < daily.length; i++) {
    const p = daily[i];
    if (p.revenue <= 0) continue;
    const pno = p.cost / p.revenue;
    if (pno <= goals.pno) continue;
    const cz = costZ?.get(p.date) ?? 0;
    const rz = revZ?.get(p.date) ?? 0;
    if (cz >= threshold || rz <= -threshold) {
      out.push({ date: p.date, metric: "pno", observed: pno, expected: goals.pno, z: Math.max(cz, -rz), kind: "goal-breach" });
    }
  }

  return out.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : Math.abs(b.z) - Math.abs(a.z)
  );
}

// --- metric metadata --------------------------------------------------------

export interface MetricMeta {
  key: MetricKey;
  label: string;
  short: string;
  description: string;
  /** which direction is "good" — used to colour deltas (PNO down = good) */
  goodDirection: "up" | "down";
  format: (v: number) => string;
  /** compact form for chart axes / tooltips */
  formatCompact: (v: number) => string;
  /** whether this metric can be plotted as a sum over time */
  plottable: boolean;
}

export const METRICS: Record<MetricKey, MetricMeta> = {
  visits: {
    key: "visits",
    label: "Návštěvy",
    short: "Návštěvy",
    description: "Počet návštěv napříč všemi kanály.",
    goodDirection: "up",
    format: fmtInt,
    formatCompact: (v) => fmtInt(v),
    plottable: true,
  },
  cost: {
    key: "cost",
    label: "Náklady",
    short: "Náklady",
    description: "Mediální výdaje na reklamu.",
    goodDirection: "down",
    format: fmtCZK,
    formatCompact: fmtCZKCompact,
    plottable: true,
  },
  conversions: {
    key: "conversions",
    label: "Konverze",
    short: "Konverze",
    description: "Počet dokončených objednávek.",
    goodDirection: "up",
    format: fmtInt,
    formatCompact: (v) => fmtInt(v),
    plottable: true,
  },
  revenue: {
    key: "revenue",
    label: "Hodnota konverzí",
    short: "Obrat",
    description: "Obrat připsaný marketingu (hodnota konverzí).",
    goodDirection: "up",
    format: fmtCZK,
    formatCompact: fmtCZKCompact,
    plottable: true,
  },
  pno: {
    key: "pno",
    label: "PNO",
    short: "PNO",
    description: "Podíl nákladů na obratu = náklady / obrat.",
    goodDirection: "down",
    format: (v) => fmtPct(v),
    formatCompact: (v) => fmtPct(v),
    plottable: true,
  },
  aov: {
    key: "aov",
    label: "Prům. hodnota objednávky",
    short: "AOV",
    description: "Average order value = obrat / konverze.",
    goodDirection: "up",
    format: fmtCZK,
    formatCompact: fmtCZKCompact,
    plottable: false,
  },
  cr: {
    key: "cr",
    label: "Konverzní poměr",
    short: "CR",
    description: "Podíl návštěv, které skončily objednávkou.",
    goodDirection: "up",
    format: (v) => fmtPct(v, 2),
    formatCompact: (v) => fmtPct(v, 1),
    plottable: false,
  },
  roas: {
    key: "roas",
    label: "ROAS",
    short: "ROAS",
    description: "Návratnost výdajů = obrat / náklady.",
    goodDirection: "up",
    format: (v) => fmtMultiple(v),
    formatCompact: (v) => fmtMultiple(v),
    plottable: false,
  },
};

/** Metrics shown as headline KPI cards, in order (mirrors the assignment). */
export const HEADLINE_METRICS: MetricKey[] = [
  "visits",
  "cost",
  "conversions",
  "revenue",
  "pno",
];

/** Metrics offered as toggles on the main trend chart. */
export const TREND_METRICS: MetricKey[] = ["revenue", "cost", "visits", "conversions", "pno"];

/** Convenience accessor for the dataset (typed import target). */
export type { PerformanceData };
