/** Preview before stage: `buildChangeSet` (no write) split out of `createChangeSet`,
 *  the route's `action: "preview"`, and the `basis` a stage is pinned to.
 *
 *  Before this suite a stage click was the first moment anything was computed, and
 *  it persisted a pending set on the spot: the operator saw the moves only once they
 *  were already a set in the ledger (nothing discards one). The preview runs the SAME
 *  recommend → calibrate → simulate → checkPolicy pipeline and writes NOTHING — no
 *  change-set, no mutator, no credential read. The stage that follows carries the
 *  `basis` (the `SyncMeta.syncedAt` the preview read), and a sync that landed in
 *  between is refused with a typed error and a 409, so the staged set is the one the
 *  operator looked at and never a silently different one.
 *
 *  What is mocked and why: the session, the connector (which tenant a request acts
 *  on), the project guard and the cost model — the route's identity seams — plus the
 *  credential seams (Google connection/token/ads, Sklik connection/token), which only
 *  COUNT here: a preview that reached one of them would be a preview that could write.
 *  The campaign store, the change-set ledger and the route itself are the real code on
 *  a temp LOCAL_DB sqlite file.
 *
 *  Run with --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-change-set-preview-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

/** Every credential read or ads call — a preview must leave all of them at zero. */
const touched = { adsConnection: 0, googleToken: 0, ads: 0, sklikConnection: 0, sklikToken: 0 };
/** The tenant the (mocked) connector resolves a request to, swapped per test. */
let TENANT = "u_u1_proj_p1_1234567890";

mock.module("@/lib/session", {
  namedExports: { currentUserId: async () => "u1", currentUser: async () => null },
});
mock.module("@/lib/campaigns/connector", {
  namedExports: {
    resolveTenant: async () => TENANT,
    resolveCampaignContextForSource: async () => ({ connector: null, tenant: TENANT }),
    resolveProjectTenants: async () => [{ tenant: TENANT, source: "google-ads" }],
  },
});
mock.module("@/lib/projects/api-guard", {
  namedExports: { rejectUnknownProject: async () => null, requireOwnedProject: async () => null },
});
mock.module("@/lib/cost-model/store", { namedExports: { getCostModel: async () => null } });
mock.module("@/lib/campaigns/connection", {
  namedExports: {
    getAdsConnection: async () => {
      touched.adsConnection++;
      return { customerId: "1234567890", customerName: "Acme", connectedAt: "c" };
    },
    getConnectedAccount: async () => null,
  },
});
mock.module("@/lib/google/token", {
  namedExports: {
    getUserAccessToken: async () => {
      touched.googleToken++;
      return "tok";
    },
  },
});
const adsCall = async () => {
  touched.ads++;
};
mock.module("@/lib/google/ads", {
  namedExports: {
    adsConfigured: () => true,
    classifyLiveError: () => null,
    fetchCampaigns: async () => [],
    fetchDailySeriesBundle: async () => null,
    fetchSearchTerms: async () => [],
    pauseCampaign: adsCall,
    resumeCampaign: adsCall,
    setCampaignBudgetMicros: adsCall,
    fetchCampaignBudgets: async () => {
      touched.ads++;
      return new Map();
    },
  },
});
mock.module("@/lib/campaigns/sklik-connection", {
  namedExports: {
    getSklikConnection: async () => {
      touched.sklikConnection++;
      return null;
    },
    getSklikToken: async () => {
      touched.sklikToken++;
      return null;
    },
  },
});

const { TARGET_ROAS } = await import("@/lib/campaigns/types");
const { upsertCampaigns, getSyncMeta } = await import("@/lib/campaigns/store");
const controlPlane = await import("@/lib/campaigns/control-plane");
const { createChangeSet, listChangeSets } = controlPlane;
const { POST } = await import("@/app/api/campaigns/control-plane/route");

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

/** Two under-target donors and two over-target recipients, w1 the better one. */
const PORTFOLIO = [
  camp("d1", { cost: 20_000, roasFactor: 0.5 }),
  camp("d2", { cost: 15_000, roasFactor: 0.6 }),
  camp("w1", { cost: 20_000, roasFactor: 1.8 }),
  camp("w2", { cost: 20_000, roasFactor: 1.3 }),
];

let seeded = 0;
/** A fresh, synced tenant per test (its own key → its own empty ledger). */
async function seedTenant() {
  TENANT = `u_u1_proj_p1_${1_000_000_000 + ++seeded}`;
  await upsertCampaigns(TENANT, PORTFOLIO, { source: "google-ads", network: "google-ads", period: "30d" });
  return TENANT;
}

