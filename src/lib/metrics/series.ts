/** Period comparison (current vs equal-length previous window) with deltas and a
 *  dependency-free two-sample significance, plus chart bucketing by day or month. */

import type { DailyPoint, MetricKey } from "../types";
import type { SupportedLocale } from "../format";
import { rel, relSigned, totalsOf, type Totals } from "./totals";
import { pno, aov, cr, roas, ctr, cpc } from "./ratios";
import { mean as meanOf, sampleVariance } from "./config";

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

/** Days the YoY comparison shifts back — 364 = exactly 52 weeks, deliberately NOT
 *  365. A 52-week shift lands the year-ago twin on the SAME weekday, so a business
 *  with strong day-of-week shape (weekends low, Monday peak…) compares like-for-like;
 *  a 365-day shift slides the twin by one weekday every year — two across a leap
 *  year — reading a Mon-vs-Sun gap as a year-over-year move. The 1-day calendar drift
 *  this trades away is immaterial next to weekday parity. The 730-point seed still
 *  gives every window up to a year a twin (730 − 364 ≥ any window ≤ 365 days). */
const YOY_SHIFT_DAYS = 364;

/** How trustworthy a period-over-period delta is.
 *  - Additive metrics (visits/cost/conversions/revenue/profit) and the RATE ratios
 *    (CTR, CR) carry a real confidence: "strong" ≈ p < 0.05, "weak" ≈ p < 0.32,
 *    "noise" = within normal variance. Additive uses a two-sample z on daily
 *    values; CTR/CR use a two-proportion z on their underlying counts.
 *  - Value ratios (PNO/ROAS/AOV/CPC) have no sound two-window test — a ratio of
 *    sums isn't a proportion and daily ratios aren't additive samples — so they
 *    report "orientational": an honest directional read with NO confidence claim,
 *    rather than a manufactured badge. */
export type Significance = "strong" | "weak" | "noise" | "orientational";

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
    case "pno": return pno(p.cost, p.revenue);
    case "aov": return aov(p.revenue, p.conversions);
    case "cr": return cr(p.conversions, p.visits);
    case "roas": return roas(p.revenue, p.cost);
    case "ctr": return ctr(p.clicks ?? 0, p.impressions ?? 0);
    case "cpc": return cpc(p.cost, p.clicks ?? 0);
  }
}

function meanVar(xs: number[]): { mean: number; variance: number; n: number } {
  // The engine's one (sample) variance estimator — see ./config. A single day has
  // no spread, so variance is 0.
  return { mean: meanOf(xs), variance: sampleVariance(xs), n: xs.length };
}

/** Sum of a per-day accessor over a window (0 for an empty window). */
function sumOf(points: DailyPoint[], get: (p: DailyPoint) => number): number {
  let s = 0;
  for (const p of points) s += get(p);
  return s;
}

/** Two-sample normal-approx significance of the change in an ADDITIVE metric
 *  between two equal-length daily windows, using sample variance and a z-test
 *  (z≥2 ≈ "strong", z≥1 "weak"). A normal approximation on daily values — a
 *  deliberate, dependency-free heuristic for a "is this real or noise?" badge, not
 *  a rigorous p-value (it oversells on very short windows). */
function additiveSignificance(current: DailyPoint[], previous: DailyPoint[], key: MetricKey): Significance {
  const a = meanVar(current.map((p) => dailyValue(p, key)));
  const b = meanVar(previous.map((p) => dailyValue(p, key)));
  if (a.n < 2 || b.n < 2) return "noise";
  const se = Math.sqrt(a.variance / a.n + b.variance / b.n);
  if (!(se > 0)) return a.mean === b.mean ? "noise" : "strong";
  const z = Math.abs(a.mean - b.mean) / se;
  return z >= 2 ? "strong" : z >= 1 ? "weak" : "noise";
}

/** Two-proportion z-test between two windows for a RATE metric — the statistically
 *  sound significance for CTR (clicks/impressions) and CR (conversions/visits),
 *  computed on the underlying COUNTS instead of by (unsoundly) averaging daily
 *  ratios. Pooled-proportion standard error; z≥2 ≈ "strong", z≥1 "weak". A window
 *  with no trials (0 impressions / 0 visits) can't be compared → "noise". */
function proportionSignificance(sa: number, na: number, sb: number, nb: number): Significance {
  if (!(na > 0) || !(nb > 0)) return "noise";
  const pa = sa / na;
  const pb = sb / nb;
  const pooled = (sa + sb) / (na + nb);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / na + 1 / nb));
  if (!(se > 0)) return pa === pb ? "noise" : "strong";
  const z = Math.abs(pa - pb) / se;
  return z >= 2 ? "strong" : z >= 1 ? "weak" : "noise";
}

/** Per-metric significance of a period-over-period move. Additive metrics keep the
 *  two-sample daily z; the rate ratios (CTR, CR) get a proper two-proportion z on
 *  their counts; the value ratios get an honest orientational read (see
 *  {@link Significance}). */
function significanceFor(current: DailyPoint[], previous: DailyPoint[], key: MetricKey): Significance {
  switch (key) {
    // Rate ratios → two-proportion z on the underlying counts.
    case "ctr":
      return proportionSignificance(
        sumOf(current, (p) => p.clicks ?? 0),
        sumOf(current, (p) => p.impressions ?? 0),
        sumOf(previous, (p) => p.clicks ?? 0),
        sumOf(previous, (p) => p.impressions ?? 0)
      );
    case "cr":
      return proportionSignificance(
        sumOf(current, (p) => p.conversions),
        sumOf(current, (p) => p.visits),
        sumOf(previous, (p) => p.conversions),
        sumOf(previous, (p) => p.visits)
      );
    // Value ratios → no sound two-window test, so an orientational read. Documented
    // per metric: pno = cost/revenue and roas = revenue/cost are money ratios;
    // aov = revenue/conversions and cpc = cost/clicks are per-unit means — none is
    // a proportion, and the old daily-ratio z oversold every one of them.
    case "pno":
    case "roas":
    case "aov":
    case "cpc":
      return "orientational";
    // Additive metrics (visits/cost/conversions/revenue/profit): unchanged.
    default:
      return additiveSignificance(current, previous, key);
  }
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
    // profit is signed — relSigned so a loss→profit turnaround (or the reverse)
    // isn't flattened to 0 % by rel's `prev > 0` guard.
    profit: relSigned(c.profit, p.profit),
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
