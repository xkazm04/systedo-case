/** Unit tests for the inventory-aware budget action plan (src/lib/inventory/action-plan.ts):
 *  the join from proposed budget moves back to their stock rows must NOT fabricate donor
 *  context when a move's donor SKU is absent from the stock snapshot (a change-set built
 *  from a different/older stock array) — such moves are dropped, not invented. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildActionPlan } from "@/lib/inventory/action-plan.ts";

const stockRow = (sku, over = {}) => ({
  product: { sku, title: `Title ${sku}`, category: "Ořechy", price: 200, stock: 3, dailyVelocity: 2, emoji: "🥜", usps: [] },
  daysOfCover: 1.5,
  status: "low",
  action: "",
  stockoutDays: 2,
  stockoutAt: "2026-07-20",
  atRisk: true,
  resumeAt: null,
  margin: 0.4,
  coverValue: 240,
  ...over,
});

const move = (fromSku, toSku, over = {}) => ({
  fromSku,
  fromTitle: `Title ${fromSku}`,
  toSku,
  toTitle: `Title ${toSku}`,
  category: "Ořechy",
  amountCzk: 100,
  ...over,
});

test("buildActionPlan: a move whose donor is in stock is enriched from the real row", () => {
  const stock = [stockRow("A", { status: "pause", coverValue: 500, margin: 0.5 }), stockRow("B", { status: "ok" })];
  const plan = buildActionPlan(stock, { moves: [move("A", "B")], totalShifted: 100 });
  assert.equal(plan.actions.length, 1);
  const a = plan.actions[0];
  assert.equal(a.donorStatus, "pause", "real donor status, not a fabricated 'low'");
  assert.equal(a.valueAtRisk, 500);
  assert.equal(a.donorMargin, 0.5);
  assert.equal(a.stockoutAt, "2026-07-20");
});

test("buildActionPlan: a move whose donor is missing from the snapshot is dropped, not invented", () => {
  const stock = [stockRow("B", { status: "ok" })]; // donor "A" absent (snapshot drift)
  const plan = buildActionPlan(stock, { moves: [move("A", "B"), move("GHOST", "B")], totalShifted: 200 });
  assert.equal(plan.actions.length, 0, "both orphaned-donor moves excluded");
  // No fabricated "low"/0 context leaks into the plan.
  assert.ok(!plan.actions.some((x) => x.donorStatus === "low" && x.valueAtRisk === 0));
});

test("buildActionPlan: a missing recipient keeps the move (recipient margin is display-only)", () => {
  const stock = [stockRow("A", { status: "pause" })]; // donor present, recipient "B" absent
  const plan = buildActionPlan(stock, { moves: [move("A", "B")], totalShifted: 100 });
  assert.equal(plan.actions.length, 1, "donor is real, so the move stands");
  assert.equal(plan.actions[0].recipientMargin, 0, "absent recipient → honest 0 display margin");
});
