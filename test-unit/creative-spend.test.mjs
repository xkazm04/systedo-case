/** Unit tests for the Creative Studio global-spend charge math: the honest
 *  provider-op count behind the AI_GLOBAL_DAILY_CEILING true-up (candidates +
 *  one vision score each), so a paid image set stops undercounting the ceiling. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { creativeSpendUnits } from "@/lib/images/spend.ts";

test("creativeSpendUnits: scored set costs 2 units per candidate", () => {
  assert.equal(creativeSpendUnits({ candidates: 1, visionScored: true }), 2);
  assert.equal(creativeSpendUnits({ candidates: 4, visionScored: true }), 8);
  // the old flat guard debit of 1 undercounted a 4-candidate set by 8×.
  assert.ok(creativeSpendUnits({ candidates: 4, visionScored: true }) > 1);
});

test("creativeSpendUnits: unscored candidates cost 1 unit each", () => {
  assert.equal(creativeSpendUnits({ candidates: 1, visionScored: false }), 1);
  assert.equal(creativeSpendUnits({ candidates: 4, visionScored: false }), 4);
});

test("creativeSpendUnits: zero / demo path costs nothing", () => {
  assert.equal(creativeSpendUnits({ candidates: 0, visionScored: true }), 0);
  assert.equal(creativeSpendUnits({ candidates: 0, visionScored: false }), 0);
});

test("creativeSpendUnits: partial set charges only the candidates that returned", () => {
  // requested 4 but only 2 downloaded → charge reflects the 2 real ops, not 4.
  assert.equal(creativeSpendUnits({ candidates: 2, visionScored: true }), 4);
});

test("creativeSpendUnits: negatives and fractions are floored/clamped", () => {
  assert.equal(creativeSpendUnits({ candidates: -3, visionScored: true }), 0);
  assert.equal(creativeSpendUnits({ candidates: 2.9, visionScored: true }), 4);
});
