/** Bench regression (cost-goals-ltv-04): tailRatio must stay finite for a fully
 *  churned cohort whose last TWO observed retention values are 0 — today 0/0 is
 *  NaN and Math.min/Math.max pass NaN through, so survivalCurve extrapolates NaN
 *  months and ltv / ltvCac / the sparkline all render "NaN Kč". Correct behaviour:
 *  a zero denominator (or non-finite ratio) falls back to a sane in-band ratio
 *  (the module's 0.9 fallback or TAIL_RATIO_MIN). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tailRatio,
  survivalCurve,
  withMetrics,
  TAIL_RATIO_MIN,
  TAIL_RATIO_MAX,
} from "@/lib/ltv/compute";

const deadRetention = [0.5, 0, 0]; // cohort fully churned: last two observed months are 0

test("tailRatio of a fully-churned cohort ([.., 0, 0]) is a finite in-band ratio", () => {
  const r = tailRatio(deadRetention);
  assert.ok(Number.isFinite(r), `tailRatio must be finite for a dead cohort, got ${r}`);
  assert.ok(
    r >= TAIL_RATIO_MIN && r <= TAIL_RATIO_MAX,
    `fallback ratio must land in [${TAIL_RATIO_MIN}, ${TAIL_RATIO_MAX}], got ${r}`
  );
});

test("survivalCurve never extrapolates NaN months for a dead cohort", () => {
  const curve = survivalCurve(deadRetention, 12);
  assert.equal(curve.length, 12);
  for (const [i, v] of curve.entries()) {
    assert.ok(Number.isFinite(v), `survival[${i}] must be finite, got ${v}`);
  }
});

test("withMetrics keeps ltv / ltvCac finite for a dead cohort (no 'NaN Kč')", () => {
  const m = withMetrics({ month: "Led", signups: 100, spend: 100_000, arpu: 300, retention: deadRetention });
  assert.ok(Number.isFinite(m.ltv), `ltv must be finite, got ${m.ltv}`);
  assert.ok(Number.isFinite(m.ltvCac), `ltvCac must be finite, got ${m.ltvCac}`);
});
