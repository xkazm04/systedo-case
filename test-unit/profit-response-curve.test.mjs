/** Unit tests for the response-curve branch of `reallocateBudget` (WP W1-F).
 *  The pinned constant-ROAS behaviour lives in profit.test.mjs and must not move;
 *  this suite proves the curve path and, above all, that it is NOT taken unless a
 *  fitted curve is actually supplied.
 *  Runs the TS source directly via the shared resolve hook
 *  (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProfit, reallocateBudget } from "@/lib/profit/compute";
import { revenueAt, marginalPoas } from "@/lib/metrics/response-curve";

const row = (channel, revenue, cost, roas) => ({ channel, color: "#000", revenue, cost, roas });

/** Same fixture shape as profit.test.mjs:
 *    GOOD: roas 6 × margin 0.5 = 3.0 → linear marginal +2.0/Kč
 *    BAD:  roas 1 × margin 0.3 = 0.3 → linear marginal −0.7/Kč (drained) */
function sampleRows() {
  const { rows } = computeProfit(
    [row("GOOD", 6000, 1000, 6), row("BAD", 1000, 1000, 1)],
    [
      { channel: "GOOD", marginPct: 0.5 },
      { channel: "BAD", marginPct: 0.3 },
    ]
  );
  return rows;
}

const curve = (over = {}) => ({
  a: 1,
  b: 0.5,
  fitted: true,
  n: 30,
  r2: 0.9,
  spendMin: 100,
  spendMax: 2000,
  basis: "channel",
  ...over,
});

/** A square-root curve calibrated to pass through (spend, revenue) today —
 *  revenue = a·√s with a = revenue / √spend. */
const sqrtCurveThrough = (spend, revenue, over = {}) =>
  curve({ a: revenue / Math.sqrt(spend), ...over });

const GOOD_CURVE = sqrtCurveThrough(1000, 6000); // a ≈ 189.74, b = 0.5

test("no curves and an empty curve map take the EXISTING constant-ROAS path", () => {
  const rows = sampleRows();
  const baseline = reallocateBudget(rows, { totalBudget: 5000 });
  assert.deepStrictEqual(reallocateBudget(rows, { totalBudget: 5000, curves: {} }), baseline);
  assert.deepStrictEqual(
    reallocateBudget(rows, { totalBudget: 5000, curves: undefined }),
    baseline
  );
  // …and the linear rows never grow the curve-only fields.
  for (const r of baseline.rows) {
    assert.equal("marginalPoasAtSuggested" in r, false);
    assert.equal("curve" in r, false);
  }
});

test("a map of UNFITTED curves is treated as no curves at all", () => {
  const rows = sampleRows();
  const baseline = reallocateBudget(rows, { totalBudget: 5000, strategy: "hold-revenue" });
  const unfitted = {
    GOOD: curve({ fitted: false, b: 1, a: 6, r2: 0 }),
    BAD: curve({ fitted: false, b: 1, a: 1, r2: 0 }),
  };
  assert.deepStrictEqual(
    reallocateBudget(rows, { totalBudget: 5000, strategy: "hold-revenue", curves: unfitted }),
    baseline
  );
});

test("a saturating channel receives LESS than the linear plan would give it", () => {
  const rows = sampleRows();
  const linear = reallocateBudget(rows, { totalBudget: 5000, maxSpendMultiple: 3 });
  const curved = reallocateBudget(rows, {
    totalBudget: 5000,
    maxSpendMultiple: 3,
    curves: { GOOD: GOOD_CURVE },
  });
  const linGood = linear.rows.find((r) => r.channel === "GOOD");
  const curGood = curved.rows.find((r) => r.channel === "GOOD");
  // Linear pours the whole cap (3 × 1000) into GOOD; the curve stops where the next
  // koruna stops paying for itself: a·b·s^(b−1)·margin = 1 → s ≈ 2249 Kč.
  assert.equal(linGood.suggestedSpend, 3000);
  assert.ok(curGood.suggestedSpend < linGood.suggestedSpend);
  const breakEven = Math.pow((GOOD_CURVE.a * 0.5 * 0.5) / 1, 2); // (a·b·margin)²  for b = 0.5
  assert.ok(
    Math.abs(curGood.suggestedSpend - breakEven) <= 5000 / 400 + 1e-9,
    `expected ≈ ${breakEven}, got ${curGood.suggestedSpend}`
  );
  // The projection is read off the curve, not off a constant ROAS.
  assert.ok(Math.abs(curGood.projectedRevenue - revenueAt(GOOD_CURVE, curGood.suggestedSpend)) < 1e-9);
  assert.ok(curGood.projectedRevenue < curGood.suggestedSpend * curGood.roas);
});

test("the curve plan conserves the budget and never suggests a negative spend", () => {
  const rows = sampleRows();
  const plan = reallocateBudget(rows, {
    totalBudget: 4000,
    curves: { GOOD: GOOD_CURVE, BAD: sqrtCurveThrough(1000, 1000) },
  });
  assert.ok(plan.allocatedSpend <= 4000 + 1e-9);
  assert.equal(
    plan.allocatedSpend,
    plan.rows.reduce((a, r) => a + r.suggestedSpend, 0)
  );
  for (const r of plan.rows) {
    assert.ok(r.suggestedSpend >= 0, `${r.channel} must not go negative`);
    assert.ok(Number.isFinite(r.projectedRevenue) && Number.isFinite(r.projectedNetProfit));
  }
  // The plan totals reconcile with the rows.
  const projected = plan.rows.reduce((a, r) => a + r.projectedRevenue, 0);
  assert.ok(Math.abs(plan.projectedRevenue - projected) < 1e-9);
  assert.ok(Math.abs(plan.profitDelta - (plan.projectedNetProfit - plan.currentNetProfit)) < 1e-9);
});

