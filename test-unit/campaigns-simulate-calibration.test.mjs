/** WP W2-E — `simulateBudgetShift`'s optional calibration multiplier.
 *
 *  The load-bearing assertion here is the FIRST one: adding an options parameter
 *  to a function every proposal in the app runs through must leave the existing
 *  call — `simulateBudgetShift(rows, moves)` with no opts — byte-identical to what
 *  it produced before. Pinned by deep-equality against the un-opted result, the
 *  same way test-unit/profit-response-curve.test.mjs pins the constant-ROAS path
 *  when curves were added to `reallocateBudget`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateBudgetShift } from "@/lib/campaigns/simulate";
import { withMetrics } from "@/lib/campaigns/types";

const row = (id, { cost, conversions, conversionValue }) =>
  withMetrics({
    id,
    name: `Kampaň ${id}`,
    type: "search",
    status: "enabled",
    impressions: 50_000,
    clicks: 1_000,
    cost,
    conversions,
    conversionValue,
  });

/** Donor at ROAS 1, recipient at ROAS 4 — 400 CZK moves from d1 to w1. */
const ROWS = [
  row("d1", { cost: 1_000, conversions: 10, conversionValue: 1_000 }),
  row("w1", { cost: 1_000, conversions: 10, conversionValue: 4_000 }),
];
const MOVES = [
  { fromId: "d1", fromName: "D", toId: "w1", toName: "W", amount: 400, fromRoas: 1, toRoas: 4, estValueGain: 1_200 },
];
const PAUSE = [
  { kind: "pause", fromId: "d1", fromName: "D", toId: "", toName: "", amount: 400, fromRoas: 1, toRoas: 0, estValueGain: 0 },
];

// --- the byte-identical pin ---------------------------------------------------

test("the no-opts call is byte-identical to every neutral spelling of the multiplier", () => {
  const baseline = simulateBudgetShift(ROWS, MOVES);
  assert.deepStrictEqual(simulateBudgetShift(ROWS, MOVES, {}), baseline);
  assert.deepStrictEqual(simulateBudgetShift(ROWS, MOVES, { gainMultiplier: undefined }), baseline);
  assert.deepStrictEqual(simulateBudgetShift(ROWS, MOVES, { gainMultiplier: 1 }), baseline);
});

test("a nonsensical multiplier degrades to the uncalibrated projection, never to zero", () => {
  const baseline = simulateBudgetShift(ROWS, MOVES);
  for (const gainMultiplier of [0, -1, NaN, Infinity]) {
    assert.deepStrictEqual(simulateBudgetShift(ROWS, MOVES, { gainMultiplier }), baseline, String(gainMultiplier));
  }
});

test("the pinned uncalibrated numbers themselves (the pre-WP snapshot)", () => {
  const { before, after } = simulateBudgetShift(ROWS, MOVES);
  assert.equal(before.cost, 2_000);
  assert.equal(before.conversionValue, 5_000);
  assert.equal(after.cost, 2_000, "a shift moves spend, it does not change the total");
  assert.equal(after.conversionValue, 6_200, "d1 −400 (at ROAS 1), w1 +1600 (at ROAS 4)");
  assert.equal(after.conversions, 20);
});

// --- the calibrated projection ------------------------------------------------

test("a 0.5 multiplier halves the RECIPIENT's predicted gain and nothing else", () => {
  const { before, after } = simulateBudgetShift(ROWS, MOVES, { gainMultiplier: 0.5 });
  assert.equal(before.conversionValue, 5_000, "the before totals are the account as it stands");
  assert.equal(after.conversionValue, 5_400, "w1 gains 400 × 4 × 0.5 = 800 instead of 1600");
  assert.equal(after.conversions, 18, "w1 gains 400 × 0.01 × 0.5 = 2 instead of 4");
});

test("spend is never scaled — the budget shift is exactly the amount that was shifted", () => {
  for (const gainMultiplier of [0.3, 1, 1.5]) {
    const { after } = simulateBudgetShift(ROWS, MOVES, { gainMultiplier });
    assert.equal(after.cost, 2_000, `total spend is arithmetic at ×${gainMultiplier}`);
  }
});

test("the donor half is arithmetic, so a PAUSE is identical at every multiplier", () => {
  const baseline = simulateBudgetShift(ROWS, PAUSE);
  assert.deepStrictEqual(simulateBudgetShift(ROWS, PAUSE, { gainMultiplier: 0.3 }), baseline);
  assert.deepStrictEqual(simulateBudgetShift(ROWS, PAUSE, { gainMultiplier: 1.5 }), baseline);
  assert.equal(baseline.after.cost, 1_600, "the paused donor's spend leaves the portfolio");
});

test("a multiplier above 1 raises the projection, monotonically", () => {
  const gains = [0.3, 0.5, 1, 1.5].map(
    (gainMultiplier) => simulateBudgetShift(ROWS, MOVES, { gainMultiplier }).after.conversionValue
  );
  assert.deepEqual(gains, [...gains].sort((a, b) => a - b), "monotonic in the multiplier");
  assert.ok(gains[3] > gains[2], "×1.5 projects more than uncalibrated");
});
