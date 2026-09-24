/** One write target per change-set — the refusals the write seam was missing.
 *
 *  `SyncMeta.source` is a PROVENANCE label, and a degraded sync (the live fetch fell
 *  back to sample rows) rightly flips it to "sample". Before this suite that same
 *  label also decided where money was written, so:
 *
 *   - a `_sklik` tenant whose last sync degraded fell through to the GOOGLE branch
 *     of `mutatorForTenant` and was handed a mutator for the user's active Google
 *     account — rail 3 (`SKLIK_WRITES_ENABLED`) was never consulted;
 *   - a set proposed over sample rows (`fromSource: "sample"`) was applied to the
 *     real account the moment a Google connection existed;
 *   - every move of an apply re-resolved the network and the credentials, so an
 *     N-move set read the token N times and a sync between moves could switch it.
 *
 *  Every case here is a REFUSAL or a read count: nothing in this file can arm a
 *  write. `SKLIK_WRITES_ENABLED` is set in exactly one test, scoped, and restored in
 *  a `finally`; the Sklik transport is an in-memory fixture that records calls.
 *
 *  What is mocked: the credential seams only (Google connection/token/ads, Sklik
 *  connection/token). The campaign store, the sync pipeline, the change-set ledger
 *  and the audit are the real code on a temp LOCAL_DB sqlite file.
 *
 *  Run with --experimental-test-module-mocks. */
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-write-target-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const CUSTOMER_ID = "1234567890";
/** Every call that reaches the Google Ads module, in order. */
const adsCalls = [];
/** Every credential read, by name. */
const reads = { googleToken: 0, sklikConnection: 0, sklikToken: 0 };

mock.module("@/lib/campaigns/connection", {
  namedExports: {
    getAdsConnection: async () => ({ customerId: CUSTOMER_ID, customerName: "Acme", connectedAt: "c" }),
    // Link-only: the real sync pipeline's import graph reaches connector.ts.
    getConnectedAccount: async () => null,
  },
});
mock.module("@/lib/google/token", {
  namedExports: {
    getUserAccessToken: async () => {
      reads.googleToken++;
      return "tok";
    },
  },
});
mock.module("@/lib/google/ads", {
  namedExports: {
    adsConfigured: () => true,
    // Link-only (connector.ts, reached through the real sync pipeline): never called.
    classifyLiveError: () => null,
    fetchCampaigns: async () => [],
    fetchDailySeriesBundle: async () => null,
    fetchSearchTerms: async () => [],
    pauseCampaign: async (...args) => void adsCalls.push(["pauseCampaign", args]),
    resumeCampaign: async (...args) => void adsCalls.push(["resumeCampaign", args]),
    setCampaignBudgetMicros: async (...args) => void adsCalls.push(["setCampaignBudgetMicros", args]),
    fetchCampaignBudgets: async (token, customerId, ids) => {
      adsCalls.push(["fetchCampaignBudgets", [token, customerId, ids]]);
      return new Map(
        ids.map((id, i) => [
          id,
          { campaignId: id, budgetResourceName: `customers/1/campaignBudgets/${id}`, amountMicros: 500_000_000 + i },
        ])
      );
    },
  },
});
mock.module("@/lib/campaigns/sklik-connection", {
  namedExports: {
    getSklikConnection: async () => {
      reads.sklikConnection++;
      return { tokenEnc: "x", connectedAt: "2026-01-01T00:00:00.000Z", moneyVerdict: "czk-plausible" };
    },
    getSklikToken: async () => {
      reads.sklikToken++;
      return "sklik-tok";
    },
  },
});

const { TARGET_ROAS } = await import("@/lib/campaigns/types");
const { tenantDocs } = await import("@/lib/tenant-docs/backend");
const { getSyncMeta } = await import("@/lib/campaigns/store");
const { runTenantSync } = await import("@/lib/campaigns/sync");
const { createChangeSet, approveChangeSet, revertChangeSet } = await import("@/lib/campaigns/control-plane");
const { mutatorForTenant, SKLIK_WRITES_ENV, setSklikTransport, resetSklikTransport } = await import(
  "@/lib/campaigns/mutator"
);
/** Lazy on purpose: the module is new, and the end-to-end cases below must run (and
 *  fail for their own reasons) against a tree that does not have it yet. */
const writeTarget = () => import("@/lib/campaigns/write-target");

const USER = "u1";
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

/** Two zero-return burners (→ two pauses) and one under-performer feeding one
 *  over-performer (→ one shift): exactly three moves under DEFAULT_POLICY. */
