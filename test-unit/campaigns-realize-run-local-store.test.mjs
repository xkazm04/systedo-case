/** WP W2-E — the I/O half of the realized-impact ledger on the LOCAL_DB backend:
 *  the runner (`realizeAppliedChangeSets`), the calibration doc it persists, the
 *  stamp `createChangeSet` puts on the next proposal, and the sync-pipeline gate
 *  that stops any of it from happening on degraded (sample) data.
 *
 *  Nothing about the store is mocked: change-sets ride the real `tenant_docs`
 *  seam and the per-campaign series rides the real campaign-doc store, both on a
 *  temp sqlite database — the recipe from campaigns-control-plane-local-store.
 *  The only stand-in is the CONNECTOR handed to `runTenantSync`, which is the
 *  credential seam, not the pipeline under test.
 *
 *  Run with --experimental-test-module-mocks. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-realize-run-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { TARGET_ROAS } = await import("@/lib/campaigns/types");
const { projectedValueGain } = await import("@/lib/campaigns/control-plane-types");
const { tenantDocs } = await import("@/lib/tenant-docs/backend");
const { upsertCampaigns, saveCampaignSeries } = await import("@/lib/campaigns/store");
const { createChangeSet } = await import("@/lib/campaigns/control-plane");
const { realizeAppliedChangeSets } = await import("@/lib/campaigns/realize-run");
const { runTenantSync } = await import("@/lib/campaigns/sync");
const { CALIBRATION_COLLECTION, CALIBRATION_DOC_ID } = await import("@/lib/campaigns/calibration");

const DAY = 24 * 60 * 60 * 1000;
const PERIOD = "30d";

const camp = (id, { cost, roasFactor }) => ({
  id,
  name: `Kampaň ${id}`,
  type: "search",
  status: "enabled",
  impressions: 50_000,
  clicks: 1_000,
  cost,
  conversions: roasFactor > 0 ? 20 : 0,
  conversionValue: Math.round(cost * TARGET_ROAS * roasFactor),
});

const CAMPAIGNS = [
  camp("z1", { cost: 8_000, roasFactor: 0 }), // zero-return burner → pause move
  camp("d1", { cost: 20_000, roasFactor: 0.5 }), // under-performer → shift donor
  camp("w1", { cost: 20_000, roasFactor: 1.4 }), // over-performer → recipient
];

// Applied eight days ago, so the 7-day after-window has fully elapsed.
const APPROVED_MS = Date.now() - 8 * DAY;
const APPROVED_AT = new Date(APPROVED_MS).toISOString();
const APPLY_DAY_START = Date.parse(`${new Date(APPROVED_MS).toISOString().slice(0, 10)}T00:00:00.000Z`);

/** 14 daily points around the apply day: `before`/day for the 7 preceding days,
 *  `after`/day for the apply day and the six that follow. */
function series(before, after) {
  const points = [];
  for (let i = -7; i <= 6; i++) {
    points.push({
      date: new Date(APPLY_DAY_START + i * DAY).toISOString().slice(0, 10),
      cost: 100,
      conversions: 1,
      conversionValue: i < 0 ? before : after,
    });
  }
  return points;
}

// d1: 7×200 → 7×300 (+700). w1: 7×500 → 7×700 (+1400). Touched delta: +2100.
const SERIES_BY_ID = { d1: series(200, 300), w1: series(500, 700), z1: series(0, 0) };

const MOVES = [
  { fromId: "d1", fromName: "Kampaň d1", toId: "w1", toName: "Kampaň w1", amount: 400, fromRoas: 1, toRoas: 4, estValueGain: 1_200 },
];

/** An applied change-set whose projection claimed `projected` of extra value. */
const appliedDoc = (projected) => ({
  createdAt: new Date(APPROVED_MS - DAY).toISOString(),
  status: "applied",
  moves: MOVES,
  simulation: { before: { conversionValue: 10_000 }, after: { conversionValue: 10_000 + projected } },
  policy: { maxMoveAmountCzk: 50_000, maxMoves: 3 },
  violations: [],
  approvedAt: APPROVED_AT,
  revertedAt: null,
  results: [{ fromName: "Kampaň d1", toName: "Kampaň w1", ok: true }],
  budgetSnapshots: [{ budgetResourceName: "customers/1/campaignBudgets/d1", prevMicros: 1 }],
});

