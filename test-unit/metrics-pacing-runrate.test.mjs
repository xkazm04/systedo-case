/** Unit tests for the required-pace prescription fields on MonthlyPacing (#2).
 *  Runs the TS source directly via the shared resolve hook
 *  (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyPacing } from "@/lib/metrics/pacing";

/** Build `n` consecutive days starting at `start` with fixed metrics. A constant
 *  series yields flat weekday weights, so the projection math stays trivial. */
function days(start, n, point) {
  const out = [];
  const base = new Date(`${start}T00:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    const d = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    out.push({ date: d, ...point });
  }
  return out;
}

const approx = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);

test("behind plan: required pace, current pace, ratio and implied extra spend", () => {
  // 56 flat days ending 2026-05-14: May elapsed 14/31, mtd = 14 000.
  const daily = days("2026-03-20", 56, { visits: 100, cost: 100, conversions: 2, revenue: 1000 });
  assert.equal(daily[daily.length - 1].date, "2026-05-14");
  const p = monthlyPacing(daily, 40_000);

  assert.ok(p);
  assert.equal(p.daysRemaining, 17);
  assert.equal(p.mtd, 14_000);
  // Flat weights → projection = 1000 × 31 = 31 000 → recent pace 1000/day.
  approx(p.projection, 31_000, 1e-6);
  approx(p.recentDailyRevenue, 1000, 1e-6);
  // Required = (40 000 − 14 000) / 17 ≈ 1529.41/day — 53 % above the current pace.
  approx(p.requiredDailyRevenue, 26_000 / 17, 1e-9);
  approx(p.requiredVsRecent, 26_000 / 17 / 1000, 1e-6);
  // Trailing 28d ROAS = 1000/100 = 10× → extra spend = shortfall / 10.
  approx(p.impliedExtraDailySpend, (26_000 / 17 - 1000) / 10, 1e-6);
});

test("ahead of plan: required stays below recent and implies no extra spend", () => {
  const daily = days("2026-03-20", 56, { visits: 100, cost: 100, conversions: 2, revenue: 1000 });
  const p = monthlyPacing(daily, 20_000);

  assert.ok(p);
  // Required = (20 000 − 14 000) / 17 ≈ 352.94 < recent 1000.
  approx(p.requiredDailyRevenue, 6_000 / 17, 1e-9);
  assert.ok(p.requiredDailyRevenue < p.recentDailyRevenue);
  assert.equal(p.impliedExtraDailySpend, 0);
});

test("goal already banked mid-month: required pace is 0, never negative", () => {
  const daily = days("2026-03-20", 56, { visits: 100, cost: 100, conversions: 2, revenue: 1000 });
  const p = monthlyPacing(daily, 10_000); // mtd 14 000 > goal

  assert.ok(p);
  assert.equal(p.requiredDailyRevenue, 0);
  assert.equal(p.impliedExtraDailySpend, 0);
});

test("complete month: all prescription fields settle to 0", () => {
  // 62 flat days ending exactly on 2026-05-31 → May complete.
  const daily = days("2026-03-31", 62, { visits: 100, cost: 100, conversions: 2, revenue: 1000 });
  assert.equal(daily[daily.length - 1].date, "2026-05-31");
  const p = monthlyPacing(daily, 40_000);

  assert.ok(p);
  assert.equal(p.complete, true);
  assert.equal(p.requiredDailyRevenue, 0);
  assert.equal(p.recentDailyRevenue, 0);
  assert.equal(p.requiredVsRecent, 0);
  assert.equal(p.impliedExtraDailySpend, 0);
});

test("zero-spend series: implied extra spend guards the unknown ROAS", () => {
  const daily = days("2026-03-20", 56, { visits: 100, cost: 0, conversions: 2, revenue: 1000 });
  const p = monthlyPacing(daily, 40_000);

  assert.ok(p);
  assert.ok(p.requiredDailyRevenue > p.recentDailyRevenue);
  assert.equal(p.impliedExtraDailySpend, 0);
});
