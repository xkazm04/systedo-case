/** Deterministic budget-reallocation recommendations — the bridge from triage
 *  diagnosis to a quantified "move this much money there" prescription. Pure: no
 *  AI, instant, and reconciles with the table because it reuses the same target
 *  constant and the simulate model. */
import { TARGET_ROAS, type CampaignRow } from "./types";
import { simulateBudgetShift, type BudgetMove, type SimulationResult } from "./simulate";
import { movableAmount } from "./budget-math";
import { grossProfit } from "@/lib/profit/core";

export interface BudgetRecommendation {
  moves: BudgetMove[];
  simulation: SimulationResult;
  /** the blended margin the scoring used, echoed back for the display ("při marži
   *  42 %"). Present only when a persisted cost model was threaded in. */
  marginPct?: number;
}

export interface RecommendOptions {
  /** max number of moves to propose */
  maxMoves?: number;
  /** fraction of a donor's spend to reallocate per move */
  shiftFraction?: number;
  /** ignore campaigns spending less than this (noise floor), CZK */
  minSpend?: number;
  /** admit zero-return spenders (cost > 0, ROAS = 0 — the critical
   *  `no_conversions` triage finding) as `kind: "pause"` recommendations. Their
   *  waste = full cost, so they rank worst-of-all. Opt-in: the control-plane
   *  bundles moves straight into live budget mutations and must keep receiving
   *  shifts only — the BudgetMoves panel and the AI prompt opt in. */
  includePauses?: boolean;
  /** restrict DONORS to these campaign ids (recipients stay unrestricted). The
   *  alert→change-set flow uses this to pre-scope a change-set to exactly the
   *  alerted campaigns — acting *on* them (pause the burner, move budget away
   *  from the under-performer) without inventing moves on unrelated campaigns.
   *  Recipients are still drawn from the whole portfolio's over-performers, so
   *  the shifted budget lands where it works best. Empty/omitted → no restriction. */
  donorScopeIds?: string[];
  /** the tenant's blended gross margin (0..1) from its persisted cost model. When
   *  present the recommender chases PROFIT rather than revenue: donors are ranked
   *  by profit destruction (spend consumed minus gross profit returned) instead of
   *  revenue waste, and each move carries an `estProfitGain`. Absent (no saved
   *  model) → the original margin-blind, revenue-ROAS scoring, byte-for-byte. */
  marginPct?: number;
  /** the synced period length in days. When supplied, each shift's `amount` (and
   *  therefore its `estValueGain`) is floored to what the live mutation can
   *  actually move off the donor given the MIN_DAILY_CZK daily-budget floor
   *  (`movableAmount`), so the projected gain reconciles with the applied move
   *  (applied == simulated, modulo daily-micros rounding) rather than
   *  over-promising. Absent → no floor applied, byte-identical to the pre-floor
   *  recommendation (for the recommender's ≤40% shifts the floor never binds
   *  anyway — the donor retains ≥60% of its budget, far above 10 CZK/day). */
  periodDays?: number;
}

/**
 * Pair the worst-performing spenders (enabled, ROAS below target) with the best
 * over-performers (enabled, ROAS at/above target) and propose concrete budget
 * shifts. Each donor and recipient is used at most once. With `includePauses`,
 * zero-return donors are emitted as pause moves (stop the spend — nothing was
 * coming back) instead of being silently invisible. Returns the moves plus a
 * projected portfolio simulation so the UI can show the estimated ROAS/PNO lift.
 * Deterministic.
 *
 * DONOR RANKING — revenue vs profit. Without a cost model (`opts.marginPct`
 * absent) donors rank by *wasted spend* = cost × (1 − roas/TARGET_ROAS): distance
 * below the margin-blind portfolio ROAS target, weighted by spend. This is
 * revenue-centric — it doesn't know a 3× ROAS channel at a 20 % margin loses money
 * while the same ROAS at a 60 % margin prints it.
 *
 * With the tenant's blended margin threaded in, donors rank by PROFIT DESTRUCTION
 * = cost − grossProfit(cost×roas, margin) = cost × (1 − roas×margin), i.e. distance
 * below the *profit* break-even (roas = 1/margin), weighted by spend. Derived
 * straight from the shared core: a donor's spend `cost` buys revenue `cost×roas`,
 * whose gross profit is `grossProfit(revenue, margin)`; the profit it destroys is
 * the shortfall of that gross profit against the spend. A move's honest profit
 * delta is likewise the gross profit on the incremental revenue it re-points:
 * `estProfitGain = grossProfit(amount × (recipRoas − donorRoas), margin)` =
 * margin × estValueGain (one blended margin over both sides — the report's
 * single-P&L model; per-channel margins live in the /zisk engine). A pause of a
 * zero-return donor recovers its full saved spend (profit was −cost), so
 * `estProfitGain = amount`. The donor/recipient FILTERS are unchanged — margin only
 * re-prioritises which under-target spender is the worst and quantifies the gain in
 * profit, never invents or drops a move.
 */
