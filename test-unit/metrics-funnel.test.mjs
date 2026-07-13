/** Direction 1: funnel-consistency decomposition of a revenue move into traffic /
 *  conversion-rate / AOV drivers (LMDI log-decomposition). The three driver shares
 *  sum to exactly 1, and the dominant driver is the largest absolute contribution. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decomposeRevenueMove } from "@/lib/metrics/funnel";

/** Minimal Totals-shaped stub (only the three funnel factors are read). */
const T = (visits, conversions, revenue) => ({ visits, conversions, revenue });

test("a pure traffic move attributes ~100 % to traffic", () => {
  // visits ×2, CR and AOV held → revenue ×2, all from traffic.
  const prev = T(1000, 20, 10000); // CR 2 %, AOV 500
  const cur = T(2000, 40, 20000); // CR 2 %, AOV 500
  const f = decomposeRevenueMove(cur, prev);
  assert.ok(f);
  assert.equal(f.dominant, "traffic");
  assert.ok(Math.abs(f.totalChange - 1) < 1e-12, "revenue doubled");
  assert.ok(Math.abs(f.drivers.traffic.share - 1) < 1e-12);
  assert.ok(Math.abs(f.drivers.conversion.share) < 1e-12);
  assert.ok(Math.abs(f.drivers.aov.share) < 1e-12);
  assert.ok(Math.abs(f.drivers.traffic.change - 1) < 1e-12);
});

test("driver shares always sum to exactly 1 (the LMDI identity)", () => {
  // Mixed move: traffic +10 %, CR +20 %, AOV +20 %.
  const prev = T(1000, 20, 10000);
  const cur = T(1100, 1100 * 0.024, 1100 * 0.024 * 600); // CR 2.4 %, AOV 600
  const f = decomposeRevenueMove(cur, prev);
  assert.ok(f);
  const sum = f.drivers.traffic.share + f.drivers.conversion.share + f.drivers.aov.share;
  assert.ok(Math.abs(sum - 1) < 1e-9, `shares sum to 1 (got ${sum})`);
  // CR and AOV each moved more than traffic → one of them dominates.
  assert.ok(f.dominant === "conversion" || f.dominant === "aov");
});

test("a conversion-rate collapse is attributed to conversion", () => {
  // visits flat, AOV flat, CR halved → revenue halved, all via conversion rate.
  const prev = T(1000, 40, 20000); // CR 4 %, AOV 500
  const cur = T(1000, 20, 10000); // CR 2 %, AOV 500
  const f = decomposeRevenueMove(cur, prev);
  assert.ok(f);
  assert.equal(f.dominant, "conversion");
  assert.ok(f.drivers.conversion.change < 0, "CR fell");
  assert.ok(Math.abs(f.drivers.conversion.share - 1) < 1e-12);
});

test("degenerate periods decompose to null (silent, no noise)", () => {
  assert.equal(decomposeRevenueMove(T(1000, 20, 10000), T(0, 0, 0)), null, "zero baseline");
  assert.equal(decomposeRevenueMove(T(1000, 0, 0), T(1000, 20, 10000)), null, "zero current factor");
  assert.equal(decomposeRevenueMove(T(1000, 20, 10000), T(1000, 20, 10000)), null, "flat period");
});