async function seedTenant(tenant) {
  await upsertCampaigns(tenant, CAMPAIGNS, { source: "google-ads", period: PERIOD, currency: "CZK" });
  await saveCampaignSeries(tenant, SERIES_BY_ID, { period: PERIOD });
}

const readSets = async (tenant) =>
  (await (await tenantDocs()).listDocs(tenant, "changeSets", { orderBy: { field: "createdAt", dir: "desc" } })).map(
    (d) => ({ id: d.id, ...d.data })
  );

// --- the runner ---------------------------------------------------------------

test("[local] a due applied set is measured against the persisted series and written back", async () => {
  const tenant = "u_u1_proj_p1_realize";
  await seedTenant(tenant);
  await (await tenantDocs()).addDoc(tenant, "changeSets", appliedDoc(1_050));

  const out = await realizeAppliedChangeSets(tenant, PERIOD);
  assert.equal(out.realized, 1, "one set came due and was scored");

  const [stored] = await readSets(tenant);
  assert.ok(stored.realized, "the measurement rode the existing doc — no new store, no migration");
  assert.equal(stored.realized.status, "measured");
  assert.equal(stored.realized.realizedValueDelta, 2_100);
  assert.equal(stored.realized.projectedValueGain, 1_050);
  assert.equal(stored.realized.ratio, 2);
  assert.equal(stored.realized.daysCovered.before, 7);
  assert.equal(stored.status, "applied", "the merge-set left the lifecycle fields alone");
  assert.equal(stored.results.length, 1);
});

test("[local] the pass is idempotent — a second run re-measures nothing", async () => {
  const tenant = "u_u1_proj_p1_realize";
  const before = (await readSets(tenant))[0].realized.computedAt;
  const out = await realizeAppliedChangeSets(tenant, PERIOD);
  assert.equal(out.realized, 0);
  assert.equal((await readSets(tenant))[0].realized.computedAt, before, "the measurement is not rewritten");
});

test("[local] a single measured set writes a NEUTRAL calibration doc, not a multiplier of 2", async () => {
  const cal = await (await tenantDocs()).getDoc("u_u1_proj_p1_realize", CALIBRATION_COLLECTION, CALIBRATION_DOC_ID);
  assert.ok(cal, "the calibration lives on the same tenantDocs seam (ADR-0001)");
  assert.equal(cal.multiplier, 1, "one data point is not a history");
  assert.equal(cal.n, 1);
  assert.equal(cal.reason, "insufficient-history");
});

test("[local] a set that is not yet due is skipped and left unmeasured", async () => {
  const tenant = "u_u1_proj_p1_notdue";
  await seedTenant(tenant);
  await (await tenantDocs()).addDoc(tenant, "changeSets", {
    ...appliedDoc(1_050),
    approvedAt: new Date(Date.now() - 2 * DAY).toISOString(),
  });
  const out = await realizeAppliedChangeSets(tenant, PERIOD);
  assert.equal(out.realized, 0);
  assert.equal((await readSets(tenant))[0].realized, undefined, "'not due' is never persisted as a degradation");
});

test("[local] a PENDING set is never realized — approvedAt is stamped on failed settles too", async () => {
  const tenant = "u_u1_proj_p1_pending";
  await seedTenant(tenant);
  await (await tenantDocs()).addDoc(tenant, "changeSets", { ...appliedDoc(1_050), status: "failed" });
  await (await tenantDocs()).addDoc(tenant, "changeSets", { ...appliedDoc(1_050), status: "pending", approvedAt: null });
  const out = await realizeAppliedChangeSets(tenant, PERIOD);
  assert.equal(out.realized, 0);
  for (const s of await readSets(tenant)) assert.equal(s.realized, undefined, s.status);
});

// --- the calibration it feeds -------------------------------------------------

