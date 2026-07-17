/** A3 cost model: the pure net-profit math, the input sanitiser, and the sqlite
 *  store roundtrip. Exercises the `cost_model` table (DDL in src/lib/db.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-cost-model-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
register("./json-loader.mjs", import.meta.url);

const { periodProfit, sanitizeCostModel, PERIOD_MONTHS, deriveBreakEven } = await import("@/lib/cost-model/compute");
const { getCostModel, saveCostModel, clearCostModel } = await import("@/lib/cost-model/store");

test("periodProfit: net = revenue×margin − adCost − overhead×months − perOrder×orders", () => {
  const m = { grossMarginPct: 0.4, monthlyOverhead: 50_000, perOrderCost: 60, updatedAt: "x" };
  const pp = periodProfit({ revenue: 1_000_000, adCost: 200_000, conversions: 500, months: 1 }, m);
  assert.equal(pp.grossProfit, 400_000); // 1M × 0.4
  assert.equal(pp.overhead, 50_000);
  assert.equal(pp.fulfilment, 30_000); // 60 × 500
  assert.equal(pp.netProfit, 120_000); // 400k − 200k − 50k − 30k
  assert.equal(pp.poas, 2); // grossProfit / adCost = 400k / 200k
  assert.equal(pp.profitMargin, 0.12); // 120k / 1M
});

test("periodProfit: overhead scales with the period's months", () => {
  const m = { grossMarginPct: 0.5, monthlyOverhead: 10_000, perOrderCost: 0, updatedAt: "x" };
  const q = periodProfit({ revenue: 300_000, adCost: 100_000, conversions: 0, months: PERIOD_MONTHS["90d"] }, m);
  assert.equal(q.overhead, 30_000); // 10k × 3 months
  assert.equal(q.netProfit, 20_000); // 150k − 100k − 30k
});

test("periodProfit: zero ad spend → poas 0 (no divide-by-zero)", () => {
  const pp = periodProfit({ revenue: 100, adCost: 0, conversions: 0, months: 1 }, { grossMarginPct: 0.5, monthlyOverhead: 0, perOrderCost: 0, updatedAt: "x" });
  assert.equal(pp.poas, 0);
});

test("deriveBreakEven: gross ROAS = 1/margin, gross PNO = margin (no window)", () => {
  const be = deriveBreakEven({ grossMarginPct: 0.42, monthlyOverhead: 0, perOrderCost: 0, updatedAt: "x" });
  assert.equal(be.grossRoas, 1 / 0.42); // ≈ 2.38× — a 42% channel breaks even at 2.4×
  assert.equal(be.grossPno, 0.42);
  assert.equal(be.loadedRoas, undefined); // no overhead/fulfilment → no loaded variant
});

test("deriveBreakEven: loaded variant only when a window + overhead/fulfilment exist", () => {
  const m = { grossMarginPct: 0.5, monthlyOverhead: 10_000, perOrderCost: 50, updatedAt: "x" };
  // window has no overhead/fulfilment charged (0 months, 0 orders) → gross only
  const bare = deriveBreakEven({ ...m, monthlyOverhead: 0, perOrderCost: 0 }, { adCost: 100_000, conversions: 200, months: 3 });
  assert.equal(bare.loadedRoas, undefined);
  // overhead 10k×3 = 30k, fulfil 50×200 = 10k, adCost 100k, margin .5
  // loaded ROAS = (100k+30k+10k)/(100k×.5) = 140k/50k = 2.8
  const be = deriveBreakEven(m, { adCost: 100_000, conversions: 200, months: 3 });
  assert.equal(be.grossRoas, 2); // 1/.5
  assert.equal(be.loadedRoas, 2.8);
  assert.equal(be.loadedPno, 1 / 2.8);
});

test("deriveBreakEven: no ad spend → omit loaded variant, never Infinity (JSON-safe)", () => {
  const m = { grossMarginPct: 0.5, monthlyOverhead: 10_000, perOrderCost: 0, updatedAt: "x" };
  // organic-only reference window: overhead exists but adCost is 0, so the loaded ROAS
  // would be Infinity — the interface must instead omit the loaded fields.
  const be = deriveBreakEven(m, { adCost: 0, conversions: 0, months: 3 });
  assert.equal(be.loadedRoas, undefined);
  assert.equal(be.loadedPno, undefined);
  // and what survives is JSON-round-trippable with no null leaking into a number field
  const round = JSON.parse(JSON.stringify(be));
  assert.equal(round.loadedRoas, undefined);
  assert.ok(Number.isFinite(round.grossRoas));
});

test("sanitize: rejects a margin outside (0,1]; clamps negatives to 0", () => {
  assert.equal(sanitizeCostModel({ grossMarginPct: 0 }), null);
  assert.equal(sanitizeCostModel({ grossMarginPct: 1.5 }), null);
  assert.equal(sanitizeCostModel({ grossMarginPct: "abc" }), null);
  assert.deepEqual(sanitizeCostModel({ grossMarginPct: 0.45, monthlyOverhead: -5, perOrderCost: 30 }), {
    grossMarginPct: 0.45,
    monthlyOverhead: 0,
    perOrderCost: 30,
  });
});

test("store: save → get roundtrips; clear reverts to null", async () => {
  assert.equal(await getCostModel("proj-eshop"), null);
  await saveCostModel("proj-eshop", { grossMarginPct: 0.42, monthlyOverhead: 80_000, perOrderCost: 45, updatedAt: "2026-07-08T00:00:00.000Z" });
  const got = await getCostModel("proj-eshop");
  assert.equal(got.grossMarginPct, 0.42);
  assert.equal(got.monthlyOverhead, 80_000);
  await clearCostModel("proj-eshop");
  assert.equal(await getCostModel("proj-eshop"), null);
});
