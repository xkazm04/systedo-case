/** Direction 1 pin: the Monthly Report tile model is now assembled by ONE shared
 *  helper (src/lib/report/assemble.ts) that the in-app report page AND the client
 *  shared link both call. These tests freeze the extraction — the assembled snaps are
 *  pinned equal to the engine's buildSnapshot numbers (so the shared link can never
 *  drift from the in-app report), and the tile set + cost-model relabel + live paid
 *  pair match the page's prior inline logic. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// assembleReport → @/lib/snapshot → the base performance.json; register the JSON hook.
register("./json-loader.mjs", import.meta.url);

const { buildSnapshot } = await import("@/lib/snapshot");
const { assembleReport } = await import("@/lib/report/assemble");
const { reportTilesForType } = await import("@/lib/report/compute");
const { periodProfit, PERIOD_MONTHS } = await import("@/lib/cost-model/compute");
const { ANALYSIS_PERIODS } = await import("@/lib/ai-types");

/** ~400 days of e-shop-shaped daily rows (covers the 12m window + the attainment
 *  track record). Weekday seasonality + a paid-traffic pair so CTR/CPC read non-zero.
 *  `days` defaults to 400 — under 730 the 12m window is truncated (span = floor(n/2)). */
function series(days = 400) {
  const out = [];
  const base = new Date("2025-05-01T00:00:00Z").getTime();
  for (let i = 0; i < days; i++) {
    const d = new Date(base + i * 86_400_000);
    const dow = d.getUTCDay();
    const w = dow === 0 || dow === 6 ? 0.7 : 1;
    out.push({
      date: d.toISOString().slice(0, 10),
      visits: Math.round(1000 * w),
      cost: Math.round(2000 * w),
      conversions: Math.round(40 * w),
      revenue: Math.round(12000 * w),
      clicks: Math.round(1000 * w),
      impressions: Math.round(20000 * w),
    });
  }
  return out;
}

const performance = {
  client: { name: "T", domain: "t.cz", segment: "e-shop", currency: "CZK", managedBy: "x" },
  meta: { disclaimer: "", asOf: "2026-06-04", days: 400, seed: 1 },
  goals: { pno: 0.18, monthlyRevenue: 250000 },
  channels: [],
  daily: series(),
};

// A variant long enough (>=730 days) that the 12m window is NOT truncated (span =
// min(365, floor(n/2)) === 365) — for the full-year break-even reference pin.
const fullYearPerformance = { ...performance, daily: series(730) };

test("tiles match the type preset on the sample (non-live, no cost model) path", () => {
  for (const type of ["eshop", "leadgen", "local", "content", "app"]) {
    const { tiles } = assembleReport({ dataset: performance, type, live: false, costModel: null });
    assert.deepEqual(tiles, reportTilesForType(type));
  }
});

test("snaps are pinned to buildSnapshot's engine numbers (the drift guarantee)", () => {
  const { snaps } = assembleReport({ dataset: performance, type: "eshop", live: false, costModel: null });
  for (const p of ANALYSIS_PERIODS) {
    const s = buildSnapshot(p, "previous", performance);
    assert.equal(snaps[p].label, s.periodLabel);
    assert.equal(snaps[p].current.revenue, s.current.revenue, `${p} revenue`);
    assert.equal(snaps[p].current.cost, s.current.cost, `${p} cost`);
    assert.equal(snaps[p].current.roas, s.current.roas, `${p} roas`);
    assert.equal(snaps[p].current.pno, s.current.pno, `${p} pno`);
    assert.equal(snaps[p].current.conversions, s.current.conversions, `${p} conversions`);
    // No cost model → profit is the pre-COGS contribution the engine reports.
    assert.equal(snaps[p].current.profit, s.current.profit, `${p} profit`);
    assert.equal(snaps[p].delta.revenue, s.delta.revenue, `${p} Δrevenue`);
    assert.equal(snaps[p].delta.cost, s.delta.cost, `${p} Δcost`);
  }
});

test("live path appends the CTR/CPC pair for eshop; sample path never does", () => {
  const live = assembleReport({ dataset: performance, type: "eshop", live: true, costModel: null });
  const sample = assembleReport({ dataset: performance, type: "eshop", live: false, costModel: null });
  assert.ok(live.tiles.some((t) => t.metric === "ctr") && live.tiles.some((t) => t.metric === "cpc"));
  assert.ok(!sample.tiles.some((t) => t.metric === "ctr" || t.metric === "cpc"));
});

test("cost model relabels the contribution tile to Zisk, adds a margin tile, nets the profit", () => {
  const costModel = { grossMarginPct: 0.55, monthlyOverhead: 40000, perOrderCost: 30 };
  const { tiles, snaps } = assembleReport({ dataset: performance, type: "eshop", live: false, costModel });
  const profitTile = tiles.find((t) => t.metric === "profit");
  assert.equal(profitTile.label, "Zisk");
  assert.equal(profitTile.labelEn, "Net profit");
  assert.ok(tiles.some((t) => t.metric === "profitMargin"), "adds a net-margin tile");
  // The profit snap is the cost-model net profit, not the pre-COGS contribution.
  for (const p of ANALYSIS_PERIODS) {
    const s = buildSnapshot(p, "previous", performance);
    const pp = periodProfit(
      { revenue: s.current.revenue, adCost: s.current.cost, conversions: s.current.conversions, months: PERIOD_MONTHS[p] },
      costModel
    );
    assert.equal(snaps[p].current.profit, pp.netProfit, `${p} net profit`);
    assert.equal(snaps[p].current.profitMargin, pp.profitMargin, `${p} net margin`);
  }
});

test("ref12 carries the 12-month reference totals for the break-even", () => {
  const { ref12 } = assembleReport({ dataset: fullYearPerformance, type: "eshop", live: false, costModel: null });
  const s = buildSnapshot("12m", "previous", fullYearPerformance);
  assert.ok(s.truncated === false, "fixture covers a full 12m window");
  assert.deepEqual(ref12, { adCost: s.current.cost, conversions: s.current.conversions });
});

test("ref12 stays null when the 12m window is truncated (insufficient history)", () => {
  // A live sync's 400-day series caps the 12m span at 200 days — charging 12
  // months of overhead against ~6.6 months of ad cost was the defect, so a
  // truncated 12m snapshot must NOT produce an overhead-loaded break-even ref.
  const { ref12 } = assembleReport({ dataset: performance, type: "eshop", live: false, costModel: null });
  const s = buildSnapshot("12m", "previous", performance);
  assert.ok(s.truncated, "fixture's 12m window is truncated");
  assert.equal(ref12, null);
});
