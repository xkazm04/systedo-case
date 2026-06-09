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
  points: DailyPoint[];
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
  return { current: c, previous: p, delta, points: current };
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
