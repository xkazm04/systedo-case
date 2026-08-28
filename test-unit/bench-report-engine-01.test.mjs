/** Bench regression (report-engine-01): ref12 — the 12-month reference totals the
 *  break-even strip divides by PERIOD_MONTHS["12m"]=12 — must NOT be fed from a
 *  TRUNCATED 12m snapshot. A live sync fetches ~400 days, evaluatePeriod caps the
 *  window at floor(n/2)=200 days, so the "12m" totals cover ~6.6 months; charging
 *  12 months of overhead against them makes the break-even materially wrong.
 *  Correct behaviour: assembleReport returns ref12 = null when the 12m snapshot is
 *  truncated (the type allows null and the consumer already guards), and keeps the
 *  real totals when the series genuinely covers the full window. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// assembleReport → @/lib/snapshot → the base performance.json; register the JSON hook.
register("./json-loader.mjs", import.meta.url);

const { buildSnapshot } = await import("@/lib/snapshot");
const { assembleReport } = await import("@/lib/report/assemble");

/** `days` of flat e-shop-shaped daily rows ending 2026-06-04 (same shape the
 *  existing report-assemble fixtures use). */
function dataset(days) {
  const daily = [];
  const end = new Date("2026-06-04T00:00:00Z").getTime();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end - i * 86_400_000);
    daily.push({
      date: d.toISOString().slice(0, 10),
      visits: 1000,
      cost: 2000,
      conversions: 40,
      revenue: 12000,
      clicks: 1000,
      impressions: 20000,
    });
  }
  return {
    client: { name: "T", domain: "t.cz", segment: "e-shop", currency: "CZK", managedBy: "x" },
    meta: { disclaimer: "", asOf: "2026-06-04", days, seed: 1 },
    goals: { pno: 0.18, monthlyRevenue: 250000 },
    channels: [],
    daily,
  };
}

test("a truncated 12m snapshot (live ~400d sync) must not populate ref12", () => {
  const live400 = dataset(400);
  // Precondition: on a 400-day series the 12m window IS truncated (span capped at 200d).
  const s = buildSnapshot("12m", "previous", live400);
  assert.equal(s.truncated, true, "precondition: 400d series → truncated 12m snapshot");

  const { ref12 } = assembleReport({ dataset: live400, type: "eshop", live: true, costModel: null });
  assert.equal(
    ref12,
    null,
    `ref12 must be null when the 12m snapshot is truncated (got ${JSON.stringify(ref12)} — ` +
      "~200 days of ad cost/conversions would be charged 12 months of overhead in deriveBreakEven)"
  );
});

test("a full-window series keeps the real 12-month reference totals", () => {
  const full = dataset(740);
  const s = buildSnapshot("12m", "previous", full);
  assert.equal(s.truncated, false, "precondition: 740d series → full 12m window");

  const { ref12 } = assembleReport({ dataset: full, type: "eshop", live: true, costModel: null });
  assert.deepEqual(ref12, { adCost: s.current.cost, conversions: s.current.conversions });
});
