/** WP W1-G / ADR-0010 — the campaigns API's PROJECT-level read, end to end against
 *  the real per-tenant store on the LOCAL_DB backend.
 *
 *  `loadProjectState` is the route's own loader (exported for exactly this), so
 *  what is exercised here is the whole read path: resolveProjectTenants → one
 *  tenant-root read per tenant → the root-threaded `listCampaignsForTenants` →
 *  the per-tenant payload → the union assembly. Two tenants are seeded through the
 *  real `upsertCampaigns` / `saveSeries` into a temp sqlite database, exactly as
 *  campaigns-local-store.test.mjs does.
 *
 *  What is mocked and why: the CONNECTOR (which tenants a project covers — it
 *  reaches Firestore for the Google connection and the Sklik suffix), the session,
 *  and the sync pipeline. Those are the credential seams, not the read under test;
 *  the tenant keys they hand back are then used verbatim by the real store.
 *
 *  Run with --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-campaigns-union-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const T_GOOGLE = "u_u1_proj_p1_1234567890";
const T_SKLIK = "u_u1_proj_p1_sklik";

/** The project's tenant set, swapped per test — the one thing the connector owns. */
let TENANTS = [
  { tenant: T_GOOGLE, source: "google-ads" },
  { tenant: T_SKLIK, source: "sklik" },
];

mock.module("@/lib/session", {
  namedExports: { currentUserId: async () => "u1", currentUser: async () => null },
});
mock.module("@/lib/campaigns/connector", {
  namedExports: {
    resolveProjectTenants: async () => TENANTS,
    resolveTenant: async () => TENANTS[0].tenant,
    resolveCampaignContext: async () => ({ connector: null, tenant: TENANTS[0].tenant }),
  },
});
mock.module("@/lib/campaigns/sync", { namedExports: { runTenantSync: async () => ({}) } });

const { upsertCampaigns } = await import("@/lib/campaigns/store/campaigns");
const { saveSeries } = await import("@/lib/campaigns/store/series");
const { loadProjectState } = await import("@/app/api/campaigns/route");

const camp = (id, over = {}) => ({
  id,
  name: `Campaign ${id}`,
  type: "search",
  status: "enabled",
  impressions: 1000,
  clicks: 100,
  cost: 5000,
  conversions: 20,
  conversionValue: 40000,
  ...over,
});

const day = (date, cost) => ({ date, cost, conversions: 2, conversionValue: cost * 4 });

test("seed: two per-account tenants of the same project", async () => {
  await upsertCampaigns(T_GOOGLE, [camp("g1"), camp("g2")], {
    source: "google-ads",
    period: "30d",
    currency: "CZK",
  });
  await saveSeries(T_GOOGLE, [day("2026-08-01", 100), day("2026-08-02", 200)], { period: "30d" });
  await upsertCampaigns(T_SKLIK, [camp("s1")], { source: "sklik", period: "30d", currency: "CZK" });
  await saveSeries(T_SKLIK, [day("2026-08-01", 50)], { period: "30d" });
  assert.ok(true);
});

test("the project reads the UNION of both tenants, Google first, rows tagged", async () => {
  const out = await loadProjectState("u1", "p1", "30d");
  assert.deepEqual(
    out.campaigns.map((c) => [c.id, c.source]),
    [
      ["g1", "google-ads"],
      ["g2", "google-ads"],
      ["s1", "sklik"],
    ]
  );
  assert.deepEqual(
    out.sources.map((s) => [s.source, s.campaigns]),
    [
      ["google-ads", 2],
      ["sklik", 1],
    ]
  );
  // meta stays the PRIMARY tenant's — unchanged semantics for every legacy reader
  assert.equal(out.meta.source, "google-ads");
  assert.equal(out.meta.period, "30d");
});

test("same-currency sections sum per day; no cross-currency total is invented", async () => {
  const out = await loadProjectState("u1", "p1", "30d");
  assert.equal(out.mixedCurrency, false);
  assert.deepEqual(out.series.map((p) => p.date), ["2026-08-01", "2026-08-02"]);
  assert.equal(out.series[0].cost, 150);
  assert.equal(out.series[1].cost, 200);
});

test("a EUR section stops the sum: primary series only, mixedCurrency reported", async () => {
  const T_EUR = "u_u1_proj_p2_9999999999";
  await upsertCampaigns(T_EUR, [camp("e1")], { source: "sklik", period: "30d", currency: "EUR" });
  await saveSeries(T_EUR, [day("2026-08-01", 999)], { period: "30d" });
  TENANTS = [
    { tenant: T_GOOGLE, source: "google-ads" },
    { tenant: T_EUR, source: "sklik" },
  ];
  const out = await loadProjectState("u1", "p1", "30d");
  assert.equal(out.mixedCurrency, true);
  assert.equal(out.series.length, 2); // the Google section's own two days
  assert.equal(out.series[0].cost, 100);
  assert.deepEqual(
    out.sources.map((s) => s.currency),
    ["CZK", "EUR"]
  );
});

test("a SINGLE-source project is byte-identical: no sources, no mixedCurrency key", async () => {
  TENANTS = [{ tenant: T_GOOGLE, source: "google-ads" }];
  const out = await loadProjectState("u1", "p1", "30d");
  assert.deepEqual(
    Object.keys(out).sort(),
    [
      "campaignSeries",
      "campaigns",
      "changes",
      "histories",
      "meta",
      "reports",
      "series",
      "snapshotSummaries",
      "staleKeys",
    ].sort()
  );
  assert.equal("sources" in out, false);
  assert.equal("mixedCurrency" in out, false);
  assert.equal(out.campaigns.length, 2);
  // the per-tenant read is untouched: rows still carry their tenant's source
  assert.equal(out.campaigns[0].source, "google-ads");
});

test("a never-synced tenant contributes nothing instead of erroring", async () => {
  TENANTS = [
    { tenant: T_GOOGLE, source: "google-ads" },
    { tenant: "u_u1_proj_p1_cold", source: "sklik" },
  ];
  const out = await loadProjectState("u1", "p1", "30d");
  assert.equal(out.campaigns.length, 2);
  assert.equal(out.sources[1].campaigns, 0);
  assert.equal(out.sources[1].meta, null);
  assert.equal(out.mixedCurrency, false);
});
