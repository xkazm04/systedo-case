/** Direction 3 — the projection stays honest (simulate.ts / budget-moves.ts /
 *  budget-math.ts / control-plane-types.ts). Three guarantees: the "small
 *  reallocation" caveat becomes an enforced low-confidence signal; estValueGain is
 *  floored to what the live mutation can actually move (MIN_DAILY_CZK floor) so the
 *  projection reconciles with the applied move; and a reverted change-set never
 *  presents its stale forward projection. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TARGET_ROAS, withMetrics } from "@/lib/campaigns/types";
import { recommendBudgetMoves } from "@/lib/campaigns/budget-moves";
import {
  simulationConfidence,
  moveDonorShare,
  SIM_LOW_CONFIDENCE_DONOR_SHARE,
} from "@/lib/campaigns/simulate";
import { movableAmount, MIN_DAILY_CZK } from "@/lib/campaigns/budget-math";
import { forwardProjectionApplies, projectedValueGain } from "@/lib/campaigns/control-plane-types";

function roasRow(id, cost, roasValue, { budgetPerDay } = {}) {
  return withMetrics({
    id,
    name: `Kampaň ${id}`,
    type: "search",
    status: "enabled",
    impressions: 50_000,
    clicks: 1_000,
    cost,
    conversions: roasValue > 0 ? 20 : 0,
    conversionValue: cost * roasValue,
    ...(budgetPerDay !== undefined ? { budgetPerDay } : {}),
  });
}

const donor = roasRow("d", 10_000, 1.0); // under target
const winner = roasRow("w", 30_000, 8.0); // above target

// --- movableAmount floor ----------------------------------------------------

test("movableAmount floors to what the donor can give up under MIN_DAILY_CZK", () => {
  // budgetPerDay 12 CZK/day, 30-day period → at most (12−10)×30 = 60 CZK movable.
  assert.equal(movableAmount(4_000, 12, 30), (12 - MIN_DAILY_CZK) * 30);
  // A generous daily budget doesn't bind — the request passes through.
  assert.equal(movableAmount(4_000, 1_000, 30), 4_000);
  // Unknown budget or days → passthrough (older docs), never negative.
  assert.equal(movableAmount(4_000, undefined, 30), 4_000);
  assert.equal(movableAmount(4_000, 12, undefined), 4_000);
  assert.equal(movableAmount(-5, 12, 30), 0);
});

// --- estValueGain reconciles with the simulation ----------------------------

test("without periodDays the recommendation is byte-identical to the pre-floor code", () => {
  const withDays = recommendBudgetMoves([donor, winner]);
  // amount is the tidy 40% shift, unfloored; estValueGain uses that same amount.
  const shift = withDays.moves.find((m) => m.kind === "shift");
  assert.ok(shift);
  assert.equal(shift.amount, 4_000); // round(0.4×10000/100)×100
  assert.equal(shift.estValueGain, 4_000 * (winner.roas - donor.roas));
});

test("the summed shift estValueGain equals the simulation's projected value delta", () => {
  const rec = recommendBudgetMoves([donor, winner]);
  const summed = rec.moves
    .filter((m) => m.kind === "shift")
    .reduce((a, m) => a + m.estValueGain, 0);
  assert.ok(Math.abs(summed - projectedValueGain(rec.simulation)) < 1e-6);
});

test("periodDays floors both the move amount and its estValueGain together", () => {
  // A donor with a tiny daily budget: the live floor would clamp the shift hard.
  const tightDonor = roasRow("d2", 10_000, 1.0, { budgetPerDay: 12 });
  const rec = recommendBudgetMoves([tightDonor, winner], { periodDays: 30 });
  const shift = rec.moves.find((m) => m.kind === "shift");
  assert.ok(shift);
  const floored = (12 - MIN_DAILY_CZK) * 30; // 60 CZK
  assert.equal(shift.amount, floored);
  // estValueGain tracks the floored amount, so applied == simulated.
  assert.equal(shift.estValueGain, floored * (winner.roas - tightDonor.roas));
  assert.ok(Math.abs(shift.estValueGain - projectedValueGain(rec.simulation)) < 1e-6);
});

// --- confidence label -------------------------------------------------------

test("the default recommender's 40% shifts read high-confidence", () => {
  const rec = recommendBudgetMoves([donor, winner]);
  assert.equal(simulationConfidence(rec.moves), "high");
  const shift = rec.moves.find((m) => m.kind === "shift");
  assert.ok(moveDonorShare(shift) <= SIM_LOW_CONFIDENCE_DONOR_SHARE);
  assert.ok(shift.fromCost === donor.cost);
});

test("a shift re-pointing more than half the donor's spend degrades to low-confidence", () => {
  const rec = recommendBudgetMoves([donor, winner], { shiftFraction: 0.6 });
  const shift = rec.moves.find((m) => m.kind === "shift");
  assert.ok(shift);
  assert.ok(moveDonorShare(shift) > SIM_LOW_CONFIDENCE_DONOR_SHARE);
  assert.equal(simulationConfidence(rec.moves), "low");
});

test("a pause carries no linear-extrapolation risk (share 0), and legacy moves default high", () => {
  const burner = roasRow("z", 5_000, 0);
  const rec = recommendBudgetMoves([burner, winner], { includePauses: true, shiftFraction: 0.6 });
  const pause = rec.moves.find((m) => m.kind === "pause");
  assert.ok(pause);
  assert.equal(moveDonorShare(pause), 0);
  // A move with no fromCost (a change-set persisted before the field existed).
  assert.equal(moveDonorShare({ kind: "shift", amount: 9_999, fromId: "x", toId: "y" }), 0);
});

// --- reverted change-set never shows its stale forward projection -----------

test("forwardProjectionApplies is true only before the set settles", () => {
  assert.equal(forwardProjectionApplies("pending"), true);
  assert.equal(forwardProjectionApplies("applying"), true);
  assert.equal(forwardProjectionApplies("applied"), false);
  assert.equal(forwardProjectionApplies("reverting"), false);
  assert.equal(forwardProjectionApplies("reverted"), false);
});