export function recommendBudgetMoves(
  rows: CampaignRow[],
  opts: RecommendOptions = {}
): BudgetRecommendation {
  const maxMoves = opts.maxMoves ?? 3;
  const shiftFraction = opts.shiftFraction ?? 0.4;
  const minSpend = opts.minSpend ?? 1000;
  const includePauses = opts.includePauses ?? false;
  // Optional synced-period length — enables flooring each shift to what the live
  // mutation can actually move (see RecommendOptions.periodDays). Absent → no floor.
  const periodDays =
    typeof opts.periodDays === "number" && opts.periodDays > 0 ? opts.periodDays : undefined;
  // Profit-aware scoring is opt-in on a persisted, positive blended margin. A
  // missing/degenerate margin (≤0 or >1) falls back to the revenue-ROAS scoring so
  // a blank/corrupt model can never flip the recommender into nonsense.
  const marginPct =
    typeof opts.marginPct === "number" && opts.marginPct > 0 && opts.marginPct <= 1
      ? opts.marginPct
      : undefined;
  // Optional donor allow-list: when set, only these campaigns may be acted on as
  // donors (the alert→change-set flow scopes to exactly the alerted campaigns).
  const donorScope =
    opts.donorScopeIds && opts.donorScopeIds.length > 0 ? new Set(opts.donorScopeIds) : null;

  const enabled = rows.filter((c) => c.status === "enabled");

  // Donors: paying for under-target efficiency, ranked by wasted spend (revenue) or
  // profit destruction (with a margin). A zero-return spender wastes its ENTIRE cost
  // under either metric (1 − 0 = 1), so once admitted it out-ranks every
  // partially-performing donor by construction.
  //   revenue waste     = cost × (1 − roas/TARGET_ROAS)
  //   profit destruction = cost − grossProfit(cost×roas, margin) = cost×(1 − roas×margin)
  const waste = (c: CampaignRow) =>
    marginPct !== undefined
      ? c.cost - grossProfit(c.cost * c.roas, marginPct)
      : c.cost * (1 - c.roas / TARGET_ROAS);
  const donors = enabled
    .filter(
      (c) =>
        c.cost >= minSpend &&
        c.roas < TARGET_ROAS &&
        (includePauses ? true : c.roas > 0) &&
        (donorScope ? donorScope.has(c.id) : true)
    )
    .map((c) => ({ c, waste: waste(c) }))
    .sort((a, b) => b.waste - a.waste)
    .map((x) => x.c);

  // Recipients: at/above target, best ROAS first (most worth scaling).
  const recipients = enabled
    .filter((c) => c.roas >= TARGET_ROAS && c.cost > 0)
    .sort((a, b) => b.roas - a.roas);

  const moves: BudgetMove[] = [];
  const usedRecipient = new Set<string>();
  for (const donor of donors) {
    if (moves.length >= maxMoves) break;

    // Zero return → there is nothing to re-point; the right action is to stop
    // the spend. No recipient is consumed, and estValueGain is honestly 0 (the
    // gain is the saved cost, which `amount` carries).
    if (donor.roas <= 0) {
      moves.push({
        kind: "pause",
        fromId: donor.id,
        fromName: donor.name,
        toId: "",
        toName: "",
        amount: donor.cost,
        fromRoas: 0,
        toRoas: 0,
        fromCost: donor.cost,
        estValueGain: 0,
        // Pausing a zero-return donor recovers the full saved spend as profit (it
        // was buying ~nothing). Only attached under a persisted margin so the
        // margin-blind path stays byte-identical.
        ...(marginPct !== undefined ? { estProfitGain: donor.cost } : {}),
        // WP S1: carry the donor's network so the apply path and checkPolicy can
        // see it. Spread only when the row actually has one (source-less rows —
        // every pre-union read — produce the byte-identical prior move).
        ...(donor.source !== undefined ? { fromSource: donor.source } : {}),
      });
      continue;
    }

    const recipient = recipients.find((r) => r.id !== donor.id && !usedRecipient.has(r.id));
    if (!recipient) break;
    usedRecipient.add(recipient.id);

    // Round the shift to a tidy 100 CZK so the recommendation reads cleanly, then
    // floor it to what the live mutation can actually move off the donor (the
    // MIN_DAILY_CZK daily-budget floor over the synced period) when the period is
    // known — so the projected gain never over-promises what apply will deliver.
    // Never above the donor's own spend (the simulation's own clamp).
    const rounded = Math.round((donor.cost * shiftFraction) / 100) * 100;
    const amount = Math.min(donor.cost, movableAmount(rounded, donor.budgetPerDay, periodDays));
    if (amount <= 0) continue;

    // estValueGain is derived from the SAME (floored) amount the move carries and
    // the simulation moves, so the stated gain reconciles with the applied move.
    const estValueGain = amount * (recipient.roas - donor.roas);
    moves.push({
      kind: "shift",
      fromId: donor.id,
      fromName: donor.name,
      toId: recipient.id,
      toName: recipient.name,
      amount,
      fromRoas: donor.roas,
      toRoas: recipient.roas,
      fromCost: donor.cost,
      estValueGain,
      // Profit the re-pointed revenue actually earns = gross profit on the
      // incremental value (= margin × estValueGain). Persisted-model only.
      ...(marginPct !== undefined ? { estProfitGain: grossProfit(estValueGain, marginPct) } : {}),
      // WP S1: both ends' networks, spread only when the rows carry them — so a
      // union-read portfolio produces a move `checkPolicy` can judge, and a
      // single-source (or pre-union) portfolio produces the exact prior move.
      ...(donor.source !== undefined ? { fromSource: donor.source } : {}),
      ...(recipient.source !== undefined ? { toSource: recipient.source } : {}),
    });
  }

  return {
    moves,
    simulation: simulateBudgetShift(rows, moves),
    ...(marginPct !== undefined ? { marginPct } : {}),
  };
}
