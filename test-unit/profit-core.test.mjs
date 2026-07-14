/** The shared profit-math primitives (src/lib/profit/core.ts) that BOTH the
 *  cost-model report engine and the per-channel /zisk engine call. These fixtures
 *  pin the exact numbers so a refactor of either engine onto the core can't change
 *  a single output; the engine tests (cost-model, profit, profit-overhead,
 *  profit-trend) then prove the engines still match through the core. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url);

const {
  grossProfit,
  overheadForPeriod,
  monthsForDays,
  fulfilment,
  netProfit,
  breakEvenRoas,
  loadedBreakEvenRoas,
} = await import("@/lib/profit/core");

test("grossProfit = revenue × margin", () => {
  assert.equal(grossProfit(1_000_000, 0.4), 400_000);
  assert.equal(grossProfit(0, 0.4), 0);
});

test("overheadForPeriod = monthlyOverhead × months; negatives collapse to 0", () => {
  assert.equal(overheadForPeriod(50_000, 1), 50_000);
  assert.equal(overheadForPeriod(10_000, 3), 30_000);
  assert.equal(overheadForPeriod(-5, 3), 0);
  assert.equal(overheadForPeriod(5, -3), 0);
  assert.equal(overheadForPeriod(5, 0), 0);
});

test("monthsForDays = days / 30 (fractional, no rounding)", () => {
  assert.equal(monthsForDays(30), 1);
  assert.equal(monthsForDays(90), 3);
  assert.equal(monthsForDays(365), 365 / 30);
});

test("fulfilment = perOrderCost × orders; negative cost collapses to 0", () => {
  assert.equal(fulfilment(60, 500), 30_000);
  assert.equal(fulfilment(-1, 500), 0);
  assert.equal(fulfilment(60, 0), 0);
});

test("netProfit = gross − adCost − overhead − fulfilment; overhead/fulfilment default 0", () => {
  assert.equal(netProfit(400_000, 200_000, 50_000, 30_000), 120_000);
  assert.equal(netProfit(400_000, 200_000), 200_000); // per-channel: no overhead/fulfilment
});

test("breakEvenRoas = 1 / margin; Infinity at non-positive margin", () => {
  assert.equal(breakEvenRoas(0.5), 2);
  assert.equal(breakEvenRoas(0.42), 1 / 0.42);
  assert.equal(breakEvenRoas(0), Infinity);
  assert.equal(breakEvenRoas(-0.1), Infinity);
});

test("loadedBreakEvenRoas = (adCost+overhead+fulfil)/(adCost×margin); Infinity guards", () => {
  // cost 100k, overhead 20k, fulfil 10k, margin 0.5 → 130k/(100k×0.5) = 2.6
  assert.equal(loadedBreakEvenRoas(0.5, 100_000, 20_000, 10_000), 2.6);
  // no overhead/fulfilment → collapses to the gross break-even 1/margin
  assert.equal(loadedBreakEvenRoas(0.5, 100_000, 0, 0), 2);
  assert.equal(loadedBreakEvenRoas(0, 100_000, 20_000, 10_000), Infinity);
  assert.equal(loadedBreakEvenRoas(0.5, 0, 20_000, 10_000), Infinity);
});
