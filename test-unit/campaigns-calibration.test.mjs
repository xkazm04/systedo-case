/** WP W2-E — the projection calibration derived from realized impact
 *  (src/lib/campaigns/calibration.ts). Pure: the median, the clamp at both ends,
 *  the minimum history below which the multiplier is exactly 1, and the exclusions
 *  that stop missing data from being read as a ratio of zero. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCalibration,
  parseCalibration,
  neutralCalibration,
  CALIBRATION_MIN_SETS,
  CALIBRATION_CLAMP,
} from "@/lib/campaigns/calibration";

const NOW = Date.parse("2026-08-20T12:00:00.000Z");

/** A change-set carrying a measured realization with the given ratio. */
const measured = (ratio, over = {}) => ({
  realized: {
    status: "measured",
    ratio,
    projectedValueGain: 1000,
    realizedValueDelta: ratio * 1000,
    ...over,
  },
});

// --- the minimum history ------------------------------------------------------

test("below the minimum history the multiplier is exactly 1, with the reason stated", () => {
  assert.equal(CALIBRATION_MIN_SETS, 3);
  const c = computeCalibration([measured(0.4), measured(0.6)], NOW);
  assert.equal(c.multiplier, 1);
  assert.equal(c.n, 2, "the count is still reported honestly");
  assert.equal(c.reason, "insufficient-history");
  assert.equal(c.updatedAt, new Date(NOW).toISOString());
});

test("an empty ledger is the neutral calibration", () => {
  assert.deepEqual(computeCalibration([], NOW), neutralCalibration(NOW, 0));
  assert.equal(neutralCalibration(NOW).multiplier, 1);
});

// --- the median ---------------------------------------------------------------

test("the multiplier is the MEDIAN ratio, so one freak week cannot move it", () => {
  const c = computeCalibration([measured(0.4), measured(0.6), measured(2.9)], NOW);
  assert.equal(c.multiplier, 0.6, "median of [0.4, 0.6, 2.9] — the mean would be 1.3");
  assert.equal(c.n, 3);
  assert.equal(c.reason, undefined, "a real calibration carries no reason");
});

test("the input order does not change the median", () => {
  const ratios = [2.9, 0.4, 0.6];
  assert.equal(computeCalibration(ratios.map((r) => measured(r)), NOW).multiplier, 0.6);
});

test("an even-sized history averages the two middle ratios", () => {
  const c = computeCalibration([0.4, 0.6, 0.8, 1.0].map((r) => measured(r)), NOW);
  assert.equal(c.multiplier, 0.7);
  assert.equal(c.n, 4);
});

// --- the clamp ----------------------------------------------------------------

test("a catastrophic history clamps at the floor rather than erasing the projection", () => {
  assert.deepEqual(CALIBRATION_CLAMP, [0.3, 1.5]);
  const c = computeCalibration([0.1, 0.2, 0.25].map((r) => measured(r)), NOW);
  assert.equal(c.multiplier, 0.3, "median 0.2 → clamped to the floor");
});

test("a negative median (realized losses) still clamps to the floor, never below zero", () => {
  const c = computeCalibration([-3, -1, -0.5].map((r) => measured(r)), NOW);
  assert.equal(c.multiplier, 0.3);
});

test("a flattering history clamps at the ceiling rather than inflating the projection", () => {
  const c = computeCalibration([2, 3, 4].map((r) => measured(r)), NOW);
  assert.equal(c.multiplier, 1.5, "median 3 → clamped to the ceiling");
});

test("a median already inside the band passes through untouched", () => {
  assert.equal(computeCalibration([0.3, 1.2, 1.5].map((r) => measured(r)), NOW).multiplier, 1.2);
});

// --- exclusions ---------------------------------------------------------------

test("an 'insufficient' measurement is excluded, not counted as a ratio of zero", () => {
  const sets = [measured(1.2), measured(1.2), measured(1.2), { realized: { status: "insufficient", ratio: null, projectedValueGain: 1000 } }];
  const c = computeCalibration(sets, NOW);
  assert.equal(c.n, 3, "only the measured sets count");
  assert.equal(c.multiplier, 1.2);
});

test("a set scored against a non-positive projection is excluded", () => {
  const sets = [measured(1.2), measured(1.2), measured(1.2), measured(5, { projectedValueGain: 0 })];
  assert.equal(computeCalibration(sets, NOW).n, 3);
});

test("a null or non-finite ratio is excluded", () => {
  const sets = [measured(1.2), measured(1.2), measured(1.2), measured(null), measured(Infinity), measured(NaN)];
  assert.equal(computeCalibration(sets, NOW).n, 3);
});

test("un-realized sets (the whole ledger before this WP) leave the calibration neutral", () => {
  const c = computeCalibration([{}, { realized: undefined }, {}], NOW);
  assert.equal(c.multiplier, 1);
  assert.equal(c.n, 0);
  assert.equal(c.reason, "insufficient-history");
});

// --- reading the stored doc back ---------------------------------------------

test("a well-formed stored calibration parses back to itself", () => {
  const stored = { multiplier: 0.6, n: 4, updatedAt: "2026-08-20T12:00:00.000Z" };
  assert.deepEqual(parseCalibration(stored), stored);
});

test("a multiplier outside the clamp band is refused — the projection stays uncalibrated", () => {
  assert.equal(parseCalibration({ multiplier: 0.1, n: 5 }), null);
  assert.equal(parseCalibration({ multiplier: 4, n: 5 }), null);
  assert.equal(parseCalibration({ multiplier: 1, n: 0 })?.multiplier, 1, "the identity is always allowed");
});

test("a missing, malformed or non-numeric doc reads as no calibration at all", () => {
  assert.equal(parseCalibration(undefined), null);
  assert.equal(parseCalibration(null), null);
  assert.equal(parseCalibration("0.6"), null);
  assert.equal(parseCalibration({ n: 5 }), null);
  assert.equal(parseCalibration({ multiplier: "0.6", n: 5 }), null);
  assert.equal(parseCalibration({ multiplier: NaN, n: 5 }), null);
});

test("a garbage n reads as 0 rather than poisoning the disclosure", () => {
  assert.equal(parseCalibration({ multiplier: 0.6, n: "many" }).n, 0);
  assert.equal(parseCalibration({ multiplier: 0.6, n: -3 }).n, 0);
  assert.equal(parseCalibration({ multiplier: 0.6, n: 4.9 }).n, 4);
});
