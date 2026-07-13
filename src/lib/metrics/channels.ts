/** Channel breakdown: project the channel mix onto a period's totals, optionally
 *  carrying period-over-period deltas per metric. When the dataset supplies a
 *  per-day channel mix (`channelDaily`), the deltas become REAL — each channel is
 *  summed from its own daily shares — instead of the aggregate delta redistributed
 *  identically to every channel. */

import type { ChannelDailyShare, ChannelShare, DailyPoint, MetricKey } from "../types";
import { safe } from "./ratios";
import { rel, relSigned, type Totals } from "./totals";

export interface ChannelRow extends Totals {
  channel: string;
  color: string;
  /** share of total revenue, for the breakdown bar */
  revenueShare: number;
  /** period-over-period relative change per metric — present only when the row
   *  was built by `channelRowsCompared` */
  delta?: Record<MetricKey, number>;
  /** current-vs-previous change in this channel's REVENUE SHARE, in fractional
   *  points (e.g. +0.06 = "+6 p.b."). Present ONLY on the time-resolved path
   *  (a dataset with `channelDaily`); undefined on the static projection, where
   *  every channel's share is constant so a share move is definitionally 0. */
  revenueShareDelta?: number;
}

/** Raw additive metrics accumulated per channel before ratios are derived. */
interface RawSums {
  visits: number;
  cost: number;
  conversions: number;
  revenue: number;
}

/** Build a channel's Totals row from its raw additive sums (ratios derived the
 *  same way as the aggregate totals so the table reconciles). The channel mix
 *  carries no impressions/clicks, so the paid-traffic pair (and its CTR/CPC)
 *  reads 0 per channel — the aggregate CTR/CPC lives on the period totals. */
function rowFromSums(channel: string, color: string, s: RawSums, revenueShare: number): ChannelRow {
  return {
    channel,
    color,
    visits: s.visits,
    cost: s.cost,
    conversions: s.conversions,
    revenue: s.revenue,
    impressions: 0,
    clicks: 0,
    profit: s.revenue - s.cost,
    pno: safe(s.cost, s.revenue),
    aov: safe(s.revenue, s.conversions),
    cr: safe(s.conversions, s.visits),
    roas: safe(s.revenue, s.cost),
    ctr: 0,
    cpc: 0,
    revenueShare,
  };
}

/** Project the channel mix onto the totals of the selected period. Because the
 *  shares differ per dimension, each channel gets its own realistic CR/AOV/PNO. */
export function channelRows(channels: ChannelShare[], totals: Totals): ChannelRow[] {
  return channels
    .map((ch) =>
      rowFromSums(
        ch.channel,
        ch.color,
        {
          visits: totals.visits * ch.shares.visits,
          cost: totals.cost * ch.shares.cost,
          conversions: totals.conversions * ch.shares.conversions,
          revenue: totals.revenue * ch.shares.revenue,
        },
        ch.shares.revenue
      )
    )
    .sort((a, b) => b.revenue - a.revenue);
}

/** The per-day channel mix resolved to a comparison: the current and previous
 *  window's daily points, plus a date→per-channel-shares lookup (index-parallel to
 *  `channels`). Build it with {@link resolveChannelTime}; pass it to
 *  {@link channelRowsCompared} to get real per-channel deltas. */
export interface ChannelTimeResolved {
  currentPoints: DailyPoint[];
  previousPoints: DailyPoint[];
  /** date → per-channel share dims, index-parallel to `channels` */
  sharesByDate: Map<string, ChannelShare["shares"][]>;
}

/** Sum each channel's raw metrics over a window from its per-day shares. Returns
 *  one RawSums per channel, index-parallel to `channels`. */
function sumChannelsOverWindow(
  channelCount: number,
  points: DailyPoint[],
  sharesByDate: Map<string, ChannelShare["shares"][]>
): RawSums[] {
  const sums: RawSums[] = Array.from({ length: channelCount }, () => ({
    visits: 0,
    cost: 0,
    conversions: 0,
    revenue: 0,
  }));
  for (const p of points) {
    const dayShares = sharesByDate.get(p.date);
    if (!dayShares) continue;
    for (let c = 0; c < channelCount; c++) {
      const sh = dayShares[c];
      if (!sh) continue;
      sums[c].visits += p.visits * sh.visits;
      sums[c].cost += p.cost * sh.cost;
      sums[c].conversions += p.conversions * sh.conversions;
      sums[c].revenue += p.revenue * sh.revenue;
    }
  }
  return sums;
}