const post = (body) =>
  POST(
    new Request("http://localhost/api/campaigns/control-plane", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "p1", ...body }),
    })
  );

const zero = () => Object.values(touched).every((n) => n === 0);

test("buildChangeSet returns the moves, the simulation and the basis it read, and persists nothing", async () => {
  const tenant = await seedTenant();
  assert.equal(typeof controlPlane.buildChangeSet, "function", "buildChangeSet is exported");
  const draft = await controlPlane.buildChangeSet(tenant, { scopeCampaignIds: ["d1", "d2"] });
  assert.ok(draft, "two under-target donors yield a draft");
  assert.deepEqual(
    draft.moves.map((m) => m.fromId).sort(),
    ["d1", "d2"],
    "only the scoped campaigns act as donors"
  );
  assert.ok(draft.simulation?.before && draft.simulation?.after, "the projection rides along");
  assert.equal(draft.basis, (await getSyncMeta(tenant)).syncedAt);
  assert.deepEqual(await listChangeSets(tenant), [], "a preview writes no change-set");
  assert.ok(zero(), `a preview reads no credential and calls no ads API: ${JSON.stringify(touched)}`);
});

test('POST {action:"preview"} answers 200 with distinct recipients and the basis, and writes nothing', async () => {
  const tenant = await seedTenant();
  const res = await post({ action: "preview", scopeCampaignIds: ["d1", "d2"] });
  assert.equal(res.status, 200, "today the route answers 400 'Nepodporovaná akce.'");
  const { preview } = await res.json();
  const shifts = preview.moves.filter((m) => m.kind !== "pause");
  assert.equal(shifts.length, 2);
  assert.deepEqual(
    shifts.map((m) => m.toId).sort(),
    ["w1", "w2"],
    "ONE scoped set funds each recipient once — two per-row sets both funded w1"
  );
  assert.ok(preview.simulation.after.conversionValue > preview.simulation.before.conversionValue);
  assert.equal(preview.basis, (await getSyncMeta(tenant)).syncedAt);
  assert.deepEqual(await listChangeSets(tenant), [], "the preview action persisted nothing");
  assert.ok(zero(), `the preview route reads no credential: ${JSON.stringify(touched)}`);
});

test("createChangeSet with a basis a later sync has moved past is refused, typed, and persists nothing", async () => {
  const tenant = await seedTenant();
  assert.equal(typeof controlPlane.BasisMismatchError, "function", "a typed refusal is exported");
  const current = (await getSyncMeta(tenant)).syncedAt;
  await assert.rejects(
    createChangeSet(tenant, { scopeCampaignIds: ["d1"], expectedBasis: "2020-01-01T00:00:00.000Z" }),
    (err) => {
      assert.ok(err instanceof controlPlane.BasisMismatchError);
      assert.equal(err.expected, "2020-01-01T00:00:00.000Z");
      assert.equal(err.actual, current);
      return true;
    }
  );
  assert.deepEqual(await listChangeSets(tenant), [], "nothing staged on a stale basis");
});

test("the route answers a stale basis with 409, and the previewed basis stages exactly ONE pending set", async () => {
  const tenant = await seedTenant();
  const stale = await post({ action: "create", scopeCampaignIds: ["d1", "d2"], basis: "2020-01-01T00:00:00.000Z" });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "conflict");
  assert.deepEqual(await listChangeSets(tenant), []);

  const { preview } = await (await post({ action: "preview", scopeCampaignIds: ["d1", "d2"] })).json();
  const staged = await post({ action: "create", scopeCampaignIds: ["d1", "d2"], basis: preview.basis });
  assert.equal(staged.status, 200);
  const { changeSet } = await staged.json();
  assert.deepEqual(changeSet.moves, preview.moves, "the staged set IS the previewed one");
  const ledger = await listChangeSets(tenant);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].status, "pending");
  assert.equal("basis" in ledger[0], false, "the stored change-set shape is unchanged");
  assert.ok(zero(), `staging is not approving: no credential read: ${JSON.stringify(touched)}`);
});

test("a create without a basis behaves exactly as before (older clients)", async () => {
  const tenant = await seedTenant();
  const res = await post({ action: "create", scopeCampaignIds: ["d1"] });
  assert.equal(res.status, 200);
  assert.equal((await listChangeSets(tenant)).length, 1);
});
