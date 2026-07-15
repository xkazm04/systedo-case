/** Direction 2: the monthly revenue goal's memory. Proves the pure timeline logic
 *  (recordGoalChange idempotency, goalForMonth resolution, sanitize) and that
 *  monthlyAttainmentHistory scores each month against the goal in force that month
 *  — with the documented fallback to the constant goal for months before any change
 *  and when no history is supplied. Runs the TS source via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recordGoalChange,
  goalForMonth,
  sanitizeGoalHistory,
  monthlyAttainmentHistory,
} from "@/lib/metrics";

/** Build `n` consecutive days starting at `start` with a fixed daily revenue. */
function days(start, n, revenue) {
  const out = [];
  const base = new Date(`${start}T00:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    const d = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    out.push({ date: d, visits: 100, cost: 100, conversions: 2, revenue });
  }
  return out;
}

// --- pure timeline primitives -----------------------------------------------

test("goalForMonth: months before the first change fall back; later months resolve", () => {
  const h = [
    { effectiveMonth: "2026-04", goal: 40_000 },
    { effectiveMonth: "2026-07", goal: 55_000 },
  ];
  assert.equal(goalForMonth(h, "2026-01", 30_000), 30_000); // before first change → fallback
  assert.equal(goalForMonth(h, "2026-04", 30_000), 40_000); // at the change
  assert.equal(goalForMonth(h, "2026-06", 30_000), 40_000); // between changes
  assert.equal(goalForMonth(h, "2026-09", 30_000), 55_000); // after the last change
  assert.equal(goalForMonth([], "2026-05", 30_000), 30_000); // no history → fallback
});

test("recordGoalChange appends a genuine change and keeps the list sorted", () => {
  let h = [];
  h = recordGoalChange(h, "2026-04", 40_000);
  h = recordGoalChange(h, "2026-07", 55_000);
  h = recordGoalChange(h, "2026-01", 30_000); // out of order → sorts in
  assert.deepEqual(h.map((e) => e.effectiveMonth), ["2026-01", "2026-04", "2026-07"]);
  assert.deepEqual(h.map((e) => e.goal), [30_000, 40_000, 55_000]);
});

test("recordGoalChange is idempotent for a same-value save (no log growth)", () => {
  let h = recordGoalChange([], "2026-04", 40_000);
  const again = recordGoalChange(h, "2026-05", 40_000); // 40k already in force → no-op
  assert.equal(again.length, 1);
  const same = recordGoalChange(h, "2026-04", 40_000); // exact same month+value → no-op
  assert.equal(same.length, 1);
});

test("recordGoalChange corrects a within-month entry in place", () => {
  let h = recordGoalChange([], "2026-04", 40_000);
  h = recordGoalChange(h, "2026-04", 42_000); // same month, new value → replace
  assert.equal(h.length, 1);
  assert.equal(h[0].goal, 42_000);
});

test("sanitizeGoalHistory drops malformed entries and dedups last-per-month", () => {
  const h = sanitizeGoalHistory([
    { effectiveMonth: "2026-13", goal: 10 }, // invalid month
    { effectiveMonth: "2026-04", goal: -5 }, // non-positive goal
    { effectiveMonth: "2026-05", goal: 40_000 },
    { effectiveMonth: "2026-05", goal: 41_000 }, // later dup wins
    { nope: true },
  ]);
  assert.deepEqual(h, [{ effectiveMonth: "2026-05", goal: 41_000 }]);
});

// --- attainment scored against the goal in force ----------------------------

test("attainment scores each month against the goal in force that month", () => {
  const daily = [
    ...days("2026-03-01", 31, 1000), // March: 31 000
    ...days("2026-04-01", 30, 1200), // April: 36 000
    ...days("2026-05-01", 31, 1200), // May:   37 200
  ];
  // Goal raised to 40 000 effective May. March/April keep the 35 000 constant.
  const history = [{ effectiveMonth: "2026-05", goal: 40_000 }];
  const out = monthlyAttainmentHistory(daily, 35_000, 6, history);

  assert.deepEqual(out.map((h) => h.goal), [35_000, 35_000, 40_000]);
  assert.deepEqual(out.map((h) => h.hit), [false, true, false]); // 31k<35k, 36k≥35k, 37.2k<40k
  assert.ok(Math.abs(out[2].attainment - 37_200 / 40_000) < 1e-9);
});

test("no history reproduces the pre-memory behaviour (constant goal for every month)", () => {
  const daily = [
    ...days("2026-03-01", 31, 1000),
    ...days("2026-04-01", 30, 900),
  ];
  const withoutArg = monthlyAttainmentHistory(daily, 30_000);
  const withEmpty = monthlyAttainmentHistory(daily, 30_000, 6, []);
  assert.deepEqual(withoutArg.map((h) => h.hit), [true, false]);
  assert.deepEqual(withEmpty.map((h) => h.hit), [true, false]);
  assert.deepEqual(withoutArg.map((h) => h.goal), [30_000, 30_000]);
});

test("multiple changes across the track record each apply from their month", () => {
  const daily = [
    ...days("2026-01-01", 31, 1000), // Jan 31 000
    ...days("2026-02-01", 28, 1000), // Feb 28 000
    ...days("2026-03-01", 31, 1000), // Mar 31 000
  ];
  const history = [
    { effectiveMonth: "2026-02", goal: 25_000 },
    { effectiveMonth: "2026-03", goal: 32_000 },
  ];
  const out = monthlyAttainmentHistory(daily, 30_000, 6, history);
  assert.deepEqual(out.map((h) => h.goal), [30_000, 25_000, 32_000]);
  assert.deepEqual(out.map((h) => h.hit), [true, true, false]); // 31≥30, 28≥25, 31<32
});
