/** Unit tests for the sustained multi-week trend detector (#3, "slow bleed").
 *  Runs the TS source directly via the shared resolve hook
 *  (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectTrends } from "@/lib/metrics/trends";

/** Build `n` consecutive days starting at `start`; per-metric values come from
 *  `value(i)` (a number applies to revenue only, others stay flat). */
function days(start, n, value) {
  const out = [];
  const base = new Date(`${start}T00:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    const d = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    const v = value(i);
    const point = typeof v === "number" ? { visits: 500, cost: 100, conversions: 5, revenue: v } : v;
    out.push({ date: d, ...point });
  }
  return out;
}

test("detects a four-week revenue slide that no single day would flag", () => {
  // 8 flat weeks at 1000/day, then 4 weeks stepping down ~8 % each — every
  // individual day is unremarkable, but the drift compounds to ≈ −28 %.
  const weekLevel = (i) => {
    const week = Math.floor(i / 7);
    return week < 8 ? 1000 : [920, 846, 778, 716][week - 8];
  };
  const daily = days("2026-01-05", 84, weekLevel);
  const trends = detectTrends(daily);

  const rev = trends.find((t) => t.metric === "revenue");
  assert.ok(rev, "revenue trend detected");
  assert.equal(rev.direction, "down");
  assert.equal(rev.weeks, 4);
  // From the pre-run base (1000) to the latest weekly mean (716).
  assert.ok(Math.abs(rev.cumulativeChange - (716 - 1000) / 1000) < 1e-9);
  // The flat metrics stay quiet.
  assert.equal(trends.some((t) => t.metric === "cost"), false);
  assert.equal(trends.some((t) => t.metric === "visits"), false);
});

test("detects a sustained cost run-up as an upward trend", () => {
  const weekLevel = (i) => {
    const week = Math.floor(i / 7);
    const cost = week < 8 ? 100 : [110, 121, 133, 146][week - 8];
    return { visits: 500, cost, conversions: 5, revenue: 1000 };
  };
  const daily = days("2026-01-05", 84, weekLevel);
  const trends = detectTrends(daily);

  const cost = trends.find((t) => t.metric === "cost");
  assert.ok(cost, "cost trend detected");
  assert.equal(cost.direction, "up");
  assert.equal(cost.weeks, 4);
  assert.ok(cost.cumulativeChange > 0.4);
});

test("a flat series and stable weekday seasonality produce no trends", () => {
  // Flat: identical days.
  assert.deepEqual(detectTrends(days("2026-01-05", 84, () => 1000)), []);
  // Strong but stable weekly shape (weekends −40 %): weekly means are identical,
  // so day-of-week seasonality alone can never read as a drift.
  const seasonal = (i) => {
    const dow = new Date(new Date("2026-01-05T00:00:00Z").getTime() + i * 86_400_000).getUTCDay();
    return dow === 0 || dow === 6 ? 600 : 1000;
  };
  assert.deepEqual(detectTrends(days("2026-01-05", 84, seasonal)), []);
});

test("small alternating noise never strings together a directional run", () => {
  // Deterministic ±2 % zig-zag around a flat level.
  const noisy = (i) => 1000 + (i % 2 === 0 ? 20 : -20);
  assert.deepEqual(detectTrends(days("2026-01-05", 84, noisy)), []);
});

test("too little data (under minRun+1 weeks) yields no trends", () => {
  const declining = (i) => 1000 - i * 10;
  assert.deepEqual(detectTrends(days("2026-05-01", 21, declining)), []);
});

test("a run shorter than minRun stays below the reporting bar", () => {
  // Only 2 declining weekly moves at the end — below the 3-move minimum.
  const weekLevel = (i) => {
    const week = Math.floor(i / 7);
    return week < 10 ? 1000 : [900, 810][week - 10];
  };
  const daily = days("2026-01-05", 84, weekLevel);
  assert.equal(detectTrends(daily).some((t) => t.metric === "revenue"), false);
});
