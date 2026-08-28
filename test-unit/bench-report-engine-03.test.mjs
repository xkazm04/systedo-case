/** Bench regression (report-engine-03): ReportSnap must carry the engine's
 *  `truncated` flag. buildSnapshot honestly reports when a series cannot fill the
 *  requested window (e.g. a 120-day live series asked for "12m"), but assembleReport
 *  copies only label/current/delta into each ReportSnap — the flag is discarded, so
 *  the report tiles present a partial window under the full-period label with no way
 *  for a consumer to badge it. This test fails until ReportSnap carries `truncated`
 *  populated from the snapshot. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// assembleReport → @/lib/snapshot → the base performance.json; register the JSON hook.
register("./json-loader.mjs", import.meta.url);

const { buildSnapshot } = await import("@/lib/snapshot");
const { assembleReport } = await import("@/lib/report/assemble");

/** A short live-like series: 120 daily rows — far too few to fill the 12m (365d)
 *  window, so the engine flags the 12m snapshot as truncated. */
function series(days) {
  const out = [];
  const base = new Date("2026-02-01T00:00:00Z").getTime();
  for (let i = 0; i < days; i++) {
    const d = new Date(base + i * 86_400_000);
    out.push({
      date: d.toISOString().slice(0, 10),
      visits: 1000,
      cost: 2000,
      conversions: 40,
      revenue: 12000,
      clicks: 900,
      impressions: 20000,
    });
  }
  return out;
}

const dataset = {
  client: { name: "T", domain: "t.cz", segment: "e-shop", currency: "CZK", managedBy: "x" },
  meta: { disclaimer: "", asOf: "2026-05-31", days: 120, seed: 1 },
  goals: { pno: 0.18, monthlyRevenue: 250000 },
  channels: [],
  daily: series(120),
};

test("control: the engine itself flags the 12m window of a 120-day series as truncated", () => {
  const s = buildSnapshot("12m", "previous", dataset);
  assert.equal(s.truncated, true, "engine precondition: 120 days cannot fill a 365-day window");
  const s30 = buildSnapshot("30d", "previous", dataset);
  assert.equal(s30.truncated, false, "engine precondition: 30d IS covered by 120 days");
});

test("assembled ReportSnap carries the engine's truncated flag to the tile surface", () => {
  const { snaps } = assembleReport({ dataset, type: "eshop", live: true, costModel: null });
  // The defect: assemble.ts drops buildSnapshot's `truncated`, so this reads undefined.
  assert.equal(
    snaps["12m"].truncated,
    true,
    "snaps['12m'].truncated must be true for a 120-day series — the flag is currently discarded by assembleReport"
  );
  assert.equal(
    snaps["30d"].truncated,
    false,
    "snaps['30d'].truncated must be an explicit false for a covered window"
  );
});