const CAMPAIGNS = [
  camp("z1", { cost: 8_000, roasFactor: 0 }),
  camp("z2", { cost: 7_000, roasFactor: 0 }),
  camp("d1", { cost: 20_000, roasFactor: 0.5 }),
  camp("w1", { cost: 20_000, roasFactor: 1.4 }),
];

const HEALTHY = { campaigns: false, series: false, reason: null };
const DEGRADED = { campaigns: true, series: true, reason: "token expired" };

/** A connector double for the REAL sync pipeline. `degradation.campaigns` is what a
 *  live provider reports after it silently fell back to the sample provider. */
const connector = (source, degradation = HEALTHY) => ({
  source,
  label: "Test",
  currency: "CZK",
  timeZone: null,
  degradation,
  fetchCampaigns: async () => CAMPAIGNS,
  fetchSeries: async () => [],
  fetchCampaignSeries: async () => ({}),
});

const sync = (tenant, source, degradation) =>
  runTenantSync(connector(source, degradation), tenant, { userId: null, period: PERIOD, actor: "test" });

async function auditDocs(tenant) {
  const rows = await (await tenantDocs()).listDocs(tenant, "mutations", { orderBy: { field: "at", dir: "desc" } });
  return rows.map(({ data }) => {
    const { at, ...rest } = data;
    assert.equal(typeof at, "string", "every audit doc is stamped");
    return rest;
  });
}

beforeEach(() => {
  adsCalls.length = 0;
  reads.googleToken = 0;
  reads.sklikConnection = 0;
  reads.sklikToken = 0;
  delete process.env[SKLIK_WRITES_ENV];
  resetSklikTransport();
});

// --- the pure module --------------------------------------------------------------

test("[write-target] a set built from sample rows is refused, and the refusal names the sample data", async () => {
  const { writeTargetVerdict } = await writeTarget();
  const v = writeTargetVerdict({ setSource: "sample", mutatorSource: "google-ads" });
  assert.equal(v.ok, false);
  assert.equal(v.code, "sample-derived");
  assert.match(v.error, /ukázková data/, "the operator is told WHY, in Czech");
});

test("[write-target] a set that belongs to another network is refused", async () => {
  const { writeTargetVerdict } = await writeTarget();
  const v = writeTargetVerdict({ setSource: "sklik", mutatorSource: "google-ads" });
  assert.equal(v.ok, false);
  assert.equal(v.code, "network-mismatch");
  assert.equal(typeof v.error, "string");
});

test("[write-target] a legacy source-less set, and a set on its own network, keep today's behaviour", async () => {
  const { writeTargetVerdict } = await writeTarget();
  assert.deepEqual(writeTargetVerdict({ setSource: undefined, mutatorSource: "google-ads" }), { ok: true });
  assert.deepEqual(writeTargetVerdict({ setSource: "google-ads", mutatorSource: "google-ads" }), { ok: true });
  assert.deepEqual(writeTargetVerdict({ setSource: "sklik", mutatorSource: "sklik" }), { ok: true });
});

test("[write-target] a REVERT of a sample-derived set is not refused — undoing a landed write stays possible", async () => {
  const { writeTargetVerdict } = await writeTarget();
  assert.deepEqual(writeTargetVerdict({ setSource: "sample", mutatorSource: "google-ads", phase: "revert" }), {
    ok: true,
  });
  // …but the network check still holds on the way back.
  assert.equal(
    writeTargetVerdict({ setSource: "sklik", mutatorSource: "google-ads", phase: "revert" }).code,
    "network-mismatch"
  );
});

test("[write-target] writeNetwork reads the stamped network and falls back to the source", async () => {
  const { writeNetwork, syncDegraded } = await writeTarget();
  assert.equal(writeNetwork({ source: "sample", network: "sklik" }), "sklik");
  assert.equal(writeNetwork({ source: "google" }), "google");
  assert.equal(syncDegraded({ source: "sample", network: "sklik" }), true);
  assert.equal(syncDegraded({ source: "google-ads", network: "google-ads" }), false);
  assert.equal(syncDegraded({ source: "sample", network: "sample" }), false, "a sample tenant is not degraded");
  assert.equal(syncDegraded({ source: "sample" }), false, "a pre-stamp meta keeps today's behaviour");
  assert.equal(syncDegraded(null), false);
});

// --- the sync stamp ---------------------------------------------------------------

