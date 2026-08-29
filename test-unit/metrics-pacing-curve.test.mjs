/** Unit tests for the response-curve extension of `monthlyPacing` (WP W1-F): the
 *  implied extra daily spend solved along a fitted curve instead of divided by the
 *  trailing average ROAS. The pinned average-ROAS behaviour lives in
 *  metrics-pacing-runrate.test.mjs and must not move.
 *  Runs the TS source directly via the shared resolve hook
 *  (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyPacing } from "@/lib/metrics/pacing";

/** `n` consecutive days from `start` with fixed metrics (flat weekday weights). */
function days(start, n, point) {
  const out = [];
  const base = new Date(`${start}T00:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    out.push({ date: new Date(base + i * 86_400_000).toISOString().slice(0, 10), ...point });
  }
  return out;
}

const approx = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);

/** The same 56 flat days the run-rate suite uses: 100 Kč/day spend, 1000 Kč/day revenue,
 *  ending 2026-05-14 → May is 14/31 elapsed, mtd 14 000, trailing ROAS 10×. */
const flatSeries = () =>
  days("2026-03-20", 56, { visits: 100, cost: 100, conversions: 2, revenue: 1000 });

/** revenue = 100·√spend, which passes exactly through today's (100, 1000). */
const curve = (over = {}) => ({
  a: 100,
  b: 0.5,
  fitted: true,
  n: 40,
  r2: 0.85,
  spendMin: 50,
  spendMax: 400,
  basis: "account-scaled",
  ...over,
});

test("no curve keeps the trailing-average formula and says so", () => {
  const p = monthlyPacing(flatSeries(), 40_000);
  assert.ok(p);
  assert.equal(p.impliedBasis, "average");
  // Trailing 28d ROAS = 10× → shortfall / 10 (identical to the pinned suite).
  approx(p.impliedExtraDailySpend, (26_000 / 17 - 1000) / 10, 1e-6);
});

test("an UNFITTED curve is ignored — the average formula still runs", () => {
  const daily = flatSeries();
  const baseline = monthlyPacing(daily, 40_000);
  const p = monthlyPacing(daily, 40_000, undefined, curve({ fitted: false, b: 1, a: 10 }));
  assert.ok(p);
  assert.equal(p.impliedBasis, "average");
  assert.equal(p.impliedExtraDailySpend, baseline.impliedExtraDailySpend);
});

test("a fitted curve prices the next koruna at its MARGINAL return", () => {
  const p = monthlyPacing(flatSeries(), 40_000, undefined, curve());
  assert.ok(p);
  assert.equal(p.impliedBasis, "curve");

  // Required 1529.41/day vs a 1000/day pace → 529.41/day of revenue must be bought.
  const required = 26_000 / 17;
  const need = required - 1000;
  // Solve 100·√(100 + s) − 1000 = need  →  s = ((1000 + need)/100)² − 100.
  const expected = Math.pow((1000 + need) / 100, 2) - 100;
  approx(p.impliedExtraDailySpend, expected, 1e-6);

  // The saturating account needs MORE than the trailing-average answer — the whole
  // point of the change: the average hides that the next koruna is worth less.
  const average = need / 10;
  assert.ok(
    p.impliedExtraDailySpend > average * 2,
    `curve ${p.impliedExtraDailySpend} should far exceed average ${average}`
  );
});

test("the curve solve is bounded at 3× today's daily spend", () => {
  // A goal the curve cannot reach inside the bound: at 4× today's spend the curve
  // yields 100·√400 = 2000/day, so any required pace above that hits the ceiling.
  const p = monthlyPacing(flatSeries(), 1_000_000, undefined, curve());
  assert.ok(p);
  assert.equal(p.impliedBasis, "curve");
  assert.equal(p.impliedExtraDailySpend, 300); // 3 × 100 Kč/day
});

test("on pace: nothing extra is implied, whichever basis is used", () => {
  const daily = flatSeries();
  // A goal already beaten by the flat projection (31 000) → no shortfall to buy.
  const withCurve = monthlyPacing(daily, 20_000, undefined, curve());
  const without = monthlyPacing(daily, 20_000);
  assert.ok(withCurve && without);
  assert.equal(withCurve.impliedExtraDailySpend, 0);
  assert.equal(without.impliedExtraDailySpend, 0);
  assert.equal(withCurve.impliedBasis, "curve");
  assert.equal(without.impliedBasis, "average");
});

test("a zero-spend series cannot use the curve and falls back honestly", () => {
  const daily = days("2026-03-20", 56, { visits: 100, cost: 0, conversions: 2, revenue: 1000 });
  const p = monthlyPacing(daily, 40_000, undefined, curve());
  assert.ok(p);
  assert.equal(p.impliedBasis, "average");
  // No spend → no ROAS → no honest number to quote.
  assert.equal(p.impliedExtraDailySpend, 0);
});
