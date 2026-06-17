/** Pure profit math: apply a per-channel margin model to the channel mix to get
 *  gross/net profit, POAS and break-even ROAS per channel plus a portfolio
 *  summary. No I/O, no React — numbers in, numbers out. */
import type { ChannelRow } from "@/lib/metrics";
import { FALLBACK_MARGIN } from "./sample";
import type { ChannelMargin, ProfitRow, ProfitSummary } from "./types";

export function computeProfit(
  rows: ChannelRow[],
  margins: ChannelMargin[]
): { rows: ProfitRow[]; summary: ProfitSummary } {
  const marginByChannel = new Map(margins.map((m) => [m.channel, m.marginPct]));

  const out: ProfitRow[] = rows.map((r) => {
    const marginPct = marginByChannel.get(r.channel) ?? FALLBACK_MARGIN;
    const grossProfit = r.revenue * marginPct;
    const netProfit = grossProfit - r.cost;
    const poas = r.cost > 0 ? grossProfit / r.cost : 0;
    const breakEvenRoas = marginPct > 0 ? 1 / marginPct : Infinity;
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
      profitable: r.roas >= breakEvenRoas,
    };
  });

  const revenue = out.reduce((a, r) => a + r.revenue, 0);
  const cost = out.reduce((a, r) => a + r.cost, 0);
  const grossProfit = out.reduce((a, r) => a + r.grossProfit, 0);
  const netProfit = grossProfit - cost;

  return {
    rows: out.sort((a, b) => b.netProfit - a.netProfit),
    summary: {
      revenue,
      cost,
      grossProfit,
      netProfit,
      roas: cost > 0 ? revenue / cost : 0,
      poas: cost > 0 ? grossProfit / cost : 0,
      blendedMargin: revenue > 0 ? grossProfit / revenue : 0,
      unprofitableCount: out.filter((r) => !r.profitable).length,
    },
  };
}
