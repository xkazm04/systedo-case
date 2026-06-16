/** Channel breakdown: project the channel mix onto a period's totals, optionally
 *  carrying period-over-period deltas per metric. */

import type { ChannelShare, MetricKey } from "../types";
import { safe } from "./ratios";
import { rel, type Totals } from "./totals";

export interface ChannelRow extends Totals {
  channel: string;
  color: string;
  /** share of total revenue, for the breakdown bar */
  revenueShare: number;
  /** period-over-period relative change per metric — present only when the row
   *  was built by `channelRowsCompared` */
  delta?: Record<MetricKey, number>;
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

/** Channel rows for the current period, each carrying its period-over-period
 *  `delta` against the equal-length previous window — turns the channel table
 *  from a static snapshot into a movement view ("Sklik obrat +18 %"). */
export function channelRowsCompared(
  channels: ChannelShare[],
  current: Totals,
  previous: Totals
): ChannelRow[] {
  const prevByChannel = new Map(channelRows(channels, previous).map((r) => [r.channel, r]));
  return channelRows(channels, current).map((row) => {
    const prev = prevByChannel.get(row.channel);
    const delta: Record<MetricKey, number> = {
      visits: rel(row.visits, prev?.visits ?? 0),
      cost: rel(row.cost, prev?.cost ?? 0),
      conversions: rel(row.conversions, prev?.conversions ?? 0),
      revenue: rel(row.revenue, prev?.revenue ?? 0),
      pno: rel(row.pno, prev?.pno ?? 0),
      aov: rel(row.aov, prev?.aov ?? 0),
      cr: rel(row.cr, prev?.cr ?? 0),
      roas: rel(row.roas, prev?.roas ?? 0),
    };
    return { ...row, delta };
  });
}
