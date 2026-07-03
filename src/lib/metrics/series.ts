/** Period comparison (current vs equal-length previous window) with deltas and a
 *  dependency-free two-sample significance, plus chart bucketing by day or month. */

import type { DailyPoint, MetricKey } from "../types";
import type { SupportedLocale } from "../format";
import { rel, totalsOf, type Totals } from "./totals";

// --- periods ----------------------------------------------------------------

export interface PeriodDef {
  key: string;
  label: string;
  /** English label — pick via {@link periodLabel} so the locale switcher works */
  labelEn: string;
  /** length of the window in days; the comparison window is the equal span before it */
  days: number;
  /** chart granularity for this period */
  granularity: "day" | "month";
}

export const PERIODS: PeriodDef[] = [
  { key: "7d", label: "7 dní", labelEn: "7 days", days: 7, granularity: "day" },
  { key: "30d", label: "30 dní", labelEn: "30 days", days: 30, granularity: "day" },
  { key: "90d", label: "90 dní", labelEn: "90 days", days: 90, granularity: "day" },
  { key: "12m", label: "12 měsíců", labelEn: "12 months", days: 365, granularity: "month" },
];

/** Localised period label, mirroring `metricLabel`: falls back to Czech when no
 *  locale is given, so the snapshot/article writers keep their cs output. */
export function periodLabel(p: PeriodDef, locale?: SupportedLocale): string {
  return locale === "en" ? p.labelEn : p.label;
}

/** Which window the comparison uses: the adjacent equal-length window right
 *  before the current one ("previous"), or the same window shifted back exactly
 *  one year ("yoy") — the like-for-like baseline for a seasonal business, where
 *  comparing December against September–November reads pure Christmas
 *  seasonality as agency performance. */
export type PeriodBaseline = "previous" | "yoy";

/** Days the YoY comparison shifts back. The seed is deliberately 730 daily
 *  points — two of these — so every window up to a year has a year-ago twin. */
const YOY_SHIFT_DAYS = 365;

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
  /** the comparison baseline actually used. Equals what the caller asked for,
   *  except when a "yoy" request could not fit even a single day a year back —
   *  then the engine falls back to "previous" and says so here, so the UI and
   *  the AI grounding never claim a year-over-year comparison that didn't happen. */
  baseline: PeriodBaseline;
}

/** Per-day value of any metric (raw additive, or a derived ratio per day). The
 *  paid-traffic ratios read 0 when the optional impressions/clicks are absent. */
function dailyValue(p: DailyPoint, key: MetricKey): number {
  switch (key) {
    case "visits": return p.visits;
    case "cost": return p.cost;
    case "conversions": return p.conversions;
    case "revenue": return p.revenue;
    case "profit": return p.revenue - p.cost;
    case "pno": return p.revenue > 0 ? p.cost / p.revenue : 0;
    case "aov": return p.conversions > 0 ? p.revenue / p.conversions : 0;
    case "cr": return p.visits > 0 ? p.conversions / p.visits : 0;
    case "roas": return p.cost > 0 ? p.revenue / p.cost : 0;
    case "ctr": return (p.impressions ?? 0) > 0 ? (p.clicks ?? 0) / (p.impressions ?? 0) : 0;
    case "cpc": return (p.clicks ?? 0) > 0 ? p.cost / (p.clicks ?? 0) : 0;
  }
}

function meanVar(xs: number[]): { mean: number; variance: number; n: number } {
  const n = xs.length;
  if (n === 0) return { mean: 0, variance: 0, n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  // Sample variance (Bessel's correction, ÷(n−1)): these are a sample of daily
  // values, not the whole population, so the unbiased estimator is correct here.
  // A single day has no spread, so variance is 0.
  const variance = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, variance, n };
}

/** Two-sample normal-approx significance of the change in a metric between two
 *  equal-length daily windows, using sample variance and a z-test (z≥2 ≈ "strong",
 *  z≥1 "weak"). A normal approximation on daily values — a deliberate, dependency-
 *  free heuristic for a "is this real or noise?" badge, not a rigorous p-value
 *  (it oversells significance on very short windows). */
