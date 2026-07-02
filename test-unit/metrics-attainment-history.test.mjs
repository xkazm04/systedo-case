/** Unit tests for the month-by-month goal attainment track record (#3).
 *  Runs the TS source directly via the shared resolve hook
 *  (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyAttainmentHistory } from "@/lib/metrics/pacing";

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

test("groups complete months and marks hits and misses against the goal", () => {
  const daily = [
    ...days("2026-03-01", 31, 1000), // March: 31 000
    ...days("2026-04-01", 30, 900), //  April: 27 000
    ...days("2026-05-01", 31, 1100), // May:   34 100
  ];
  const history = monthlyAttainmentHistory(daily, 30_000);

  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((h) => h.month),
    ["2026-03-01", "2026-04-01", "2026-05-01"]
  );
  assert.deepEqual(
    history.map((h) => h.hit),
    [true, false, true]
  );
  assert.equal(history[0].revenue, 31_000);
  assert.ok(Math.abs(history[1].attainment - 0.9) < 1e-9);
});

test("excludes partial leading and in-progress trailing months", () => {
  const daily = [
    ...days("2026-03-15", 17, 1000), // partial March (15.–31.)
    ...days("2026-04-01", 30, 1000), // complete April
    ...days("2026-05-01", 10, 1000), // in-progress May
  ];
  const history = monthlyAttainmentHistory(daily, 30_000);

  assert.equal(history.length, 1);
  assert.equal(history[0].month, "2026-04-01");
  assert.equal(history[0].hit, true);
});

test("caps the track record at the n most recent complete months", () => {
  // Jan–Aug 2025 (8 complete months; Feb 2025 has 28 days).
  const daily = days("2025-01-01", 243, 1000);
  assert.equal(daily[daily.length - 1].date, "2025-08-31");
  const history = monthlyAttainmentHistory(daily, 30_000, 6);

  assert.equal(history.length, 6);
  assert.equal(history[0].month, "2025-03-01");
  assert.equal(history[5].month, "2025-08-01");
});

test("empty series and a zero goal degrade gracefully", () => {
  assert.deepEqual(monthlyAttainmentHistory([], 30_000), []);
  const daily = days("2026-04-01", 30, 1000);
  const history = monthlyAttainmentHistory(daily, 0);
  assert.equal(history.length, 1);
  assert.equal(history[0].attainment, 0);
  assert.equal(history[0].hit, true); // 30 000 ≥ 0
});
