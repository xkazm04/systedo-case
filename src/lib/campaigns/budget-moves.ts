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
}

/**
 * Pair the worst-performing spenders (enabled, ROAS below target) with the best
 * over-performers (enabled, ROAS at/above target) and propose concrete budget
 * shifts, ranked by *wasted spend* = cost × (1 − roas/target). Each donor and
 * recipient is used at most once. Returns the moves plus a projected portfolio
 * simulation so the UI can show the estimated ROAS/PNO lift. Deterministic.
 */
export function recommendBudgetMoves(
  rows: CampaignRow[],
  opts: RecommendOptions = {}
): BudgetRecommendation {
  const maxMoves = opts.maxMoves ?? 3;
  const shiftFraction = opts.shiftFraction ?? 0.4;
  const minSpend = opts.minSpend ?? 1000;

  const enabled = rows.filter((c) => c.status === "enabled");

  // Donors: paying for under-target efficiency, ranked by wasted spend.
  const donors = enabled
    .filter((c) => c.cost >= minSpend && c.roas > 0 && c.roas < TARGET_ROAS)
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
    const recipient = recipients.find((r) => r.id !== donor.id && !usedRecipient.has(r.id));
    if (!recipient) break;
    usedRecipient.add(recipient.id);

    // Round the shift to a tidy 100 CZK so the recommendation reads cleanly.
    const amount = Math.round((donor.cost * shiftFraction) / 100) * 100;
    if (amount <= 0) continue;

    moves.push({
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