test("[sync] the root doc records the network the sync was FOR, beside the honest provenance label", async () => {
  await sync("u_u1_proj_p1_stamp_live", "google-ads", HEALTHY);
  const live = await getSyncMeta("u_u1_proj_p1_stamp_live");
  assert.equal(live.source, "google-ads");
  assert.equal(live.network, "google-ads");

  await sync("u_u1_proj_p1_stamp_sklik", "sklik", DEGRADED);
  const degraded = await getSyncMeta("u_u1_proj_p1_stamp_sklik");
  assert.equal(degraded.source, "sample", "the provenance label still says sample — the UI keeps telling the truth");
  assert.equal(degraded.network, "sklik", "…while the tenant's own network survives the fallback");
});

// --- mutatorForTenant: a degraded tenant gets no mutator at all --------------------

test("[mutator] a Sklik tenant whose last sync degraded is REFUSED — no longer handed a Google mutator", async () => {
  const tenant = "u_u1_proj_p1_sklik";
  await sync(tenant, "sklik", DEGRADED);
  adsCalls.length = 0;
  const res = await mutatorForTenant(USER, tenant);
  assert.equal(res.ok, false, "a degraded Sklik tenant resolved to a working mutator (the Google one)");
  assert.equal(res.code, "sync-degraded");
  assert.match(res.error, /ukázková data/);
  assert.equal(reads.googleToken, 0, "refused before any Google credential read");
  assert.equal(reads.sklikConnection + reads.sklikToken, 0, "refused before any Sklik rail or credential read");
});

test("[mutator] even with SKLIK_WRITES_ENABLED=1 and a settled Sklik account, a degraded tenant is refused", async () => {
  const tenant = "u_u1_proj_p1_sklik_armed";
  await sync(tenant, "sklik", DEGRADED);
  const transportCalls = [];
  setSklikTransport(() => ({
    async call(method, params) {
      transportCalls.push({ method, params });
      return { session: "s", status: 200 };
    },
  }));
  const prev = process.env[SKLIK_WRITES_ENV];
  process.env[SKLIK_WRITES_ENV] = "1";
  try {
    const res = await mutatorForTenant(USER, tenant);
    assert.equal(res.ok, false, "a degraded tenant must never become a real Sklik write");
    assert.equal(res.code, "sync-degraded");
    assert.equal(reads.sklikConnection + reads.sklikToken + reads.googleToken, 0);
    assert.equal(transportCalls.length, 0, "no Sklik client was ever built");
  } finally {
    if (prev === undefined) delete process.env[SKLIK_WRITES_ENV];
    else process.env[SKLIK_WRITES_ENV] = prev;
    resetSklikTransport();
  }
});

test("[mutator] guard: a HEALTHY Sklik tenant still meets rail 3 first, and a healthy Google tenant still resolves", async () => {
  await sync("u_u1_proj_p1_sklik_live", "sklik", HEALTHY);
  const sk = await mutatorForTenant(USER, "u_u1_proj_p1_sklik_live");
  assert.equal(sk.ok, false);
  assert.equal(sk.code, "sklik-writes-disabled", "rail 3 is unchanged and still decides first");

  await sync("u_u1_proj_p1_google_live", "google-ads", HEALTHY);
  const g = await mutatorForTenant(USER, "u_u1_proj_p1_google_live");
  assert.equal(g.ok, true);
  assert.equal(g.mutator.source, "google-ads");
});

// --- approve / revert: one resolution per change-set ----------------------------

test("[approve] a set proposed over sample rows never reaches the live account", async () => {
  const tenant = `u_u1_proj_p1_${CUSTOMER_ID}_sampleset`;
  // Proposed while the live fetch had fallen back to sample rows…
  await sync(tenant, "google-ads", DEGRADED);
  const cs = await createChangeSet(tenant);
  assert.equal(cs.moves.length, 3);
  assert.ok(cs.moves.every((m) => m.fromSource === "sample"), "the moves carry the sample provenance");
  assert.deepEqual(cs.violations, []);
  // …and approved after the next sync came back healthy.
  await sync(tenant, "google-ads", HEALTHY);
  adsCalls.length = 0;

  const applied = await approveChangeSet(tenant, USER, cs.id);
  assert.deepEqual(adsCalls, [], "no pause / budget read / budget write reached Google Ads");
  assert.equal(applied.status, "failed");
  const { writeTargetVerdict } = await writeTarget();
  const refusal = writeTargetVerdict({ setSource: "sample", mutatorSource: "google-ads" }).error;
  assert.equal(applied.results.length, 3);
  for (const r of applied.results) {
    assert.equal(r.ok, false);
    assert.equal(r.error, refusal);
  }
  assert.deepEqual(await auditDocs(tenant), [], "a refused apply writes no audit doc");
});