test("[local] three measured sets produce the clamped MEDIAN as the tenant's multiplier", async () => {
  const tenant = "u_u1_proj_p1_median";
  await seedTenant(tenant);
  // realized delta is +2100 for all three; the projections differ → ratios 0.5, 0.7, 3
  for (const projected of [4_200, 3_000, 700]) {
    await (await tenantDocs()).addDoc(tenant, "changeSets", appliedDoc(projected));
  }
  const out = await realizeAppliedChangeSets(tenant, PERIOD);
  assert.equal(out.realized, 3);
  assert.equal(out.calibration.n, 3);
  assert.equal(out.calibration.multiplier, 0.7, "median of [0.5, 0.7, 3]");
  assert.equal(out.calibration.reason, undefined);

  const cal = await (await tenantDocs()).getDoc(tenant, CALIBRATION_COLLECTION, CALIBRATION_DOC_ID);
  assert.equal(cal.multiplier, 0.7, "…and it is what the store holds");
});

test("[local] the next proposal is tempered by that multiplier AND discloses it", async () => {
  const tenant = "u_u1_proj_p1_median";
  const calibrated = await createChangeSet(tenant);
  assert.ok(calibrated, "the seeded portfolio still yields a proposal");
  assert.deepEqual(calibrated.calibration, { multiplier: 0.7, n: 3 }, "stamped on the doc, never applied silently");

  // the SAME portfolio on a tenant with no history projects the uncalibrated number
  const virgin = "u_u1_proj_p1_virgin";
  await seedTenant(virgin);
  const uncalibrated = await createChangeSet(virgin);
  assert.equal(uncalibrated.calibration, undefined, "no history → the set keeps its exact prior shape");
  assert.ok(
    projectedValueGain(calibrated.simulation) < projectedValueGain(uncalibrated.simulation),
    "a 0.7 multiplier projects a smaller gain than the uncalibrated model"
  );

  const [stored] = await readSets(tenant);
  assert.deepEqual(stored.calibration, { multiplier: 0.7, n: 3 }, "the disclosure survives the roundtrip");
});

// --- the sync-pipeline gate ---------------------------------------------------

const connector = (over = {}) => ({
  source: "google-ads",
  label: "Test",
  currency: "CZK",
  timeZone: null,
  degradation: { campaigns: false, series: false, reason: null },
  fetchCampaigns: async () => CAMPAIGNS,
  fetchSeries: async () => SERIES_BY_ID.d1,
  fetchCampaignSeries: async () => SERIES_BY_ID,
  ...over,
});

test("[local] a LIVE sync realizes the due set as its post-save pass", async () => {
  const tenant = "u_u1_proj_p1_sync";
  await seedTenant(tenant);
  await (await tenantDocs()).addDoc(tenant, "changeSets", appliedDoc(1_050));

  await runTenantSync(connector(), tenant, { userId: null, period: PERIOD, actor: "test" });

  const [stored] = await readSets(tenant);
  assert.equal(stored.realized?.status, "measured", "the hook ran off the series this sync just wrote");
  assert.equal(stored.realized.ratio, 2);
});

test("[local] a DEGRADED sync never scores a projection against sample numbers", async () => {
  for (const degradation of [
    { campaigns: true, series: false, reason: "token expired" },
    { campaigns: false, series: true, reason: "series fetch failed" },
  ]) {
    const tenant = `u_u1_proj_p1_degraded_${degradation.campaigns ? "c" : "s"}`;
    await seedTenant(tenant);
    await (await tenantDocs()).addDoc(tenant, "changeSets", appliedDoc(1_050));

    await runTenantSync(connector({ degradation }), tenant, { userId: null, period: PERIOD, actor: "test" });

    const [stored] = await readSets(tenant);
    assert.equal(stored.realized, undefined, `degradation ${JSON.stringify(degradation)} must not realize`);
    const cal = await (await tenantDocs()).getDoc(tenant, CALIBRATION_COLLECTION, CALIBRATION_DOC_ID);
    assert.equal(cal, undefined, "…and no calibration is manufactured out of it either");
  }
});

test("[local] the runner never throws, whatever the tenant looks like", async () => {
  const out = await realizeAppliedChangeSets("u_u1_proj_p1_empty", PERIOD);
  assert.deepEqual(out, { realized: 0, calibration: null }, "an empty tenant is a quiet no-op");
});
