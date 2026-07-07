/** Monthly report compute (src/lib/report/compute.ts): delta tone + tile specs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deltaTone, REPORT_TILES, reportTilesForType } from "@/lib/report/compute";

test("deltaTone: up is good for revenue-like metrics", () => {
  assert.equal(deltaTone(0.12, false), "positive");
  assert.equal(deltaTone(-0.12, false), "negative");
});

test("deltaTone: down is good for cost/PNO-like metrics", () => {
  assert.equal(deltaTone(-0.12, true), "positive");
  assert.equal(deltaTone(0.12, true), "negative");
});

test("deltaTone: negligible delta is neutral", () => {
  assert.equal(deltaTone(0, false), "neutral");
  assert.equal(deltaTone(0.00001, true), "neutral");
});

test("REPORT_TILES covers the six recap metrics; only cost & PNO are goodWhenDown", () => {
  assert.deepEqual(REPORT_TILES.map((t) => t.metric), ["revenue", "roas", "pno", "conversions", "cost", "visits"]);
  assert.deepEqual(REPORT_TILES.filter((t) => t.goodWhenDown).map((t) => t.metric), ["pno", "cost"]);
  assert.equal(REPORT_TILES.find((t) => t.metric === "roas").hasDelta, false);
});

test("report tiles are per-type: leadgen/local lead with leads/CPL, never e-shop Obrat/ROAS", () => {
  for (const type of ["leadgen", "local"]) {
    const metrics = reportTilesForType(type).map((t) => t.metric);
    assert.ok(metrics.includes("conversions") && metrics.includes("cpa"), `${type} should surface leads + CPA`);
    assert.ok(!metrics.includes("revenue") && !metrics.includes("roas") && !metrics.includes("pno"), `${type} must not show e-shop metrics`);
  }
  // CPA reads better when it falls, like cost/PNO.
  const cpaTile = reportTilesForType("leadgen").find((t) => t.metric === "cpa");
  assert.equal(cpaTile.goodWhenDown, true);
  // eshop is unchanged (back-compat with REPORT_TILES).
  assert.deepEqual(reportTilesForType("eshop"), REPORT_TILES);
});