test("[approve] a Sklik set that would now resolve to Google is refused — no Google call, no audit", async () => {
  const tenant = `u_u1_proj_p1_${CUSTOMER_ID}_crossnet`;
  await sync(tenant, "sklik", HEALTHY);
  const cs = await createChangeSet(tenant);
  assert.ok(cs.moves.every((m) => m.fromSource === "sklik"));
  // The tenant's meta now routes to Google (e.g. a pre-stamp degraded meta, or a
  // re-pointed tenant): the set's own network is what the verdict holds it to.
  await sync(tenant, "google-ads", HEALTHY);
  adsCalls.length = 0;

  const applied = await approveChangeSet(tenant, USER, cs.id);
  assert.deepEqual(adsCalls, [], "a Sklik set never reached the Google Ads module");
  assert.equal(applied.status, "failed");
  const { writeTargetVerdict } = await writeTarget();
  const refusal = writeTargetVerdict({ setSource: "sklik", mutatorSource: "google-ads" }).error;
  assert.ok(applied.results.every((r) => !r.ok && r.error === refusal));
  assert.deepEqual(await auditDocs(tenant), []);
});

test("[approve] a set approved while the tenant's sync is degraded is refused before any write", async () => {
  const tenant = `u_u1_proj_p1_${CUSTOMER_ID}_degraded_now`;
  await sync(tenant, "google-ads", HEALTHY);
  const cs = await createChangeSet(tenant);
  await sync(tenant, "google-ads", DEGRADED);
  adsCalls.length = 0;

  const applied = await approveChangeSet(tenant, USER, cs.id);
  assert.deepEqual(adsCalls, []);
  assert.equal(applied.status, "failed");
  assert.ok(applied.results.every((r) => !r.ok && /ukázková data/.test(r.error)));
  assert.equal(reads.googleToken, 0);
});

test("[approve] a 3-move Google set resolves its write target ONCE and audits exactly as before", async () => {
  const tenant = `u_u1_proj_p1_${CUSTOMER_ID}_once`;
  await sync(tenant, "google-ads", HEALTHY);
  const cs = await createChangeSet(tenant);
  assert.equal(cs.moves.length, 3);
  assert.ok(cs.moves.every((m) => m.fromSource === "google-ads"));
  reads.googleToken = 0;

  const applied = await approveChangeSet(tenant, USER, cs.id);
  assert.equal(applied.status, "applied");
  assert.equal(reads.googleToken, 1, "one credential read per change-set, not one per move");

  const docs = await auditDocs(tenant);
  const byAction = (a, id) => docs.find((d) => d.action === a && (d.campaignId ?? d.fromId) === id);
  assert.deepEqual(byAction("pause", "z1"), {
    action: "pause",
    campaignId: "z1",
    campaignName: "Kampaň z1",
    customerId: CUSTOMER_ID,
    userId: USER,
  });
  assert.deepEqual(byAction("pause", "z2"), {
    action: "pause",
    campaignId: "z2",
    campaignName: "Kampaň z2",
    customerId: CUSTOMER_ID,
    userId: USER,
  });
  assert.deepEqual(byAction("budget_shift", "d1"), {
    action: "budget_shift",
    fromId: "d1",
    fromName: "Kampaň d1",
    toId: "w1",
    toName: "Kampaň w1",
    dailyMovedMicros: 266_666_667,
    customerId: CUSTOMER_ID,
    userId: USER,
  });
  assert.equal(docs.length, 3);
});

test("[revert] the revert of that set also resolves once", async () => {
  const tenant = `u_u1_proj_p1_${CUSTOMER_ID}_once`;
  const [applied] = (await (await tenantDocs()).listDocs(tenant, "changeSets", {})).map((d) => ({
    id: d.id,
    ...d.data,
  }));
  assert.equal(applied.status, "applied");
  reads.googleToken = 0;
  adsCalls.length = 0;

  const reverted = await revertChangeSet(tenant, USER, applied.id);
  assert.equal(reverted.status, "reverted");
  assert.equal(reads.googleToken, 1, "one credential read for the restore + both resumes");
  assert.deepEqual(
    adsCalls.map(([name]) => name).sort(),
    ["resumeCampaign", "resumeCampaign", "setCampaignBudgetMicros", "setCampaignBudgetMicros"]
  );
});
