/** Pure profit math: apply a per-channel margin model to the channel mix to get
 *  gross/net profit, POAS and break-even ROAS per channel plus a portfolio
 *  summary. No I/O, no React — numbers in, numbers out. */
import type { ChannelRow } from "@/lib/metrics";
import { FALLBACK_MARGIN } from "./sample";
import type {
  ChannelMargin,
  ProfitRow,
  ProfitSummary,
  ReallocChannel,
  ReallocOptions,
  ReallocPlan,
} from "./types";

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

/** Pure budget-reallocation solver. Holds each channel's ROAS constant (linear:
 *  projected revenue = newSpend × roas), so the marginal net profit per koruna for
 *  a channel is `roas × margin − 1`. Greedily fills budget into channels by
 *  descending marginal profit, each capped at `maxSpendMultiple ×` its current
 *  spend and floored at 0 — so a loss-making channel (roas × margin < 1) is drained
 *  and its budget moves to the best earner. No I/O, no React. */
export function reallocateBudget(
  rows: ProfitRow[],
  opts: ReallocOptions = {}
): ReallocPlan {
  const maxMultiple = opts.maxSpendMultiple ?? 3;
  const currentCost = rows.reduce((a, r) => a + r.cost, 0);
  // Negative / non-finite budgets collapse to zero (drain everything).
  const totalBudget = Math.max(0, opts.totalBudget ?? currentCost);
  const strategy = opts.strategy ?? "max-profit";

  // Per-channel marginal profit and spend cap (0 for a channel with no current spend).
  const base = rows.map((r) => ({
    row: r,
    marginalProfit: r.roas * r.marginPct - 1,
    cap: Math.max(0, r.cost) * maxMultiple,
  }));

  // Allocation order: best marginal profit first. "hold-revenue" only diverges by
  // refusing to fund a profitable-but-revenue-thin channel above its current spend
  // when a strictly higher-ROAS channel still has cap headroom — modelled simply by
  // sorting on ROAS (revenue per koruna) when holding revenue, else on profit.
  const order = [...base].sort((a, b) =>
    strategy === "hold-revenue"
      ? b.row.roas - a.row.roas || b.marginalProfit - a.marginalProfit
      : b.marginalProfit - a.marginalProfit || b.row.roas - a.row.roas
  );

  const suggested = new Map<string, number>();
  let remaining = totalBudget;
  for (const { row, marginalProfit, cap } of order) {
    // Never fund a channel that loses money on the margin (it would shrink profit);
    // for hold-revenue the same guard applies — draining a loss-maker can't lose
    // revenue we want to keep because that revenue was unprofitable.
    if (marginalProfit <= 0 || cap <= 0 || remaining <= 0) {
      suggested.set(row.channel, 0);
      continue;
    }
    const give = Math.min(cap, remaining);
    suggested.set(row.channel, give);
    remaining -= give;
  }

  const out: ReallocChannel[] = base.map(({ row, marginalProfit }) => {
    const suggestedSpend = suggested.get(row.channel) ?? 0;
    const projectedRevenue = suggestedSpend * row.roas;
    return {
      channel: row.channel,
      color: row.color,
      roas: row.roas,
      marginPct: row.marginPct,
      marginalProfit,
      currentSpend: row.cost,
      suggestedSpend,
      spendDelta: suggestedSpend - row.cost,
      projectedRevenue,
      projectedNetProfit: projectedRevenue * row.marginPct - suggestedSpend,
    };
  });

  const allocatedSpend = out.reduce((a, r) => a + r.suggestedSpend, 0);
  const currentRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  const projectedRevenue = out.reduce((a, r) => a + r.projectedRevenue, 0);
  const currentNetProfit = rows.reduce((a, r) => a + (r.revenue * r.marginPct - r.cost), 0);
  const projectedNetProfit = out.reduce((a, r) => a + r.projectedNetProfit, 0);

  return {
    rows: out.sort((a, b) => b.projectedNetProfit - a.projectedNetProfit),
    totalBudget,
    allocatedSpend,
    currentRevenue,
    projectedRevenue,
    currentNetProfit,
    projectedNetProfit,
    profitDelta: projectedNetProfit - currentNetProfit,
  };
}
