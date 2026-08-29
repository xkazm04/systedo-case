/** Pure profit math: apply a per-channel margin model to the channel mix to get
 *  gross/net profit, POAS and break-even ROAS per channel plus a portfolio
 *  summary. No I/O, no React — numbers in, numbers out. */
import type { ChannelRow } from "@/lib/metrics";
import { poas, roas } from "@/lib/metrics";
import {
  CURVE_EXTRAPOLATION,
  marginalPoas,
  marginalRoas,
  revenueAt,
  type ResponseCurve,
} from "@/lib/metrics/response-curve";
import * as ProfitMath from "./core";
import { FALLBACK_MARGIN } from "./sample";
import type {
  ChannelMargin,
  ProfitRow,
  ProfitSummary,
  ReallocChannel,
  ReallocOptions,
  ReallocPlan,
} from "./types";

/** The shared per-row margin core: gross/net profit, POAS and break-even ROAS
 *  from revenue, ad cost and a margin fraction. `computeProfit`, `applyOverhead`
 *  (profit/overhead) and `computeProductProfit` (profit/products) all layer their
 *  own fields on top of this — one formula, one place, so the `profitable`
 *  definition can't drift between them. */
export function computeMarginRow(
  revenue: number,
  cost: number,
  marginPct: number
): { grossProfit: number; netProfit: number; poas: number; breakEvenRoas: number; profitable: boolean } {
  const grossProfit = ProfitMath.grossProfit(revenue, marginPct);
  const netProfit = ProfitMath.netProfit(grossProfit, cost);
  return {
    grossProfit,
    netProfit,
    poas: poas(grossProfit, cost),
    breakEvenRoas: ProfitMath.breakEvenRoas(marginPct),
    // Profitable ⇔ netProfit ≥ 0 (revenue·margin ≥ cost). This equals the
    // ROAS ≥ break-even test for paid channels, but stays correct for a
    // zero-cost channel (organic/direct), whose guarded roas=0 would
    // otherwise read as a false "loses money after margin".
    profitable: netProfit >= 0,
  };
}

export function computeProfit(
  rows: ChannelRow[],
  margins: ChannelMargin[]
): { rows: ProfitRow[]; summary: ProfitSummary } {
  const marginByChannel = new Map(margins.map((m) => [m.channel, m.marginPct]));

  const out: ProfitRow[] = rows.map((r) => {
    const marginPct = marginByChannel.get(r.channel) ?? FALLBACK_MARGIN;
    return {
      channel: r.channel,
      color: r.color,
      revenue: r.revenue,
      cost: r.cost,
      roas: r.roas,
      marginPct,
      ...computeMarginRow(r.revenue, r.cost, marginPct),
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
      roas: roas(revenue, cost),
      poas: poas(grossProfit, cost),
      blendedMargin: revenue > 0 ? grossProfit / revenue : 0,
      unprofitableCount: out.filter((r) => !r.profitable).length,
    },
  };
}

/** Pure budget-reallocation solver.
 *
 *  DEFAULT (no `opts.curves`, or none of them fitted): holds each channel's ROAS
 *  constant (linear: projected revenue = newSpend × roas), so the marginal net profit
 *  per koruna for a channel is `roas × margin − 1`. Greedily fills budget into channels
 *  by descending marginal profit, each capped at `maxSpendMultiple ×` its current spend
 *  and floored at 0 — so a loss-making channel (roas × margin < 1) is drained and its
 *  budget moves to the best earner.
 *
 *  WITH at least one fitted response curve: `reallocateOnCurves` below allocates by
 *  MARGINAL profit along the curves instead. The two paths are deliberately kept
 *  separate rather than "unified": the constant-ROAS path is what every existing caller
 *  and pinned test measures, and it must stay output-for-output identical.
 *
 *  No I/O, no React. */
export function reallocateBudget(
  rows: ProfitRow[],
  opts: ReallocOptions = {}
): ReallocPlan {
  // One fitted curve is enough to switch paths; the channels without one keep their
  // linear term and cap inside the curve solver, and the plan labels each row.
  if (opts.curves && rows.some((r) => opts.curves?.[r.channel]?.fitted)) {
    return reallocateOnCurves(rows, opts, opts.curves);
  }

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

  const currentRevenue = rows.reduce((a, r) => a + r.revenue, 0);

  const suggested = new Map<string, number>();
  let remaining = totalBudget;
  for (const { row, marginalProfit, cap } of order) {
    // Profit-first fill: never fund a channel that loses money on the margin (it would
    // shrink profit). For hold-revenue this is only the FIRST pass — the recovery pass
    // below may later fund a loss-maker to keep total revenue from falling.
    if (marginalProfit <= 0 || cap <= 0 || remaining <= 0) {
      suggested.set(row.channel, 0);
      continue;
    }
    const give = Math.min(cap, remaining);
    suggested.set(row.channel, give);
    remaining -= give;
  }

  // hold-revenue recovery: deploy any leftover budget to actually protect revenue.
  // `order` is ROAS-descending for this strategy, so funding the highest-ROAS channels
  // with cap headroom first recovers the most revenue per koruna (the minimum spend to
  // hold it). We WILL fund a loss-maker here — accepting a little profit for the revenue
  // the user explicitly asked to keep. Without this, hold-revenue drained loss-makers
  // identically to max-profit, silently letting revenue fall.
  if (strategy === "hold-revenue" && remaining > 0) {
    const projectedRevenueSoFar = () =>
      order.reduce((a, { row }) => a + (suggested.get(row.channel) ?? 0) * row.roas, 0);
    for (const { row, cap } of order) {
      if (remaining <= 0) break;
      if (row.roas <= 0) continue;
      const already = suggested.get(row.channel) ?? 0;
      const headroom = cap - already;
      if (headroom <= 0) continue;
      const shortfall = currentRevenue - projectedRevenueSoFar();
      if (shortfall <= 0) break;
      const spendForShortfall = shortfall / row.roas;
      const give = Math.min(headroom, remaining, spendForShortfall);
      if (give <= 0) continue;
      suggested.set(row.channel, already + give);
      remaining -= give;
    }
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
      projectedNetProfit: ProfitMath.netProfit(
        ProfitMath.grossProfit(projectedRevenue, row.marginPct),
        suggestedSpend
      ),
    };
  });

  const allocatedSpend = out.reduce((a, r) => a + r.suggestedSpend, 0);
  const projectedRevenue = out.reduce((a, r) => a + r.projectedRevenue, 0);
  const currentNetProfit = rows.reduce(
    (a, r) => a + ProfitMath.netProfit(ProfitMath.grossProfit(r.revenue, r.marginPct), r.cost),
    0
  );
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
    // Revenue is "held" when the projection doesn't fall below today (FP tolerance
    // scaled to the magnitude of revenue). hold-revenue works to keep this true.
    revenueHeld: projectedRevenue >= currentRevenue - Math.max(1, currentRevenue) * 1e-9,
  };
}

