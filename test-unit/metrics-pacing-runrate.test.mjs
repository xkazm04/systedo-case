/** Unit tests for the required-pace prescription fields on MonthlyPacing (#2).
 *  Runs the TS source directly via the shared resolve hook
 *  (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { daysAheadDisplay, monthlyPacing } from "@/lib/metrics/pacing";

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

test("gappy month: prescription divides by FUTURE days, not phantom interior gaps", () => {
  // May with 5 missing INTERIOR days, latest point 2026-05-25. present-count = 20, so
  // daysRemaining = 31 − 20 = 11, but only 31 − 25 = 6 calendar days are still ahead.
  // The required/recent daily pace must divide the shortfall by the 6 real future days.
  const out = [];
  const leadIn = new Date("2026-03-22T00:00:00Z").getTime();
  for (let i = 0; i < 40; i++) {
    const d = new Date(leadIn + i * 86_400_000).toISOString().slice(0, 10);
    if (d.slice(0, 7) === "2026-05") continue;
    out.push({ date: d, visits: 100, cost: 100, conversions: 2, revenue: 1000 });
  }
  const gaps = new Set(["2026-05-06", "2026-05-07", "2026-05-13", "2026-05-14", "2026-05-20"]);
  for (let dm = 1; dm <= 25; dm++) {
    const iso = `2026-05-${String(dm).padStart(2, "0")}`;
    if (gaps.has(iso)) continue;
    out.push({ date: iso, visits: 100, cost: 100, conversions: 2, revenue: 1000 });
  }
  assert.equal(out[out.length - 1].date, "2026-05-25");
  const p = monthlyPacing(out, 40_000);

  assert.ok(p);
  assert.equal(p.daysElapsed, 20, "20 present May days");
  assert.equal(p.daysRemaining, 11, "daysRemaining still counts interior gaps (projection weight)");
  assert.equal(p.mtd, 20_000);
  // Required = (40 000 − 20 000) / 6 future days — NOT / 11.
  approx(p.requiredDailyRevenue, 20_000 / 6, 1e-9);
  assert.ok(
    p.requiredDailyRevenue > 20_000 / 11,
    "required pace is not diluted by the 5 phantom interior days"
  );
});

test("zero-spend series: implied extra spend guards the unknown ROAS", () => {
  const daily = days("2026-03-20", 56, { visits: 100, cost: 0, conversions: 2, revenue: 1000 });
  const p = monthlyPacing(daily, 40_000);

  assert.ok(p);
  assert.ok(p.requiredDailyRevenue > p.recentDailyRevenue);
  assert.equal(p.impliedExtraDailySpend, 0);
});

/** May 2026 with `gaps` missing interior days, the latest point on day `lastDay`. */
function gappyMay(gaps, lastDay) {
  const out = [];
  const leadIn = new Date("2026-03-22T00:00:00Z").getTime();
  for (let i = 0; i < 40; i++) {
    const d = new Date(leadIn + i * 86_400_000).toISOString().slice(0, 10);
    if (d.slice(0, 7) === "2026-05") continue;
    out.push({ date: d, visits: 100, cost: 100, conversions: 2, revenue: 1000 });
  }
  for (let dm = 1; dm <= lastDay; dm++) {
    const iso = `2026-05-${String(dm).padStart(2, "0")}`;
    if (gaps.has(iso)) continue;
    out.push({ date: iso, visits: 100, cost: 100, conversions: 2, revenue: 1000 });
  }
  return out;
}

test("gappy month: the days shown are the days the required pace divides by, and the gap is named", () => {
  const gaps = new Set(["2026-05-06", "2026-05-07", "2026-05-13", "2026-05-14", "2026-05-20"]);
  const p = monthlyPacing(gappyMay(gaps, 25), 40_000);
  assert.ok(p);
  assert.equal(p.futureDays, 6);
  assert.equal(p.missingDays, 5);
  const shown = daysAheadDisplay(p);
  assert.deepEqual(shown, { remaining: 6, missing: 5 });
  // A reader dividing the gap by the days shown gets the tile's number.
  approx((p.goal - p.mtd) / shown.remaining, p.requiredDailyRevenue, 1e-9);
});

test("gappy month whose data reaches the last day: no days ahead, gap still named", () => {
  const gaps = new Set(["2026-05-06", "2026-05-07"]);
  const p = monthlyPacing(gappyMay(gaps, 31), 40_000);
  assert.ok(p);
  assert.equal(p.complete, false, "two May days are missing, so the month is not complete");
  assert.equal(p.requiredDailyRevenue, 0);
  assert.deepEqual(daysAheadDisplay(p), { remaining: 0, missing: 2 });
});

test("gapless and complete months: the display is unchanged", () => {
  const live = monthlyPacing(days("2026-03-20", 56, { visits: 100, cost: 100, conversions: 2, revenue: 1000 }), 40_000);
  assert.ok(live);
  assert.equal(live.missingDays, 0);
  assert.deepEqual(daysAheadDisplay(live), { remaining: live.daysRemaining, missing: 0 });

  const closed = monthlyPacing(days("2026-03-01", 61, { visits: 100, cost: 100, conversions: 2, revenue: 1000 }), 40_000);
  assert.ok(closed);
  assert.equal(closed.complete, true);
  assert.deepEqual(daysAheadDisplay(closed), { remaining: 0, missing: 0 });
});
