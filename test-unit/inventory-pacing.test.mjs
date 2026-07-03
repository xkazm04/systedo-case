/** Unit tests for the new Sklad & sezónnost pacing helpers: seasonal budget
 *  plan (#3), margin-weighted coverValue (#5), restock-aware resuming status (#2),
 *  and the per-SKU budget change-set (#1). Runs the TS source directly via the
 *  shared resolve hook (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  budgetChangeSet,
  marginOf,
  RESTOCK_HORIZON_DAYS,
  seasonalBudgetPlan,
  stockRows,
} from "@/lib/inventory/compute";

// Fixed reference date so projected / restock dates are deterministic.
const NOW = new Date("2026-06-01T00:00:00Z");

const product = (overrides) => ({
  sku: "X",
  title: "Test",
  category: "Test",
  price: 1000,
  stock: 0,
  dailyVelocity: 1,
  emoji: "📦",
  usps: [],
  ...overrides,
});

// A flat seasonality (all 1.0) plus one peak month, for predictable plan totals.
const flatSeason = (peakMonth = -1, peakIndex = 2) =>
  Array.from({ length: 12 }, (_, m) => ({
    month: m,
    label: ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"][m],
    index: m === peakMonth ? peakIndex : 1,
  }));

// ---------------------------------------------------------------------------
// #3 seasonalBudgetPlan
// ---------------------------------------------------------------------------

test("seasonalBudgetPlan scales each month by its index and sums correctly", () => {
  const plan = seasonalBudgetPlan(100, flatSeason()); // all index 1
  assert.equal(plan.flatBudget, 100);
  assert.equal(plan.rows.length, 12);
  // Every month = 100 × 1 = 100; total = 1200 = totalFlat.
  assert.equal(plan.totalPlanned, 1200);
  assert.equal(plan.totalFlat, 1200);
  for (const r of plan.rows) assert.equal(r.plannedBudget, 100);
});

test("seasonalBudgetPlan highlights the peak month and shows delta vs flat", () => {
  const plan = seasonalBudgetPlan(100, flatSeason(5, 2)); // June index 2
  const june = plan.rows[5];
  assert.equal(june.isPeak, true);
  assert.equal(june.plannedBudget, 200); // 100 × 2
  assert.equal(june.deltaVsFlat, 100); // 200 − 100
  // Only one peak.
  assert.equal(plan.rows.filter((r) => r.isPeak).length, 1);
  // A typical month has zero delta.
  assert.equal(plan.rows[0].deltaVsFlat, 0);
});

test("seasonalBudgetPlan caps upcoming months once cover runs out", () => {
  // currentMonth = Jan (0); peak in Dec (11) is 11 months ahead. Cover ~60 days =
  // sustains 2 upcoming months, so a high-index month far ahead is capped to flat.
  const plan = seasonalBudgetPlan(100, flatSeason(11, 3), { daysOfCover: 60, currentMonth: 0 });
  const dec = plan.rows[11];
  assert.equal(dec.capped, true);
  assert.equal(dec.plannedBudget, 100); // capped down from 300 to the flat budget
  // A near-term month within cover keeps its raw seasonal figure.
  const feb = plan.rows[1]; // 1 month ahead, within 2-month sustain
  assert.equal(feb.capped, false);
});

test("seasonalBudgetPlan applies no cap when cover is infinite", () => {
  const plan = seasonalBudgetPlan(100, flatSeason(6, 4), { daysOfCover: Infinity, currentMonth: 0 });
  assert.equal(plan.rows.every((r) => r.capped === false), true);
  assert.equal(plan.rows[6].plannedBudget, 400);
});

// ---------------------------------------------------------------------------
// #5 margin-weighted coverValue
// ---------------------------------------------------------------------------

test("marginOf prefers an explicit margin, then category, then default", () => {
  assert.equal(marginOf(product({ margin: 0.6 })), 0.6);
  assert.equal(marginOf(product({ category: "Semínka" })), 0.38); // category table (live catalog taxonomy)
  assert.equal(marginOf(product({ category: "Neznámá" })), 0.3); // default
});

test("coverValue = daysOfCover × margin × dailyVelocity and orders the table", () => {
  const rows = stockRows(
    [
      product({ sku: "HI", stock: 100, dailyVelocity: 1, margin: 0.5 }), // 100 cover
      product({ sku: "LO", stock: 50, dailyVelocity: 1, margin: 0.2 }), // 50 cover
    ],
    NOW
  );
  const hi = rows.find((r) => r.product.sku === "HI");
  const lo = rows.find((r) => r.product.sku === "LO");
  // 100 × 0.5 × 1 = 50; 50 × 0.2 × 1 = 10.
  assert.equal(hi.coverValue, 50);
  assert.equal(lo.coverValue, 10);
  assert.ok(hi.coverValue > lo.coverValue);
});

test("coverValue is zero when velocity is zero (cover is Infinity)", () => {
  const [row] = stockRows([product({ stock: 5, dailyVelocity: 0 })], NOW);
  assert.equal(Number.isFinite(row.daysOfCover), false);
  assert.equal(row.coverValue, 0);
});

// ---------------------------------------------------------------------------
// #2 restock-aware resuming status
// ---------------------------------------------------------------------------

test("a paused SKU with a restock inside the horizon becomes resuming", () => {
  const restockDate = "2026-06-20"; // 19 days out, within the horizon
  const [row] = stockRows(
    [product({ sku: "R", stock: 3, dailyVelocity: 1, restockDate, incomingQty: 40 })],
    NOW
  );
  assert.equal(row.status, "resuming");
  assert.equal(row.resumeAt, restockDate);
  assert.ok(row.action.includes(restockDate));
});

test("a paused SKU stays paused when restock is missing, has no incoming qty, or is beyond the horizon", () => {
  const noRestock = stockRows([product({ stock: 3, dailyVelocity: 1 })], NOW)[0];
  assert.equal(noRestock.status, "pause");
  assert.equal(noRestock.resumeAt, null);

  const noQty = stockRows(
    [product({ stock: 3, dailyVelocity: 1, restockDate: "2026-06-20" })],
    NOW
  )[0];
  assert.equal(noQty.status, "pause"); // incomingQty missing

  // Beyond the horizon → stays a hard pause.
  const far = new Date(NOW.getTime() + (RESTOCK_HORIZON_DAYS + 10) * 86_400_000);
  const farDate = far.toISOString().slice(0, 10);
  const tooFar = stockRows(
    [product({ stock: 3, dailyVelocity: 1, restockDate: farDate, incomingQty: 40 })],
    NOW
  )[0];
  assert.equal(tooFar.status, "pause");
});

test("an ok SKU with a restock date is not flipped to resuming", () => {
  const [row] = stockRows(
    [product({ stock: 100, dailyVelocity: 1, restockDate: "2026-06-20", incomingQty: 40 })],
    NOW
  );
  assert.equal(row.status, "ok");
  assert.equal(row.resumeAt, null);
});

// ---------------------------------------------------------------------------
// #1 budget change-set donor/recipient selection
// ---------------------------------------------------------------------------

test("budgetChangeSet moves spend from constrained donors to the fastest ok SKU in the same category", () => {
  const rows = stockRows(
    [
      product({ sku: "DONOR", category: "C", stock: 3, dailyVelocity: 1, price: 1000 }), // pause
      product({ sku: "SLOW-OK", category: "C", stock: 200, dailyVelocity: 1, price: 1000 }), // ok, slow
      product({ sku: "FAST-OK", category: "C", stock: 400, dailyVelocity: 4, price: 1000 }), // ok, faster
    ],
    NOW
  );
  const { moves, totalShifted } = budgetChangeSet(rows, 0.5);
  assert.equal(moves.length, 1);
  const move = moves[0];
  assert.equal(move.fromSku, "DONOR");
  assert.equal(move.toSku, "FAST-OK"); // highest velocity recipient in category C
  assert.ok(move.amountCzk > 0);
  assert.equal(totalShifted, move.amountCzk);
});

test("budgetChangeSet skips a donor with no ok recipient in its category", () => {
  const rows = stockRows(
    [
      product({ sku: "DONOR", category: "Lonely", stock: 3, dailyVelocity: 1 }), // pause, no ok peer
      product({ sku: "OK-OTHER", category: "Other", stock: 300, dailyVelocity: 2 }), // ok, wrong category
    ],
    NOW
  );
  const { moves } = budgetChangeSet(rows, 0.5);
  assert.equal(moves.length, 0);
});

test("budgetChangeSet shiftFraction scales the proposed amount and clamps to [0,1]", () => {
  const rows = stockRows(
    [
      product({ sku: "DONOR", category: "C", stock: 3, dailyVelocity: 1, price: 1000 }),
      product({ sku: "OK", category: "C", stock: 300, dailyVelocity: 2, price: 1000 }),
    ],
    NOW
  );
  const half = budgetChangeSet(rows, 0.5).moves[0].amountCzk;
  const full = budgetChangeSet(rows, 1).moves[0].amountCzk;
  assert.ok(Math.abs(full - half * 2) <= 1); // rounding tolerance
  // Out-of-range fractions clamp.
  assert.equal(budgetChangeSet(rows, 5).moves[0].amountCzk, full);
  assert.equal(budgetChangeSet(rows, -1).moves.length, 0); // 0 fraction → amount 0 → skipped
});
