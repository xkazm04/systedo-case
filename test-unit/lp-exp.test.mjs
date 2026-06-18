/** Unit tests for the landing-page experiment trust gate: required sample size,
 *  the multiple-comparisons correction, and gating a premature (under-powered)
 *  running experiment so it can't read like a finished winner. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluate,
  requiredSampleSize,
  correctedAlpha,
  zFor,
} from "@/lib/lp-exp/compute";

test("zFor returns the standard normal quantiles", () => {
  // Textbook values: z_{0.975} ≈ 1.95996, z_{0.8} ≈ 0.84162.
  assert.ok(Math.abs(zFor(0.975) - 1.959964) < 1e-3);
  assert.ok(Math.abs(zFor(0.8) - 0.841621) < 1e-3);
});

test("requiredSampleSize matches a hand-computed two-proportion value", () => {
  // baseline 10 %, detect a +20 % relative lift (10 % → 12 %), α=0.05, power=0.8.
  // Standard pooled-variance formula yields 3841 visitors per arm.
  assert.equal(requiredSampleSize(0.1, 0.2, 0.05, 0.8), 3841);
  // A degenerate / impossible target sizes to Infinity rather than NaN.
  assert.equal(requiredSampleSize(0, 0.2), Infinity);
});

test("correctedAlpha tightens the threshold for multi-arm tests", () => {
  // Single comparison is unchanged; more challengers shrink the per-comparison α.
  assert.ok(Math.abs(correctedAlpha(0.05, 1) - 0.05) < 1e-12);
  assert.ok(correctedAlpha(0.05, 2) < 0.05);
  assert.ok(correctedAlpha(0.05, 2) > correctedAlpha(0.05, 3));
});

test("a tiny running experiment is gated, not declared a winner", () => {
  const r = evaluate({
    id: "tiny",
    cluster: "c",
    status: "running",
    variants: [
      { label: "A", visitors: 60, signups: 3 },
      { label: "B", visitors: 65, signups: 8 },
    ],
  });
  // B leads, but the arms are nowhere near the required N → no winner verdict.
  assert.equal(r.winner.label, "B");
  assert.equal(r.hasEnoughData, false);
  assert.equal(r.significant, false);
  assert.ok(r.progress < 1);
  assert.ok(r.requiredPerArm > 125);
});

test("a done experiment with enough data still declares its winner", () => {
  const r = evaluate({
    id: "x",
    cluster: "c",
    status: "done",
    variants: [
      { label: "A", visitors: 5000, signups: 200 },
      { label: "B", visitors: 5000, signups: 300 },
    ],
  });
  assert.equal(r.winner.label, "B");
  assert.equal(r.significant, true);
  assert.ok(r.confidence > 0.9);
});

test("a multi-arm test carries the correction into the comparison count", () => {
  const r = evaluate({
    id: "m",
    cluster: "c",
    status: "running",
    variants: [
      { label: "A", visitors: 3600, signups: 144 },
      { label: "B", visitors: 3550, signups: 132 },
      { label: "C", visitors: 3580, signups: 176 },
    ],
  });
  assert.equal(r.comparisons, 2);
  assert.ok(r.effectiveAlpha < 0.05); // Šidák-corrected for 2 challengers
});
