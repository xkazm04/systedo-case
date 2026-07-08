/** Recap grounding deepeners: profit (A3 cost model) + longer-horizon history.
 *  Both are pure over a PerformanceData + cost model; guarded so they stay silent
 *  when there's nothing real to say. Uses a real demo dataset (valid channels/goals)
 *  and controls only the daily length for the history guard. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url);

const { profitGroundingText, historyGroundingText } = await import("@/lib/report/recap-context");
const { getProjectDataset } = await import("@/lib/project-data/dataset");
const { DEMO_PROJECTS } = await import("@/lib/demo/projects");

const base = getProjectDataset(DEMO_PROJECTS.find((p) => p.type === "eshop"));
const withDays = (n) => ({
  ...base,
  daily: Array.from({ length: n }, (_, i) => base.daily[i % base.daily.length]),
});

const model = { grossMarginPct: 0.4, monthlyOverhead: 30_000, perOrderCost: 50, updatedAt: "x" };

test("profit: '' without data or without a cost model", () => {
  assert.equal(profitGroundingText(undefined, model, "cs"), "");
  assert.equal(profitGroundingText(base, null, "cs"), "");
});

test("profit: names true net profit + margin-aware POAS (cs/en)", () => {
  const cs = profitGroundingText(base, model, "cs");
  assert.match(cs, /Skutečný čistý zisk po nákladech/);
  assert.match(cs, /POAS/);
  assert.match(cs, /ne jen podle obratu\/ROAS/);
  const en = profitGroundingText(base, model, "en");
  assert.match(en, /True net profit after costs/);
  assert.match(en, /not just revenue\/ROAS/);
});

test("history: silent below ~a year of data, present above it", () => {
  assert.equal(historyGroundingText(withDays(90), "cs"), ""); // < 300 days → no year claim
  const cs = historyGroundingText(withDays(365), "cs");
  assert.match(cs, /Delší horizont \(12 měsíců\)/);
  assert.match(cs, /meziročně/);
  const en = historyGroundingText(withDays(365), "en");
  assert.match(en, /Longer horizon \(12 months\)/);
});
