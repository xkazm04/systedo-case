/** Zero-return spenders as first-class donors (src/lib/campaigns/budget-moves.ts
 *  + simulate.ts): with includePauses a no_conversions budget-burner becomes a
 *  kind:"pause" recommendation ranked by its full wasted cost, while the default
 *  path stays byte-compatible for the control-plane's live-mutation bundles. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TARGET_ROAS, withMetrics } from "@/lib/campaigns/types";
import { recommendBudgetMoves } from "@/lib/campaigns/budget-moves";
import { simulateBudgetShift } from "@/lib/campaigns/simulate";

function row(id, { cost, roasFactor, status = "enabled" }) {
  return withMetrics({
    id,
    name: `Kampaň ${id}`,
    type: "search",
    status,
    impressions: 50_000,
    clicks: 1_000,
    cost,
    conversions: roasFactor > 0 ? 20 : 0,
    conversionValue: Math.round(cost * TARGET_ROAS * roasFactor),
  });
}

const burner = row("z1", { cost: 8_000, roasFactor: 0 }); // critical no_conversions
const weakDonor = row("d1", { cost: 10_000, roasFactor: 0.5 }); // under target
const winner = row("w1", { cost: 20_000, roasFactor: 1.4 }); // above target

test("default options ignore zero-return spenders (control-plane back-compat)", () => {
  const { moves } = recommendBudgetMoves([burner, weakDonor, winner]);
  assert.ok(moves.every((m) => m.kind !== "pause"));
  assert.ok(moves.every((m) => m.fromId !== "z1"));
});

test("includePauses emits a pause move for the burner, ranked worst-of-all", () => {
  const { moves } = recommendBudgetMoves([burner, weakDonor, winner], { includePauses: true });
  const pause = moves.find((m) => m.kind === "pause");
  assert.ok(pause, "pause move exists");
  assert.equal(pause.fromId, "z1");
  assert.equal(pause.amount, burner.cost); // waste = full cost
  assert.equal(pause.estValueGain, 0);
  assert.equal(pause.toId, "");

  // Full-cost waste (8000) out-ranks the weak donor's partial waste (10000 × 0.5).
  assert.equal(moves[0].kind, "pause");

  // The shift recommendation still exists alongside and keeps its recipient.
  const shift = moves.find((m) => m.kind === "shift");
  assert.ok(shift);
  assert.equal(shift.fromId, "d1");
  assert.equal(shift.toId, "w1");
});

test("the panel can no longer claim balance while a critical burner exists", () => {
  // Only the burner + a healthy winner: no under-target shift donor at all.
  const { moves } = recommendBudgetMoves([burner, winner], { includePauses: true });
  assert.equal(moves.length, 1);
  assert.equal(moves[0].kind, "pause");
});

test("simulateBudgetShift handles a pause: cost leaves, zero value is lost", () => {
  const rows = [burner, winner];
  const { before, after } = simulateBudgetShift(rows, [
    { kind: "pause", fromId: "z1", fromName: burner.name, toId: "", toName: "", amount: burner.cost, fromRoas: 0, toRoas: 0, estValueGain: 0 },
  ]);
  assert.equal(after.cost, before.cost - burner.cost);
  assert.equal(after.conversionValue, before.conversionValue);
  assert.ok(after.roas > before.roas, "pausing a zero-return spender lifts portfolio ROAS");
});

test("minSpend still gates pause recommendations (noise floor)", () => {
  const tinyBurner = row("z2", { cost: 300, roasFactor: 0 });
  const { moves } = recommendBudgetMoves([tinyBurner, winner], { includePauses: true });
  assert.equal(moves.length, 0);
});

// --- Direction 1: profit-aware scoring (opt-in on a persisted blended margin) ------

/** A row with an EXACT roas (conversionValue = cost × roas), for the margin math. */
function roasRow(id, cost, roasValue) {
  return withMetrics({
    id,
    name: `Kampaň ${id}`,
    type: "search",
    status: "enabled",
    impressions: 50_000,
    clicks: 1_000,
    cost,
    conversions: 20,
    conversionValue: cost * roasValue,
  });
}

// Two under-target donors + one winner. With one free recipient only the
// top-ranked donor moves — so which donor wins reveals the ranking metric.
//   P: cost 10000, roas 1.3   Q: cost 8000, roas 1.0   W: cost 20000, roas 8.0
// Profit destruction = cost × (1 − roas×margin) crosses at margin* = 0.4:
//   margin 0.3 → P (6100) > Q (5600); margin 0.5 → Q (4000) > P (3500).
const donorP = roasRow("p", 10_000, 1.3);
const donorQ = roasRow("q", 8_000, 1.0);
const bigWinner = roasRow("w", 20_000, 8.0);

test("no margin → margin-blind revenue scoring, byte-identical shape", () => {
  const rec = recommendBudgetMoves([donorP, donorQ, bigWinner]);
  // No margin echoed, and no move carries a profit field (Firestore shape unchanged).
  assert.equal(rec.marginPct, undefined);
  assert.ok(rec.moves.every((m) => !("estProfitGain" in m)));
  // Revenue waste ranks P worst (matches the low-margin verdict below).
  assert.equal(rec.moves[0].fromId, "p");
});

test("high blended margin flips which under-target donor is the worst", () => {
  const low = recommendBudgetMoves([donorP, donorQ, bigWinner], { marginPct: 0.3 });
  const high = recommendBudgetMoves([donorP, donorQ, bigWinner], { marginPct: 0.5 });
  assert.equal(low.moves[0].fromId, "p", "at 30 % margin P destroys the most profit");
  assert.equal(high.moves[0].fromId, "q", "at 50 % margin Q destroys the most profit");
  // The margin is echoed on the recommendation for the display.
  assert.equal(low.marginPct, 0.3);
  assert.equal(high.marginPct, 0.5);
});

test("profit gain = margin × value gain on a shift; profit field present", () => {
  const rec = recommendBudgetMoves([donorP, bigWinner], { marginPct: 0.4 });
  const shift = rec.moves.find((m) => m.kind === "shift");
  assert.ok(shift, "a shift move exists");
  assert.ok(shift.estProfitGain !== undefined);
  // estProfitGain = 0.4 × estValueGain (gross profit on the re-pointed revenue).
  assert.ok(Math.abs(shift.estProfitGain - 0.4 * shift.estValueGain) < 1e-6);
});

test("pause recovers full saved spend as profit (persisted-margin only)", () => {
  const withMargin = recommendBudgetMoves([burner, winner], {
    includePauses: true,
    marginPct: 0.42,
  });
  const pause = withMargin.moves.find((m) => m.kind === "pause");
  assert.ok(pause);
  assert.equal(pause.estProfitGain, burner.cost); // full cost recovered

  // Same call without a margin → no profit field at all (byte-identical pause).
  const blind = recommendBudgetMoves([burner, winner], { includePauses: true });
  const blindPause = blind.moves.find((m) => m.kind === "pause");
  assert.ok(blindPause);
  assert.ok(!("estProfitGain" in blindPause));
});

test("a degenerate margin (≤0 or >1) falls back to margin-blind scoring", () => {
  const bad = recommendBudgetMoves([donorP, donorQ, bigWinner], { marginPct: 0 });
  const blind = recommendBudgetMoves([donorP, donorQ, bigWinner]);
  assert.equal(bad.marginPct, undefined);
  assert.deepEqual(
    bad.moves.map((m) => m.fromId),
    blind.moves.map((m) => m.fromId)
  );
});
