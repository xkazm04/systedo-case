/** Unit tests for the adjustable LTV horizon + confidence-band projection
 *  (feature #3): LTV must scale sensibly with the horizon, the default horizon
 *  must reproduce the prior value, and the low/expected/high band must bracket
 *  the expected projection in order. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withMetrics,
  survivalCurve,
  ltvProjection,
  blendedLtvAtRatio,
  tailRatio,
  LTV_HORIZON,
  TAIL_RATIO_MIN,
  TAIL_RATIO_MAX,
} from "@/lib/ltv/compute";

// A decaying-but-positive retention curve so the extrapolated tail always adds
// (positive) value: each extra month contributes more LTV.
const cohort = { month: "Led", signups: 100, spend: 100_000, arpu: 300, retention: [1, 0.7, 0.6, 0.55] };

test("a longer horizon yields ≥ LTV (24-mo ≥ 12-mo ≥ 6-mo) for a positive curve", () => {
  const l6 = withMetrics(cohort, 6).ltv;
  const l12 = withMetrics(cohort, 12).ltv;
  const l24 = withMetrics(cohort, 24).ltv;
  const l36 = withMetrics(cohort, 36).ltv;
  assert.ok(l12 >= l6, "12-mo LTV ≥ 6-mo LTV");
  assert.ok(l24 >= l12, "24-mo LTV ≥ 12-mo LTV");
  assert.ok(l36 >= l24, "36-mo LTV ≥ 24-mo LTV");
  // strictly greater while the tail is still positive (ratio in band > 0)
  assert.ok(l24 > l12, "extra months add value");
});

test("the default horizon (omitted arg) reproduces the prior LTV_HORIZON value", () => {
  assert.equal(LTV_HORIZON, 12); // contract: default unchanged
  const dflt = withMetrics(cohort); // no horizon arg
  const explicit = withMetrics(cohort, LTV_HORIZON);
  assert.equal(dflt.survival.length, 12);
  assert.equal(dflt.ltv, explicit.ltv);
  // and the survival curve helper agrees with what withMetrics builds
  assert.deepEqual(dflt.survival, survivalCurve(cohort.retention, 12));
});

test("survivalCurve keeps the observed prefix and applies the ratio only to the tail", () => {
  const auto = survivalCurve(cohort.retention, 6);
  assert.deepEqual(auto.slice(0, 4), cohort.retention); // observed months untouched
  // the tail steps down by the cohort's own clamped ratio
  const r = tailRatio(cohort.retention);
  assert.ok(Math.abs(auto[4] - cohort.retention[3] * r) < 1e-9);
  assert.ok(Math.abs(auto[5] - cohort.retention[3] * r * r) < 1e-9);
});

test("ltvProjection brackets the expected value: low ≤ expected ≤ high", () => {
  const p = ltvProjection([cohort], 24);
  assert.equal(p.horizon, 24);
  assert.ok(p.low <= p.expected, "low ≤ expected");
  assert.ok(p.expected <= p.high, "expected ≤ high");
  // a slower-decay (high) tail strictly out-earns a faster-decay (low) tail here
  assert.ok(p.high > p.low, "band has width");
  // LTV:CAC band tracks the LTV band against a positive CAC
  assert.ok(p.paidCac > 0);
  assert.ok(p.ltvCacLow <= p.ltvCacExpected && p.ltvCacExpected <= p.ltvCacHigh);
  // ratios are exactly LTV / paidCac
  assert.ok(Math.abs(p.ltvCacExpected - p.expected / p.paidCac) < 1e-9);
});

test("the band low/high equal the clamp-bound projections", () => {
  const horizon = 24;
  const p = ltvProjection([cohort], horizon);
  assert.ok(Math.abs(p.low - blendedLtvAtRatio([cohort], horizon, TAIL_RATIO_MIN)) < 1e-9);
  assert.ok(Math.abs(p.high - blendedLtvAtRatio([cohort], horizon, TAIL_RATIO_MAX)) < 1e-9);
});

test("blendedLtvAtRatio: a higher survival ratio (less churn) gives a higher LTV", () => {
  const slow = blendedLtvAtRatio([cohort], 36, 0.95);
  const fast = blendedLtvAtRatio([cohort], 36, 0.82);
  assert.ok(slow > fast, "slower decay → more lifetime value");
});

test("ltvProjection signup-weights LTV per user across cohorts", () => {
  const a = { month: "A", signups: 100, spend: 50_000, arpu: 200, retention: [1, 0.6, 0.5] };
  const b = { month: "B", signups: 300, spend: 90_000, arpu: 400, retention: [1, 0.8, 0.7] };
  const p = ltvProjection([a, b], 12);
  // expected = Σ(ltvPerUser·signups)/Σsignups — recompute independently
  const la = withMetrics(a, 12).ltv;
  const lb = withMetrics(b, 12).ltv;
  const want = (la * 100 + lb * 300) / 400;
  assert.ok(Math.abs(p.expected - want) < 1e-6);
});
