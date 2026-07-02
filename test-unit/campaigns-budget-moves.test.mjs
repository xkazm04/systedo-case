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
