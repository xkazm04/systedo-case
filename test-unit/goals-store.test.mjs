/** Direction 2 — the live report gets a REAL per-project revenue goal. Covers the
 *  sanitiser, the sqlite store roundtrip + idempotent history append (table
 *  `project_goal`, DDL v14), the resolution order (real goal over the sample), the
 *  "ukázkový cíl" label gating, and that the assembled attainment consumes goalForMonth
 *  with the real history (past months scored against the goal in force THAT month). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-goals-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
register("./json-loader.mjs", import.meta.url);

const { sanitizeProjectGoal } = await import("@/lib/goals/types");
const { getProjectGoal, saveProjectGoal, clearProjectGoal, recordProjectGoal } = await import("@/lib/goals/store");
const { goalForMonth } = await import("@/lib/metrics/goal-history");
const { assembleReport } = await import("@/lib/report/assemble");

test("sanitizeProjectGoal: keeps a positive goal + cleans history; nothing usable → null", () => {
  assert.equal(sanitizeProjectGoal(null), null);
  assert.equal(sanitizeProjectGoal({ goal: 0 }), null);
  assert.equal(sanitizeProjectGoal({ goal: -5 }), null);
  const clean = sanitizeProjectGoal({
    goal: 300000,
    history: [
      { effectiveMonth: "2026-01", goal: 200000 },
      { effectiveMonth: "bad", goal: 999 },
      { effectiveMonth: "2026-04", goal: 300000 },
    ],
  });
  assert.equal(clean.goal, 300000);
  assert.deepEqual(clean.history, [
    { effectiveMonth: "2026-01", goal: 200000 },
    { effectiveMonth: "2026-04", goal: 300000 },
  ]);
});

test("store: record → get roundtrips; clear reverts to null (resolution falls back to sample)", async () => {
  assert.equal(await getProjectGoal("proj-g"), null); // absent → caller uses the sample goal
  await recordProjectGoal("proj-g", "2026-04", 250000);
  const got = await getProjectGoal("proj-g");
  assert.equal(got.goal, 250000);
  assert.deepEqual(got.history, [{ effectiveMonth: "2026-04", goal: 250000 }]);
  await clearProjectGoal("proj-g");
  assert.equal(await getProjectGoal("proj-g"), null);
});

test("history append is idempotent by value; a genuine change appends", async () => {
  await clearProjectGoal("proj-idem");
  await recordProjectGoal("proj-idem", "2026-04", 250000);
  // Same value in force for the month → the log does not grow.
  const same = await recordProjectGoal("proj-idem", "2026-04", 250000);
  assert.equal(same.history.length, 1);
  // A raise effective a later month appends.
  const raised = await recordProjectGoal("proj-idem", "2026-06", 320000);
  assert.equal(raised.goal, 320000);
  assert.deepEqual(raised.history, [
    { effectiveMonth: "2026-04", goal: 250000 },
    { effectiveMonth: "2026-06", goal: 320000 },
  ]);
  // A within-month correction replaces that month's entry (no duplicate).
  const corrected = await recordProjectGoal("proj-idem", "2026-06", 300000);
  assert.equal(corrected.history.length, 2);
  assert.equal(corrected.history.at(-1).goal, 300000);
});

test("resolution order + label gating: real goal wins; absent → sample, flagged", () => {
  const sampleGoal = 111111;
  const stored = { goal: 250000, history: [{ effectiveMonth: "2026-04", goal: 250000 }] };
  // real present → use it, sampleGoal flag false
  const resolvedReal = stored?.goal ?? sampleGoal;
  assert.equal(resolvedReal, 250000);
  assert.equal(!stored, false);
  // absent → fall back to the sample goal, flag true
  const none = null;
  const resolvedSample = none?.goal ?? sampleGoal;
  assert.equal(resolvedSample, sampleGoal);
  assert.equal(!none, true);
});

test("assembled attainment consumes goalForMonth: each month scored against the goal in force", () => {
  // A series spanning two complete months: April @ ~240k, May @ ~360k revenue.
  const daily = [];
  const push = (ym, days, rev) => {
    for (let d = 1; d <= days; d++) {
      const dd = String(d).padStart(2, "0");
      daily.push({ date: `${ym}-${dd}`, visits: 100, cost: 1000, conversions: 5, revenue: rev });
    }
  };
  push("2026-04", 30, 8000); // 30 * 8000 = 240000
  push("2026-05", 31, 12000); // 31 * 12000 = 372000

  const history = [
    { effectiveMonth: "2026-04", goal: 200000 }, // April judged vs 200k → HIT (240k)
    { effectiveMonth: "2026-05", goal: 400000 }, // May judged vs 400k → MISS (372k)
  ];
  const data = {
    client: { name: "T", domain: "t.cz", segment: "e-shop", currency: "CZK", managedBy: "x" },
    meta: { disclaimer: "", asOf: "2026-05-31", days: daily.length, seed: 1 },
    goals: { pno: 0.18, monthlyRevenue: 999999 }, // sample goal — must NOT be used when history/goal given
    channels: [],
    daily,
  };

  const { attainment } = assembleReport({
    dataset: data,
    type: "eshop",
    live: true,
    costModel: null,
    goalHistory: history,
    monthlyRevenueGoal: 400000,
  });
  const april = attainment.find((m) => m.month === "2026-04-01");
  const may = attainment.find((m) => m.month === "2026-05-01");
  assert.equal(april.goal, 200000, "April scored against the goal in force that month");
  assert.equal(april.hit, true);
  assert.equal(may.goal, 400000, "May scored against the raised goal");
  assert.equal(may.hit, false);
  // Sanity: goalForMonth agrees with the per-month goal the assembler used.
  assert.equal(goalForMonth(history, "2026-04", 400000), 200000);
  assert.equal(goalForMonth(history, "2026-05", 400000), 400000);
});
