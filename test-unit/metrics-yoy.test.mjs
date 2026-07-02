/** Unit tests for the year-over-year comparison baseline in evaluatePeriod (#1).
 *  Runs the TS source directly via the shared resolve hook
 *  (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePeriod } from "@/lib/metrics/series";

/** Build `n` consecutive days starting at `start`; `value(i)` sets every metric's
 *  scale for day i so windows are easy to tell apart by their totals. */
function days(start, n, value) {
  const out = [];
  const base = new Date(`${start}T00:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    const d = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    const v = value(i);
    out.push({ date: d, visits: v, cost: v, conversions: v, revenue: v });
  }
  return out;
}

const sumRange = (from, to) => ((to - 1 + from) * (to - from)) / 2; // Σ i for i in [from, to)

test("yoy compares against the same window shifted back exactly 365 days", () => {
  // Two full years; revenue(i) = i makes each window's total unique.
  const daily = days("2024-06-02", 730, (i) => i);
  const r = evaluatePeriod(daily, 30, "yoy");

  assert.equal(r.baseline, "yoy");
  assert.equal(r.actualDays, 30);
  assert.equal(r.truncated, false);
  // current = days [700, 730), previous = days [335, 365)
  assert.equal(r.current.revenue, sumRange(700, 730));
  assert.equal(r.previous.revenue, sumRange(335, 365));
  // the comparison points really are the year-ago twin, day for day
  assert.equal(r.comparePoints.length, 30);
  const yearAgo = (iso) =>
    new Date(new Date(`${iso}T00:00:00Z`).getTime() - 365 * 86_400_000)
      .toISOString()
      .slice(0, 10);
  assert.equal(r.comparePoints[0].date, yearAgo(r.points[0].date));
  assert.equal(r.comparePoints[29].date, yearAgo(r.points[29].date));
});

test("default baseline stays the adjacent previous window (backward compatible)", () => {
  const daily = days("2024-06-02", 730, (i) => i);
  const implicit = evaluatePeriod(daily, 30);
  const explicit = evaluatePeriod(daily, 30, "previous");

  assert.equal(implicit.baseline, "previous");
  assert.deepEqual(implicit, explicit);
  // previous = the adjacent window [670, 700)
  assert.equal(implicit.previous.revenue, sumRange(670, 700));
});

test("yoy on a series too short for any year-ago day falls back to previous", () => {
  const daily = days("2026-01-01", 200, () => 100);
  const r = evaluatePeriod(daily, 30, "yoy");

  assert.equal(r.baseline, "previous");
  assert.equal(r.actualDays, 30);
  assert.equal(r.truncated, false);
  assert.equal(r.previous.revenue, 30 * 100);
});

test("yoy shortens the window (and flags truncated) when only part fits a year back", () => {
  // 400 days: only 35 days have a year-ago twin, so a 90d request caps at 35.
  const daily = days("2025-01-01", 400, (i) => i);
  const r = evaluatePeriod(daily, 90, "yoy");

  assert.equal(r.baseline, "yoy");
  assert.equal(r.actualDays, 35);
  assert.equal(r.truncated, true);
  assert.equal(r.current.revenue, sumRange(365, 400));
  assert.equal(r.previous.revenue, sumRange(0, 35));
});

test("yoy neutralises a seasonal swing that the adjacent baseline misreads as growth", () => {
  // Yearly seasonality: the last 30 days of each year run at 2× the rest.
  const seasonal = (i) => (i % 365 >= 335 ? 200 : 100);
  const daily = days("2024-06-02", 730, seasonal);

  const adjacent = evaluatePeriod(daily, 30, "previous");
  const yoy = evaluatePeriod(daily, 30, "yoy");

  // Adjacent comparison reads the seasonal spike as a +100 % "improvement"…
  assert.ok(adjacent.delta.revenue > 0.9);
  // …while the like-for-like YoY delta is flat.
  assert.equal(yoy.delta.revenue, 0);
});