function significanceFor(current: DailyPoint[], previous: DailyPoint[], key: MetricKey): Significance {
  const a = meanVar(current.map((p) => dailyValue(p, key)));
  const b = meanVar(previous.map((p) => dailyValue(p, key)));
  if (a.n < 2 || b.n < 2) return "noise";
  const se = Math.sqrt(a.variance / a.n + b.variance / b.n);
  if (!(se > 0)) return a.mean === b.mean ? "noise" : "strong";
  const z = Math.abs(a.mean - b.mean) / se;
  return z >= 2 ? "strong" : z >= 1 ? "weak" : "noise";
}

/** Slice the last `days` as the current window and compare it against the chosen
 *  baseline window: the adjacent equal-length window before it ("previous", the
 *  default) or the same window exactly one year earlier ("yoy"). A YoY request
 *  that cannot fit even one day a year back falls back to "previous"; the result's
 *  `baseline` field always reports which comparison was actually made. */
export function evaluatePeriod(
  daily: DailyPoint[],
  days: number,
  baseline: PeriodBaseline = "previous"
): PeriodResult {
  const n = daily.length;
  if (baseline === "yoy") {
    // Same-period-last-year: the comparison window is the current one shifted
    // back exactly YOY_SHIFT_DAYS. Cap the current window so its year-ago twin
    // still fits inside the series; when the series is too short for even one
    // day, fall through to the adjacent-window baseline below.
    const span = Math.min(days, n - YOY_SHIFT_DAYS);
    if (span >= 1) {
      return compareWindows(
        daily.slice(n - span),
        daily.slice(n - span - YOY_SHIFT_DAYS, n - YOY_SHIFT_DAYS),
        days,
        span,
        "yoy"
      );
    }
  }
  // Cap the window to half the series so the current and comparison windows are
  // always equal length. Without this, a period longer than half the data would
  // be compared against a shorter baseline and inflate every delta.
  const span = Math.min(days, Math.floor(n / 2));
  return compareWindows(
    daily.slice(n - span),
    daily.slice(n - span * 2, n - span),
    days,
    span,
    "previous"
  );
}

/** Totals, deltas and significance for one current-vs-comparison window pair. */
function compareWindows(
  current: DailyPoint[],
  previous: DailyPoint[],
  requestedDays: number,
  span: number,
  baseline: PeriodBaseline
): PeriodResult {
  const c = totalsOf(current);
  const p = totalsOf(previous);

  const delta: Record<MetricKey, number> = {
    visits: rel(c.visits, p.visits),
    cost: rel(c.cost, p.cost),
    conversions: rel(c.conversions, p.conversions),
    revenue: rel(c.revenue, p.revenue),
    profit: rel(c.profit, p.profit),
    pno: rel(c.pno, p.pno),
    aov: rel(c.aov, p.aov),
    cr: rel(c.cr, p.cr),
    roas: rel(c.roas, p.roas),
    ctr: rel(c.ctr, p.ctr),
    cpc: rel(c.cpc, p.cpc),
  };
  const significance: Record<MetricKey, Significance> = {
    visits: significanceFor(current, previous, "visits"),
    cost: significanceFor(current, previous, "cost"),
    conversions: significanceFor(current, previous, "conversions"),
    revenue: significanceFor(current, previous, "revenue"),
    profit: significanceFor(current, previous, "profit"),
    pno: significanceFor(current, previous, "pno"),
    aov: significanceFor(current, previous, "aov"),
    cr: significanceFor(current, previous, "cr"),
    roas: significanceFor(current, previous, "roas"),
    ctr: significanceFor(current, previous, "ctr"),
    cpc: significanceFor(current, previous, "cpc"),
  };
  return {
    current: c,
    previous: p,
    delta,
    significance,
    points: current,
    comparePoints: previous,
    requestedDays,
    actualDays: span,
    truncated: span < requestedDays,
    baseline,
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
