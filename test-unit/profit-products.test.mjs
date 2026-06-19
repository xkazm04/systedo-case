/** Unit tests for the product/category profit rollup (#2). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProductProfit, lowestPoasCategory } from "@/lib/profit/products";

const cat = (category, revenueShare, cogsPct) => ({ category, color: "#000", revenueShare, cogsPct });

test("computeProductProfit splits revenue and cost by share and derives margin from COGS", () => {
  const products = [
    cat("Hi", 0.75, 0.4), // margin 0.6
    cat("Lo", 0.25, 0.9), // margin 0.1
  ];
  const { rows, summary } = computeProductProfit(products, { revenue: 4000, cost: 1000 });

  const hi = rows.find((r) => r.category === "Hi");
  const lo = rows.find((r) => r.category === "Lo");

  // Revenue split by share.
  assert.equal(hi.revenue, 3000);
  assert.equal(lo.revenue, 1000);
  // Ad cost allocated by the same share.
  assert.equal(hi.cost, 750);
  assert.equal(lo.cost, 250);
  // Margin = 1 − cogs (float-tolerant: 1 − 0.9 ≠ exactly 0.1).
  assert.ok(Math.abs(hi.marginPct - 0.6) < 1e-9);
  assert.ok(Math.abs(lo.marginPct - 0.1) < 1e-9);
  // Gross / net profit.
  assert.equal(hi.grossProfit, 1800); // 3000 × 0.6
  assert.equal(hi.netProfit, 1050); // 1800 − 750
  assert.ok(Math.abs(lo.grossProfit - 100) < 1e-9); // 1000 × 0.1
  assert.ok(Math.abs(lo.netProfit - -150) < 1e-9); // 100 − 250 → loses money

  // Lo is unprofitable (POAS < break-even).
  assert.equal(lo.profitable, false);
  assert.equal(summary.unprofitableCount, 1);
  // Portfolio totals reconcile.
  assert.equal(summary.revenue, 4000);
  assert.equal(summary.cost, 1000);
  assert.ok(Math.abs(summary.netProfit - 900) < 1e-9); // 1050 + (−150)
});

test("revenue shares are re-normalised when they do not sum to 1", () => {
  // Shares sum to 0.5; after normalisation each is doubled.
  const products = [cat("A", 0.25, 0.5), cat("B", 0.25, 0.5)];
  const { rows } = computeProductProfit(products, { revenue: 1000, cost: 200 });
  const total = rows.reduce((a, r) => a + r.revenue, 0);
  assert.equal(total, 1000);
  for (const r of rows) assert.equal(r.revenue, 500);
});

test("lowestPoasCategory surfaces the worst category", () => {
  const products = [
    cat("Good", 0.5, 0.3), // margin 0.7 → high POAS
    cat("Bad", 0.5, 0.95), // margin 0.05 → lowest POAS
  ];
  const { rows } = computeProductProfit(products, { revenue: 2000, cost: 500 });
  const worst = lowestPoasCategory(rows);
  assert.equal(worst.category, "Bad");
  assert.equal(lowestPoasCategory([]), null);
});

test("empty product set yields a zero summary", () => {
  const { rows, summary } = computeProductProfit([], { revenue: 1000, cost: 100 });
  assert.deepEqual(rows, []);
  assert.equal(summary.netProfit, 0);
  assert.equal(summary.unprofitableCount, 0);
});