// --- response-curve reallocation (WP W1-F) ----------------------------------

/** Increments the greedy hill-climb allocates in: 1/400 of the budget, so the
 *  granularity scales with the account instead of being a fixed number of koruny. */
const CURVE_STEPS = 400;
/** Termination bound. Each iteration either spends a whole STEP or fills a channel to
 *  its limit, so CURVE_STEPS + one pass per channel is already generous. */
const MAX_ITERATIONS = 2000;
/** FP slack: below this a "remaining budget" or "headroom" is nothing. */
const EPS = 1e-9;

interface CurveState {
  row: ProfitRow;
  /** the curve offered for this channel (fitted or not) — drives the row's disclosure */
  offered?: ResponseCurve;
  /** the curve actually allocated on; null → this channel keeps the linear term */
  fitted: ResponseCurve | null;
  /** today's constant-ROAS marginal term, `roas × margin − 1` */
  marginalProfit: number;
  /** the most this channel may be given */
  limit: number;
  spend: number;
}

const revenueOfState = (s: CurveState): number =>
  s.fitted ? revenueAt(s.fitted, s.spend) : s.spend * s.row.roas;

/** Marginal net profit per koruna at the CURRENT allocation — the curve's slope where
 *  one is fitted, today's constant term otherwise. */
const marginalProfitAt = (s: CurveState): number =>
  s.fitted ? marginalPoas(s.fitted, s.spend, s.row.marginPct) : s.marginalProfit;

/** Marginal revenue per koruna at the current allocation (the hold-revenue criterion). */
const marginalRoasAt = (s: CurveState): number =>
  s.fitted ? marginalRoas(s.fitted, s.spend) : s.row.roas;

/**
 * Allocate budget by MARGINAL profit along fitted diminishing-returns curves.
 *
 * A greedy hill-climb: each `STEP` of budget goes to the channel whose NEXT koruna earns
 * the most, and a channel's marginal return falls as it is fed (that is what `b < 1`
 * means), so a saturating channel stops attracting budget long before the linear solver's
 * 3× cap would have stopped it. That is the whole point — the constant-ROAS solver would
 * pour the entire budget into the single best-looking channel.
 *
 * Channels WITHOUT a fitted curve keep exactly the linear behaviour: a constant marginal
 * term and the `maxSpendMultiple` cap. A fitted channel is bounded by the edge of the
 * data instead (`1.5 × spendMax`, or the cap when that is larger) — the curve is only
 * evidence about the band it was measured in.
 *
 * `hold-revenue` orders by marginal REVENUE per koruna rather than marginal profit, and
 * then runs the same recovery pass as the linear solver: leftover budget is deployed
 * into the highest marginal-revenue channels — loss-makers included — until the
 * projection stops falling short of today's revenue.
 */
