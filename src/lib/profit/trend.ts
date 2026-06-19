/** Profit & POAS trend over time (#3). Pure compute: bucket the daily series into
 *  fixed weekly or calendar-monthly windows, project the channel mix onto each
 *  bucket's totals, apply the margin model and reduce to net-profit + POAS per
 *  bucket — the series the sparkline plots. No I/O, no React. */
import type { ChannelShare, DailyPoint } from "@/lib/types";
import { channelRows, totalsOf } from "@/lib/metrics";
import { computeProfit } from "./compute";
import { FALLBACK_MARGIN } from "./sample";
import type { ChannelMargin, ProfitTrendPoint, TrendGranularity } from "./types";

/** ISO week-window key: bucket the day into fixed 7-day windows counted back from
 *  the most recent date, so every bucket is exactly a week even across month/year
 *  boundaries (calendar ISO-week numbering would split unevenly here). */
function bucketKey(date: string, granularity: TrendGranularity, anchorMs: number): string {
  if (granularity === "month") return date.slice(0, 7); // YYYY-MM
  const dayMs = new Date(`${date}T00:00:00Z`).getTime();
  const week = Math.floor((anchorMs - dayMs) / (7 * 86_400_000));
  return `w${String(week).padStart(4, "0")}`;
}

/** Czech short label for a bucket given its first date. */
function bucketLabel(firstDate: string, granularity: TrendGranularity): string {
  if (granularity === "month") return firstDate.slice(0, 7);
  return `t. ${firstDate.slice(5)}`; // "t. 05-18"
}

/**
 * Bucket `daily` into week/month windows, then for each window project the
 * channel mix and apply `margins` to get net profit and POAS. Returned oldest →
 * newest so a sparkline reads left-to-right in time order.
 *
 * `anchorIso` (the latest date in the window) is passed in from the caller —
 * derived server-side — so this stays a pure function with no `Date.now()`.
 */
export function profitTrend(
  daily: DailyPoint[],
  channels: ChannelShare[],
  margins: ChannelMargin[],
  granularity: TrendGranularity,
  anchorIso?: string
): ProfitTrendPoint[] {
  if (daily.length === 0) return [];
  const anchor = anchorIso ?? daily[daily.length - 1]!.date;
  const anchorMs = new Date(`${anchor}T00:00:00Z`).getTime();

  // Group days into buckets, preserving first-seen order of the keys.
  const groups = new Map<string, DailyPoint[]>();
  for (const p of daily) {
    const key = bucketKey(p.date, granularity, anchorMs);
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }

  const points: ProfitTrendPoint[] = [];
  for (const pts of groups.values()) {
    const sorted = [...pts].sort((a, b) => (a.date < b.date ? -1 : 1));
    const firstDate = sorted[0]!.date;
    const { summary } = computeProfit(channelRows(channels, totalsOf(sorted)), margins);
    points.push({
      date: firstDate,
      label: bucketLabel(firstDate, granularity),
      revenue: summary.revenue,
      cost: summary.cost,
      grossProfit: summary.grossProfit,
      netProfit: summary.netProfit,
      poas: summary.poas,
    });
  }

  return points.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Re-apply a margin model to already-bucketed trend points without re-touching
 * the daily series. Each bucket's per-channel revenue is `bucketRevenue × share`
 * (shares are period-independent), so the blended gross profit — and thus net
 * profit and POAS — re-derive from the bucket revenue/cost alone. Lets the client
 * re-drive the trend live on a margin edit while only holding the bucket totals.
 */
export function retargetTrend(
  points: ProfitTrendPoint[],
  channels: ChannelShare[],
  margins: ChannelMargin[]
): ProfitTrendPoint[] {
  const marginByChannel = new Map(margins.map((m) => [m.channel, m.marginPct]));
  // Revenue-weighted blended margin from the channel mix (shares + margins),
  // identical across buckets because the mix is period-independent.
  const totalRevShare = channels.reduce((a, c) => a + c.shares.revenue, 0);
  const blendedMargin =
    totalRevShare > 0
      ? channels.reduce(
          (a, c) => a + c.shares.revenue * (marginByChannel.get(c.channel) ?? FALLBACK_MARGIN),
          0
        ) / totalRevShare
      : FALLBACK_MARGIN;

  return points.map((p) => {
    const grossProfit = p.revenue * blendedMargin;
    return {
      ...p,
      grossProfit,
      netProfit: grossProfit - p.cost,
      poas: p.cost > 0 ? grossProfit / p.cost : 0,
    };
  });
}

/** Relative period-over-period change between the last two trend buckets for a
 *  field, guarding a zero/absent baseline (fraction; e.g. +0.12 = +12 %). */
export function trendDelta(
  points: ProfitTrendPoint[],
  field: "netProfit" | "poas" | "revenue"
): number {
  if (points.length < 2) return 0;
  const cur = points[points.length - 1]![field];
  const prev = points[points.length - 2]![field];
  return prev !== 0 ? (cur - prev) / Math.abs(prev) : 0;
}
