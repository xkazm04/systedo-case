/** Overhead allocation (#5). Pure compute: load fixed monthly overhead and a
 *  per-order fulfilment cost on top of the gross-margin view to get a true
 *  contribution-margin POAS and an overhead-adjusted break-even ROAS per channel.
 *
 *  Monthly overhead is scaled to the analysed window (`months`) and allocated
 *  across channels by revenue share; fulfilment cost is charged per conversion.
 *  No I/O, no React. */
import type { ChannelRow } from "@/lib/metrics";
import { FALLBACK_MARGIN } from "./sample";
import type {
  ChannelMargin,
  OverheadOptions,
  OverheadRow,
  OverheadSummary,
} from "./types";

export function applyOverhead(
  rows: ChannelRow[],
  margins: ChannelMargin[],
  opts: OverheadOptions
): { rows: OverheadRow[]; summary: OverheadSummary } {
  const marginByChannel = new Map(margins.map((m) => [m.channel, m.marginPct]));
  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  // Scale the monthly fixed overhead to the analysed window; non-positive /
  // disabled inputs collapse to zero so the view degrades to the gross-margin one.
  const months = Math.max(0, opts.months);
  const periodOverhead = opts.enabled ? Math.max(0, opts.monthlyOverhead) * months : 0;
  const perOrder = opts.enabled ? Math.max(0, opts.perOrderCost) : 0;

  const out: OverheadRow[] = rows.map((r) => {
    const marginPct = marginByChannel.get(r.channel) ?? FALLBACK_MARGIN;
    const grossProfit = r.revenue * marginPct;
    const netProfit = grossProfit - r.cost;
    const poas = r.cost > 0 ? grossProfit / r.cost : 0;
    const breakEvenRoas = marginPct > 0 ? 1 / marginPct : Infinity;

    const revShare = totalRevenue > 0 ? r.revenue / totalRevenue : 0;
    const allocatedOverhead = periodOverhead * revShare;
    const fulfilmentCost = perOrder * r.conversions;
    const contributionProfit = grossProfit - allocatedOverhead - fulfilmentCost;
    // Single "unprofitable once overhead is loaded in" verdict: contribution
    // can't cover the channel's own ad spend. unprofitableCount and the row
    // colour both read this so they can never disagree.
    const contributionProfitable = contributionProfit >= r.cost;
    // POAS mirrors the gross-margin definition (profit per koruna of ad spend),
    // so the raw and contribution POAS are directly comparable side by side.
    const contributionPoas = r.cost > 0 ? contributionProfit / r.cost : 0;

    // Break-even ROAS once overhead + fulfilment are loaded in: the channel must
    // cover ad spend AND its share of overhead/fulfilment out of its margin.
    // revenue × margin = cost + overhead + perOrder × conv  →  solve for ROAS.
    const loadedCost = r.cost + allocatedOverhead + fulfilmentCost;
    const adjustedBreakEvenRoas =
      marginPct > 0 && r.cost > 0 ? loadedCost / (r.cost * marginPct) : Infinity;

    return {
      channel: r.channel,
      color: r.color,
      revenue: r.revenue,
      cost: r.cost,
      roas: r.roas,
      marginPct,
      grossProfit,
      netProfit,
      poas,
      breakEvenRoas,
      // netProfit ≥ 0 rather than roas ≥ break-even, so a zero-cost channel
      // (guarded roas=0) isn't falsely flagged as a loss. See profit/compute.ts.
      profitable: netProfit >= 0,
      conversions: r.conversions,
      allocatedOverhead,
      fulfilmentCost,
      contributionProfit,
      contributionProfitable,
      contributionPoas,
      adjustedBreakEvenRoas,
    };
  });

  const totalOverhead = out.reduce((a, r) => a + r.allocatedOverhead, 0);
  const totalFulfilment = out.reduce((a, r) => a + r.fulfilmentCost, 0);
  const contributionProfit = out.reduce((a, r) => a + r.contributionProfit, 0);
  const cost = rows.reduce((a, r) => a + r.cost, 0);

  return {
    rows: out.sort((a, b) => b.contributionProfit - a.contributionProfit),
    summary: {
      totalOverhead,
      totalFulfilment,
      contributionProfit,
      contributionPoas: cost > 0 ? contributionProfit / cost : 0,
      // Unprofitable once overhead is loaded in = contribution can't cover the
      // channel's own ad spend (net loss after spend), mirroring the gross view.
      unprofitableCount: out.filter((r) => !r.contributionProfitable).length,
    },
  };
}
