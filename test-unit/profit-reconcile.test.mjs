/** Direction 2 — one profit truth per tenant. The pure divergence decision behind
 *  the /zisk reconciliation note (src/lib/profit/reconcile.ts): does the module's
 *  computed blended margin drift far enough from the persisted cost-model margin that
 *  the same e-shop would read two different profits in two tabs? Numbers in → verdict
 *  out, so the threshold and sign are pinned here. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { marginDivergence, MARGIN_DIVERGENCE_PP } = await import("@/lib/profit/reconcile");

test("threshold is 2 percentage points", () => {
  assert.equal(MARGIN_DIVERGENCE_PP, 2);
});

test("no persisted model → never diverged (nothing to reconcile)", () => {
  assert.equal(marginDivergence(0.5, null).diverged, false);
  assert.equal(marginDivergence(0.5, undefined).diverged, false);
});

test("a gap below the threshold does not fire", () => {
  // 42 % computed vs 40.5 % persisted = 1.5 p.b. < 2 p.b.
  const d = marginDivergence(0.42, 0.405);
  assert.equal(d.diverged, false);
  assert.equal(d.deltaPp, 1.5);
});

test("a gap at/above the threshold fires, with both numbers and a signed delta", () => {
  const d = marginDivergence(0.45, 0.4); // 45 % vs 40 % = +5 p.b.
  assert.equal(d.diverged, true);
  assert.equal(d.deltaPp, 5);
  assert.equal(d.computedMargin, 0.45);
  assert.equal(d.persistedMargin, 0.4);
});

test("exactly 2 p.b. is the boundary (inclusive)", () => {
  assert.equal(marginDivergence(0.42, 0.4).diverged, true);
});

test("sign: computed below the report reads negative", () => {
  const d = marginDivergence(0.36, 0.4); // −4 p.b.
  assert.equal(d.diverged, true);
  assert.equal(d.deltaPp, -4);
});

test("a custom threshold is honoured", () => {
  assert.equal(marginDivergence(0.43, 0.4, 5).diverged, false); // 3 p.b. < 5
  assert.equal(marginDivergence(0.46, 0.4, 5).diverged, true); // 6 p.b. ≥ 5
});

test("non-finite inputs degrade to not-diverged", () => {
  assert.equal(marginDivergence(NaN, 0.4).diverged, false);
  assert.equal(marginDivergence(0.4, NaN).diverged, false);
});
