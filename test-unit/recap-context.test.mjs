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

test("profit: the window label follows the threaded period (not hardcoded 30d)", () => {
  // Default (no period) still reads 30 dní — byte-identical to the old signature.
  assert.match(profitGroundingText(base, model, "cs"), /\(30 dní\)/);
  // A threaded period re-labels the window and covers it.
  assert.match(profitGroundingText(base, model, "cs", "90d"), /\(90 dní\)/);
  assert.match(profitGroundingText(base, model, "en", "12m"), /\(12 months\)/);
});

test("profit: names a net-profit trend direction vs the prior window", () => {
  // The sample spine is long enough that a 90d window has a real prior window, so a
  // direction word appears (rostoucí | klesající | stabilní).
  const cs = profitGroundingText(base, model, "cs", "90d");
  assert.match(cs, /trend čistého zisku (rostoucí|klesající|stabilní)/);
  const en = profitGroundingText(base, model, "en", "90d");
  assert.match(en, /net-profit trend (rising|falling|stable)/);
});

test("history: gains a net-profit YoY line only when a cost model exists", () => {
  const revenueOnly = historyGroundingText(withDays(730), "cs");
  assert.doesNotMatch(revenueOnly, /Čistý zisk po nákladech/); // fallback unchanged
  const withModel = historyGroundingText(withDays(730), "cs", model);
  assert.match(withModel, /Delší horizont \(12 měsíců\)/); // base line preserved
  assert.match(withModel, /Čistý zisk po nákladech:.*meziročně/);
  const en = historyGroundingText(withDays(730), "en", model);
  assert.match(en, /Net profit after costs:.*YoY/);
});

test("history: silent until the series can actually cover a 12m + YoY comparison", () => {
  assert.equal(historyGroundingText(withDays(90), "cs"), ""); // below the day floor
  // 365 days looks like "a year" but a 12m/YoY comparison needs a full prior year
  // too; evaluatePeriod halves it to ~182d-vs-182d (truncated), so claiming
  // "12 měsíců / meziročně" here would fabricate the span — must stay silent.
  assert.equal(historyGroundingText(withDays(365), "cs"), "");
  // ~2 years: a genuine last-365d vs prior-365d comparison → the line fires.
  const cs = historyGroundingText(withDays(730), "cs");
  assert.match(cs, /Delší horizont \(12 měsíců\)/);
  assert.match(cs, /meziročně/);
  const en = historyGroundingText(withDays(730), "en");
  assert.match(en, /Longer horizon \(12 months\)/);
});