/** Validate that a dataset's `channelDaily` covers both comparison windows at the
 *  right channel arity, then package it for {@link channelRowsCompared}. Returns
 *  `undefined` when the data is absent or doesn't fully cover the windows — the
 *  caller then falls back to the static projection (current, byte-identical
 *  behavior). Keeps the "is the mix time-resolved?" decision in one place. */
export function resolveChannelTime(
  channelCount: number,
  channelDaily: ChannelDailyShare[] | undefined,
  currentPoints: DailyPoint[],
  previousPoints: DailyPoint[]
): ChannelTimeResolved | undefined {
  if (!channelDaily || channelDaily.length === 0) return undefined;
  const sharesByDate = new Map(channelDaily.map((d) => [d.date, d.shares]));
  const covered = (pts: DailyPoint[]): boolean =>
    pts.length > 0 &&
    pts.every((p) => {
      const s = sharesByDate.get(p.date);
      return s !== undefined && s.length === channelCount;
    });
  if (!covered(currentPoints) || !covered(previousPoints)) return undefined;
  return { currentPoints, previousPoints, sharesByDate };
}

/** Channel rows for the current period, each carrying its period-over-period
 *  `delta` against the equal-length previous window.
 *
 *  STATIC path (no `timeResolved`): channels are projected as a constant share of
 *  the period totals, so every channel's *revenue* `delta` algebraically equals the
 *  aggregate revenue delta (the share cancels in `rel(total*share, prevTotal*share)`).
 *  The channel table therefore renders the revenue delta once, on the Total row —
 *  showing it per channel would print the same number on every row and read as fake
 *  data. This is the backward-compatible behavior for datasets without a per-day mix.
 *
 *  TIME-RESOLVED path (`timeResolved` present): each channel is summed from its OWN
 *  daily shares over the current and previous windows, so the deltas are genuinely
 *  per-channel and a mix shift is detectable (see `revenueShareDelta`). */
export function channelRowsCompared(
  channels: ChannelShare[],
  current: Totals,
  previous: Totals,
  timeResolved?: ChannelTimeResolved
): ChannelRow[] {
  if (timeResolved) {
    return channelRowsRealCompared(channels, current, previous, timeResolved);
  }
  const prevByChannel = new Map(channelRows(channels, previous).map((r) => [r.channel, r]));
  return channelRows(channels, current).map((row) => {
    const prev = prevByChannel.get(row.channel);
    return { ...row, delta: deltaBetween(row, prev) };
  });
}

/** Real per-channel comparison from the per-day mix. */
function channelRowsRealCompared(
  channels: ChannelShare[],
  current: Totals,
  previous: Totals,
  tr: ChannelTimeResolved
): ChannelRow[] {
  const n = channels.length;
  const curSums = sumChannelsOverWindow(n, tr.currentPoints, tr.sharesByDate);
  const prevSums = sumChannelsOverWindow(n, tr.previousPoints, tr.sharesByDate);
  // Window revenue totals for the share denominators (current + previous), so a
  // channel's revenue SHARE — not just its koruna revenue — can move over time.
  const curRevTotal = curSums.reduce((a, s) => a + s.revenue, 0);
  const prevRevTotal = prevSums.reduce((a, s) => a + s.revenue, 0);

  return channels
    .map((ch, c) => {
      const cur = curSums[c];
      const prev = prevSums[c];
      const revShare = curRevTotal > 0 ? cur.revenue / curRevTotal : 0;
      const prevRevShare = prevRevTotal > 0 ? prev.revenue / prevRevTotal : 0;
      const row = rowFromSums(ch.channel, ch.color, cur, revShare);
      const prevRow = rowFromSums(ch.channel, ch.color, prev, prevRevShare);
      return {
        ...row,
        delta: deltaBetween(row, prevRow),
        revenueShareDelta: revShare - prevRevShare,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

/** Period-over-period relative change per metric between a channel row and its
 *  previous-window twin (missing twin → zero baseline). */
function deltaBetween(row: ChannelRow, prev: ChannelRow | undefined): Record<MetricKey, number> {
  return {
    visits: rel(row.visits, prev?.visits ?? 0),
    cost: rel(row.cost, prev?.cost ?? 0),
    conversions: rel(row.conversions, prev?.conversions ?? 0),
    revenue: rel(row.revenue, prev?.revenue ?? 0),
    profit: relSigned(row.profit, prev?.profit ?? 0), // signed metric — see totals.relSigned
    pno: rel(row.pno, prev?.pno ?? 0),
    aov: rel(row.aov, prev?.aov ?? 0),
    cr: rel(row.cr, prev?.cr ?? 0),
    roas: rel(row.roas, prev?.roas ?? 0),
    ctr: rel(row.ctr, prev?.ctr ?? 0),
    cpc: rel(row.cpc, prev?.cpc ?? 0),
  };
}
