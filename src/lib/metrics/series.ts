/** Period comparison (current vs equal-length previous window) with deltas and a
 *  dependency-free two-sample significance, plus chart bucketing by day or month. */

import type { DailyPoint, MetricKey } from "../types";
import { rel, totalsOf, type Totals } from "./totals";

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

/** How trustworthy a period-over-period delta is, from a two-sample comparison
 *  of the daily values: "noise" = within normal variance, "strong" ≈ p < 0.05. */
export type Significance = "strong" | "weak" | "noise";

export interface PeriodResult {
  current: Totals;
  previous: Totals;
  /** relative change per metric (fraction); previous-window baseline */
  delta: Record<MetricKey, number>;
  /** confidence that each delta is real rather than daily noise */
  significance: Record<MetricKey, Significance>;
  /** daily points of the current window (for the trend chart) */
  points: DailyPoint[];
  /** daily points of the equal-length comparison window, for the overlay */
  comparePoints: DailyPoint[];
  /** the window length the period asked for (days) */
  requestedDays: number;
  /** the window length actually used after capping to ⌊n/2⌋ for an equal-length
   *  comparison; equals requestedDays when the series is long enough */
  actualDays: number;
  /** true when actualDays < requestedDays — the series was too short, so e.g.
   *  "12 měsíců" silently became a shorter span. Surfacing it lets the UI warn. */
  truncated: boolean;
}

/** Per-day value of any metric (raw additive, or a derived ratio per day). */
function dailyValue(p: DailyPoint, key: MetricKey): number {
  switch (key) {
    case "visits": return p.visits;
    case "cost": return p.cost;
    case "conversions": return p.conversions;
    case "revenue": return p.revenue;
    case "pno": return p.revenue > 0 ? p.cost / p.revenue : 0;
    case "aov": return p.conversions > 0 ? p.revenue / p.conversions : 0;
    case "cr": return p.visits > 0 ? p.conversions / p.visits : 0;
    case "roas": return p.cost > 0 ? p.revenue / p.cost : 0;
  }
}

function meanVar(xs: number[]): { mean: number; variance: number; n: number } {
  const n = xs.length;
  if (n === 0) return { mean: 0, variance: 0, n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, variance, n };
}

/** Two-sample normal-approx (Welch-style) significance of the change in a metric
 *  between two equal-length daily windows. Dependency-free. */
function significanceFor(current: DailyPoint[], previous: DailyPoint[], key: MetricKey): Significance {
  const a = meanVar(current.map((p) => dailyValue(p, key)));
  const b = meanVar(previous.map((p) => dailyValue(p, key)));
  if (a.n < 2 || b.n < 2) return "noise";
  const se = Math.sqrt(a.variance / a.n + b.variance / b.n);
  if (!(se > 0)) return a.mean === b.mean ? "noise" : "strong";
  const z = Math.abs(a.mean - b.mean) / se;
  return z >= 2 ? "strong" : z >= 1 ? "weak" : "noise";
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
  const significance: Record<MetricKey, Significance> = {
    visits: significanceFor(current, previous, "visits"),
    cost: significanceFor(current, previous, "cost"),
    conversions: significanceFor(current, previous, "conversions"),
    revenue: significanceFor(current, previous, "revenue"),
    pno: significanceFor(current, previous, "pno"),
    aov: significanceFor(current, previous, "aov"),
    cr: significanceFor(current, previous, "cr"),
    roas: significanceFor(current, previous, "roas"),
  };
  return {
    current: c,
    previous: p,
    delta,
    significance,
    points: current,
    comparePoints: previous,
    requestedDays: days,
    actualDays: span,
    truncated: span < days,
  };
}

// --- chart buckets ----------------------------------------------------------

export interface Bucket extends Totals {
  date: string;
  label: string;
  /** true for a month bucket whose day-count is less than its calendar length (a
   *  partial leading/trailing month), so the UI can avoid reading a half-month bar
   *  as a full-month collapse. Always false for day buckets. */
  partial: boolean;
}

/** Group daily points into chart buckets (by day or calendar month). */
export function bucketize(points: DailyPoint[], granularity: "day" | "month"): Bucket[] {
  if (granularity === "day") {
    return points.map((p) => ({ date: p.date, label: p.date, partial: false, ...totalsOf([p]) }));
  }
  const groups = new Map<string, DailyPoint[]>();
  for (const p of points) {
    const key = p.date.slice(0, 7); // YYYY-MM
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.entries()].map(([key, pts]) => {
    const [y, m] = key.split("-").map(Number); // m is 1-based
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      date: `${key}-01`,
      label: key,
      partial: pts.length < daysInMonth,
      ...totalsOf(pts),
    };
  });
}
