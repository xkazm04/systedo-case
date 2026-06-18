/** Unit tests for the projected-stockout / at-risk math (days-of-cover trend).
 *  Runs the TS source directly via the shared resolve hook
 *  (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AT_RISK_DAYS, projectStockout, stockRows } from "@/lib/inventory/compute";

// Fixed reference date so projected stockout dates are deterministic.
const NOW = new Date("2026-06-01T00:00:00Z");

const product = (overrides) => ({
  sku: "X",
  title: "Test",
  category: "Test",
  price: 100,
  stock: 0,
  dailyVelocity: 1,
  emoji: "📦",
  usps: [],
  ...overrides,
});

test("projectStockout offsets the reference date by whole days-of-cover", () => {
  const { stockoutDays, stockoutAt, atRisk } = projectStockout(10, NOW);
  assert.equal(stockoutDays, 10);
  assert.equal(stockoutAt, "2026-06-11"); // 1 June + 10 days
  assert.equal(atRisk, true); // 7 ≤ 10 < 14
});

test("projectStockout rounds fractional cover and flags at-risk just under the threshold", () => {
  const justUnder = projectStockout(AT_RISK_DAYS - 0.5, NOW); // 13.5
  assert.equal(justUnder.stockoutDays, 14); // rounded for the date offset
  assert.equal(justUnder.atRisk, true); // raw cover 13.5 < 14 → still at-risk
  assert.equal(justUnder.stockoutAt, "2026-06-15"); // 1 June + 14 days

  const atThreshold = projectStockout(AT_RISK_DAYS, NOW); // 14 → not at-risk
  assert.equal(atThreshold.atRisk, false);

  const wellCovered = projectStockout(40, NOW);
  assert.equal(wellCovered.atRisk, false);
});

test("projectStockout treats a hard-pause cover as not at-risk and Infinity as never", () => {
  const pausing = projectStockout(5, NOW); // < 7 → hard pause, not the soft at-risk tier
  assert.equal(pausing.atRisk, false);
  assert.equal(pausing.stockoutAt, "2026-06-06");

  const never = projectStockout(Infinity, NOW);
  assert.equal(never.stockoutDays, Infinity);
  assert.equal(never.stockoutAt, null);
  assert.equal(never.atRisk, false);
});

test("stockRows projects each SKU off the supplied reference date and marks at-risk", () => {
  const rows = stockRows(
    [
      product({ sku: "RISK", stock: 10, dailyVelocity: 1 }), // 10 dní cover → at-risk
      product({ sku: "SAFE", stock: 100, dailyVelocity: 1 }), // 100 dní → ok
      product({ sku: "DEAD", stock: 5, dailyVelocity: 0 }), // no velocity → Infinity
    ],
    NOW
  );
  const risk = rows.find((r) => r.product.sku === "RISK");
  const safe = rows.find((r) => r.product.sku === "SAFE");
  const dead = rows.find((r) => r.product.sku === "DEAD");

  assert.equal(risk.atRisk, true);
  assert.equal(risk.stockoutAt, "2026-06-11");

  assert.equal(safe.atRisk, false);
  assert.equal(safe.stockoutAt, "2026-09-09"); // 1 June + 100 days

  assert.equal(dead.atRisk, false);
  assert.equal(dead.stockoutAt, null);
});