test("mixing: an uncurved channel keeps the linear term and the 3× cap exactly", () => {
  // Both channels are profitable on the margin, so both attract budget; only GOOD
  // carries a curve. OK stays on the constant-ROAS line and stops at its cap.
  const { rows } = computeProfit(
    [row("GOOD", 6000, 1000, 6), row("OK", 4000, 1000, 4)],
    [
      { channel: "GOOD", marginPct: 0.5 },
      { channel: "OK", marginPct: 0.5 },
    ]
  );
  const plan = reallocateBudget(rows, {
    totalBudget: 20_000,
    maxSpendMultiple: 3,
    curves: { GOOD: GOOD_CURVE },
  });
  const ok = plan.rows.find((r) => r.channel === "OK");
  const good = plan.rows.find((r) => r.channel === "GOOD");
  assert.ok(Math.abs(ok.suggestedSpend - 3000) < 1e-9, `linear cap must bind: ${ok.suggestedSpend}`);
  assert.ok(Math.abs(ok.projectedRevenue - 3000 * 4) < 1e-9);
  // The linear channel is honest about having no curve; the curved one discloses its fit.
  assert.equal(ok.curve, undefined);
  assert.equal(ok.marginalPoasAtSuggested, undefined);
  assert.deepStrictEqual(good.curve, { fitted: true, b: 0.5, r2: 0.9, basis: "channel" });
});

test("marginalPoasAtSuggested reports the curve's slope where the budget landed", () => {
  const rows = sampleRows();
  const plan = reallocateBudget(rows, { totalBudget: 5000, curves: { GOOD: GOOD_CURVE } });
  const good = plan.rows.find((r) => r.channel === "GOOD");
  assert.ok(
    Math.abs(good.marginalPoasAtSuggested - marginalPoas(GOOD_CURVE, good.suggestedSpend, 0.5)) < 1e-12
  );
  // Diminishing returns: the marginal at the suggested spend is BELOW today's constant
  // term, which is exactly what the linear model was hiding.
  assert.ok(good.marginalPoasAtSuggested < good.marginalProfit);
  // Allocation stops at the break-even margin, within one hill-climb step.
  assert.ok(Math.abs(good.marginalPoasAtSuggested) < 0.05);
});

test("an unfitted curve entry still discloses itself, and keeps the linear behaviour", () => {
  const rows = sampleRows();
  const plan = reallocateBudget(rows, {
    totalBudget: 5000,
    maxSpendMultiple: 3,
    curves: {
      GOOD: GOOD_CURVE,
      BAD: curve({ fitted: false, b: 1, a: 1, r2: 0.1, basis: "account-scaled" }),
    },
  });
  const bad = plan.rows.find((r) => r.channel === "BAD");
  assert.deepStrictEqual(bad.curve, { fitted: false, b: 1, r2: 0.1, basis: "account-scaled" });
  assert.equal(bad.marginalPoasAtSuggested, undefined);
  // BAD loses money on the margin (0.3 × 1) → drained, exactly as the linear solver does.
  assert.equal(bad.suggestedSpend, 0);
  assert.equal(bad.projectedRevenue, 0);
});

test("hold-revenue protects today's revenue along the curves", () => {
  const rows = sampleRows(); // current revenue 7000
  const plan = reallocateBudget(rows, {
    totalBudget: 6000,
    strategy: "hold-revenue",
    curves: { GOOD: GOOD_CURVE, BAD: sqrtCurveThrough(1000, 1000) },
  });
  assert.equal(plan.currentRevenue, 7000);
  assert.equal(plan.revenueHeld, true);
  assert.ok(plan.projectedRevenue >= plan.currentRevenue - 1e-6);
  assert.ok(plan.allocatedSpend <= 6000 + 1e-9);
  // Holding revenue costs profit versus the profit-first plan — the trade the strategy names.
  const maxProfit = reallocateBudget(rows, {
    totalBudget: 6000,
    strategy: "max-profit",
    curves: { GOOD: GOOD_CURVE, BAD: sqrtCurveThrough(1000, 1000) },
  });
  assert.ok(maxProfit.projectedNetProfit >= plan.projectedNetProfit - 1e-9);
});

test("a curve is never funded past the band its data supports", () => {
  const rows = sampleRows();
  // A tiny observed band (spendMax 200) with a very rich curve: the allocator would
  // happily buy forever, but 1.5 × spendMax is the edge of the evidence.
  const narrow = curve({ a: 5000, b: 0.5, spendMin: 50, spendMax: 200 });
  const plan = reallocateBudget(rows, {
    totalBudget: 100_000,
    maxSpendMultiple: 1,
    curves: { GOOD: narrow },
  });
  const good = plan.rows.find((r) => r.channel === "GOOD");
  // limit = max(cap 1×1000, 1.5 × 200 = 300) → the linear cap wins here…
  assert.ok(good.suggestedSpend <= Math.max(1000, 200 * 1.5) + 1e-9);
  // …and the revenue projection is flat beyond the extrapolation bound either way.
  assert.equal(revenueAt(narrow, 10_000), revenueAt(narrow, 300));
});

test("a zero budget drains everything and stays finite", () => {
  const rows = sampleRows();
  const plan = reallocateBudget(rows, { totalBudget: 0, curves: { GOOD: GOOD_CURVE } });
  assert.equal(plan.allocatedSpend, 0);
  assert.equal(plan.projectedRevenue, 0);
  for (const r of plan.rows) assert.equal(r.suggestedSpend, 0);
  assert.ok(Number.isFinite(plan.profitDelta));
  assert.equal(plan.revenueHeld, false);
});