function reallocateOnCurves(
  rows: ProfitRow[],
  opts: ReallocOptions,
  curves: Record<string, ResponseCurve>
): ReallocPlan {
  const maxMultiple = opts.maxSpendMultiple ?? 3;
  const currentCost = rows.reduce((a, r) => a + r.cost, 0);
  const totalBudget = Math.max(0, opts.totalBudget ?? currentCost);
  const strategy = opts.strategy ?? "max-profit";
  const currentRevenue = rows.reduce((a, r) => a + r.revenue, 0);

  const state: CurveState[] = rows.map((row) => {
    const offered = curves[row.channel];
    const fitted = offered?.fitted ? offered : null;
    const cap = Math.max(0, row.cost) * maxMultiple;
    return {
      row,
      offered,
      fitted,
      marginalProfit: row.roas * row.marginPct - 1,
      limit: fitted ? Math.max(cap, fitted.spendMax * CURVE_EXTRAPOLATION) : cap,
      spend: 0,
    };
  });

  const step = Math.max(1, totalBudget / CURVE_STEPS);
  let remaining = totalBudget;

  // Profit-first fill: never fund a koruna that loses money on the margin.
  for (let i = 0; i < MAX_ITERATIONS && remaining > EPS; i++) {
    let best: CurveState | null = null;
    let bestKey = 0;
    let bestTie = 0;
    for (const s of state) {
      if (s.limit - s.spend <= EPS) continue;
      const profit = marginalProfitAt(s);
      if (profit <= 0) continue;
      const mroas = marginalRoasAt(s);
      const key = strategy === "hold-revenue" ? mroas : profit;
      const tie = strategy === "hold-revenue" ? profit : mroas;
      if (best === null || key > bestKey || (key === bestKey && tie > bestTie)) {
        best = s;
        bestKey = key;
        bestTie = tie;
      }
    }
    if (best === null) break;
    const give = Math.min(step, remaining, best.limit - best.spend);
    if (give <= EPS) break;
    best.spend += give;
    remaining -= give;
  }

  // hold-revenue recovery — see the linear solver: protect today's revenue with whatever
  // budget the profit-first pass left, accepting a loss-maker when that is what it takes.
  if (strategy === "hold-revenue") {
    for (let i = 0; i < MAX_ITERATIONS && remaining > EPS; i++) {
      const shortfall = currentRevenue - state.reduce((a, s) => a + revenueOfState(s), 0);
      if (shortfall <= 0) break;
      let best: CurveState | null = null;
      let bestRoas = 0;
      for (const s of state) {
        if (s.limit - s.spend <= EPS) continue;
        const mroas = marginalRoasAt(s);
        if (mroas <= 0) continue;
        if (best === null || mroas > bestRoas) {
          best = s;
          bestRoas = mroas;
        }
      }
      if (best === null) break;
      const give = Math.min(step, remaining, best.limit - best.spend, shortfall / bestRoas);
      if (give <= EPS) break;
      best.spend += give;
      remaining -= give;
    }
  }

  const out: ReallocChannel[] = state.map((s) => {
    const suggestedSpend = s.spend;
    const projectedRevenue = revenueOfState(s);
    return {
      channel: s.row.channel,
      color: s.row.color,
      roas: s.row.roas,
      marginPct: s.row.marginPct,
      marginalProfit: s.marginalProfit,
      currentSpend: s.row.cost,
      suggestedSpend,
      spendDelta: suggestedSpend - s.row.cost,
      projectedRevenue,
      projectedNetProfit: ProfitMath.netProfit(
        ProfitMath.grossProfit(projectedRevenue, s.row.marginPct),
        suggestedSpend
      ),
      // Only a channel actually allocated along a curve gets a marginal reading; for the
      // rest `marginalProfit` above is still the honest per-koruna number.
      ...(s.fitted
        ? { marginalPoasAtSuggested: marginalPoas(s.fitted, suggestedSpend, s.row.marginPct) }
        : {}),
      ...(s.offered
        ? {
            curve: {
              fitted: s.offered.fitted,
              b: s.offered.b,
              r2: s.offered.r2,
              basis: s.offered.basis,
            },
          }
        : {}),
    };
  });

  const allocatedSpend = out.reduce((a, r) => a + r.suggestedSpend, 0);
  const projectedRevenue = out.reduce((a, r) => a + r.projectedRevenue, 0);
  const currentNetProfit = rows.reduce(
    (a, r) => a + ProfitMath.netProfit(ProfitMath.grossProfit(r.revenue, r.marginPct), r.cost),
    0
  );
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
    revenueHeld: projectedRevenue >= currentRevenue - Math.max(1, currentRevenue) * 1e-9,
  };
}
