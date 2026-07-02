/** Deterministic budget-reallocation recommendations — the bridge from triage
 *  diagnosis to a quantified "move this much money there" prescription. Pure: no
 *  AI, instant, and reconciles with the table because it reuses the same target
 *  constant and the simulate model. */
import { TARGET_ROAS, type CampaignRow } from "./types";
import { simulateBudgetShift, type BudgetMove, type SimulationResult } from "./simulate";

export interface BudgetRecommendation {
  moves: BudgetMove[];
  simulation: SimulationResult;
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
}

/**
 * Pair the worst-performing spenders (enabled, ROAS below target) with the best
 * over-performers (enabled, ROAS at/above target) and propose concrete budget
 * shifts, ranked by *wasted spend* = cost × (1 − roas/target). Each donor and
 * recipient is used at most once. With `includePauses`, zero-return donors are
 * emitted as pause moves (stop the spend — nothing was coming back) instead of
 * being silently invisible. Returns the moves plus a projected portfolio
 * simulation so the UI can show the estimated ROAS/PNO lift. Deterministic.
 */
export function recommendBudgetMoves(
  rows: CampaignRow[],
  opts: RecommendOptions = {}
): BudgetRecommendation {
  const maxMoves = opts.maxMoves ?? 3;
  const shiftFraction = opts.shiftFraction ?? 0.4;
  const minSpend = opts.minSpend ?? 1000;
  const includePauses = opts.includePauses ?? false;

  const enabled = rows.filter((c) => c.status === "enabled");

  // Donors: paying for under-target efficiency, ranked by wasted spend. A
  // zero-return spender wastes its ENTIRE cost (1 − 0/target = 1), so once
  // admitted it out-ranks every partially-performing donor by construction.
  const donors = enabled
    .filter(
      (c) => c.cost >= minSpend && c.roas < TARGET_ROAS && (includePauses ? true : c.roas > 0)
    )
    .map((c) => ({ c, waste: c.cost * (1 - c.roas / TARGET_ROAS) }))
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
        estValueGain: 0,
      });
      continue;
    }

    const recipient = recipients.find((r) => r.id !== donor.id && !usedRecipient.has(r.id));
    if (!recipient) break;
    usedRecipient.add(recipient.id);

    // Round the shift to a tidy 100 CZK so the recommendation reads cleanly.
    const amount = Math.round((donor.cost * shiftFraction) / 100) * 100;
    if (amount <= 0) continue;

    moves.push({
      kind: "shift",
      fromId: donor.id,
      fromName: donor.name,
      toId: recipient.id,
      toName: recipient.name,
      amount,
      fromRoas: donor.roas,
      toRoas: recipient.roas,
      estValueGain: amount * (recipient.roas - donor.roas),
    });
  }

  return { moves, simulation: simulateBudgetShift(rows, moves) };
}
