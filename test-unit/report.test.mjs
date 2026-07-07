/** Monthly report compute (src/lib/report/compute.ts): delta tone + tile specs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deltaTone, REPORT_TILES } from "@/lib/report/compute";

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
