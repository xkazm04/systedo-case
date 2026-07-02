/** Unit tests for the pure budget-mutation math (src/lib/campaigns/budget-math.ts)
 *  that drives real Google Ads budget moves via applyBudgetShift / restoreBudgets.
 *  The floor + conservation invariants here are what keep an apply from moving the
 *  wrong amount of real money. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_DAILY_MICROS,
  computeDailyMicros,
  planBudgetMove,
  dedupeSnapshots,
} from "@/lib/campaigns/budget-math";

test("computeDailyMicros converts a period-total CZK amount to rounded daily micros", () => {
  assert.equal(computeDailyMicros(3000, 30), 100_000_000); // 100 CZK/day
  assert.equal(computeDailyMicros(0, 30), 0);
  // 1000 / 7 days = 142.857… CZK/day → rounded micros.
  assert.equal(computeDailyMicros(1000, 7), 142_857_143);
  // Rounds (not truncates): 1 / 3 = 0.3333 CZK → 333_333 micros.
  assert.equal(computeDailyMicros(1, 3), 333_333);
});

test("planBudgetMove moves the full delta when the donor stays above the floor", () => {
  const plan = planBudgetMove({ dailyMicros: 50_000_000, fromMicros: 100_000_000, toMicros: 20_000_000 });
  assert.deepEqual(plan, { fromNew: 50_000_000, toNew: 70_000_000, movedMicros: 50_000_000 });
});

test("planBudgetMove moves only what the donor actually gives up once it floors", () => {
  // Asking to move 95 CZK/day from a 100 CZK/day donor would breach the 10 CZK
  // floor, so the donor stops at the floor and only 90 CZK/day actually moves —
  // the recipient must gain exactly that 90, never the requested 95.
  const plan = planBudgetMove({ dailyMicros: 95_000_000, fromMicros: 100_000_000, toMicros: 20_000_000 });
  assert.equal(plan.error, undefined);
  assert.equal(plan.fromNew, MIN_DAILY_MICROS); // 10 CZK/day floor
  assert.equal(plan.movedMicros, 90_000_000);
  assert.equal(plan.toNew, 110_000_000); // 20 + 90
});

test("planBudgetMove conserves total budget (donor loss == recipient gain)", () => {
  for (const daily of [1_000_000, 30_000_000, 89_999_999]) {
    const fromMicros = 100_000_000;
    const toMicros = 40_000_000;
    const plan = planBudgetMove({ dailyMicros: daily, fromMicros, toMicros });
    assert.equal(plan.error, undefined);
    assert.equal(plan.fromNew + plan.toNew, fromMicros + toMicros, `conserved at daily=${daily}`);
    assert.equal(plan.movedMicros, fromMicros - plan.fromNew);
  }
});

test("planBudgetMove refuses to move from a donor already at or below the floor", () => {
  assert.deepEqual(planBudgetMove({ dailyMicros: 5_000_000, fromMicros: MIN_DAILY_MICROS, toMicros: 0 }), {
    error: "at_min",
  });
  // A donor already below the floor can't give anything up either.
  assert.deepEqual(planBudgetMove({ dailyMicros: 1_000_000, fromMicros: 5_000_000, toMicros: 0 }), {
    error: "at_min",
  });
});

test("planBudgetMove honours a custom floor override", () => {
  const plan = planBudgetMove({
    dailyMicros: 80_000_000,
    fromMicros: 100_000_000,
    toMicros: 0,
    minDailyMicros: 30_000_000,
  });
  assert.equal(plan.fromNew, 30_000_000);
  assert.equal(plan.movedMicros, 70_000_000);
});

test("dedupeSnapshots keeps the first (prior-most) value per budget", () => {
  const map = dedupeSnapshots([
    { budgetResourceName: "budgets/A", prevMicros: 100 },
    { budgetResourceName: "budgets/B", prevMicros: 200 },
    { budgetResourceName: "budgets/A", prevMicros: 999 }, // later A ignored
  ]);
  assert.equal(map.size, 2);
  assert.equal(map.get("budgets/A"), 100);
  assert.equal(map.get("budgets/B"), 200);
});

test("dedupeSnapshots returns an empty map for no snapshots", () => {
  assert.equal(dedupeSnapshots([]).size, 0);
});
