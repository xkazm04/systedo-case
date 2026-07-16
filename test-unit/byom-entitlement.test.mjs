/** Unit tests for the BYOM entitlement gate (src/lib/plans.ts): the paid-plan
 *  check and the dev-only BYOM_MATRIX bypass, which MUST be dead under
 *  NODE_ENV=production — an env flag may never void the paid entitlement in a
 *  real deployment. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { devByomUnlockActive, planHasByom } from "@/lib/plans";

test("planHasByom: only the byom plan carries the entitlement", () => {
  assert.equal(planHasByom("byom"), true);
  assert.equal(planHasByom("free"), false);
  assert.equal(planHasByom("pro"), false);
});

test("devByomUnlockActive: BYOM_MATRIX=true unlocks only OUTSIDE production", () => {
  assert.equal(devByomUnlockActive({ BYOM_MATRIX: "true", NODE_ENV: "development" }), true);
  assert.equal(devByomUnlockActive({ BYOM_MATRIX: "true", NODE_ENV: "test" }), true);
  assert.equal(devByomUnlockActive({ BYOM_MATRIX: "true" }), true);
  // The load-bearing case: production kills the bypass regardless of the flag.
  assert.equal(devByomUnlockActive({ BYOM_MATRIX: "true", NODE_ENV: "production" }), false);
});

test("devByomUnlockActive: anything but the literal 'true' is off", () => {
  assert.equal(devByomUnlockActive({ NODE_ENV: "development" }), false);
  assert.equal(devByomUnlockActive({ BYOM_MATRIX: "1", NODE_ENV: "development" }), false);
  assert.equal(devByomUnlockActive({ BYOM_MATRIX: "TRUE", NODE_ENV: "development" }), false);
  assert.equal(devByomUnlockActive({ BYOM_MATRIX: "", NODE_ENV: "development" }), false);
  assert.equal(devByomUnlockActive({}), false);
});
