/** WP S1 invariant — the GOOGLE write path is byte-identical after the mutator seam.
 *
 *  `campaigns-control-plane-local-store.test.mjs` is the untouched behavioural pin
 *  (it passes UNMODIFIED). This file pins the two things that suite does not read at
 *  the byte level, and that a rollback of S1 depends on:
 *
 *    1. the AUDIT DOCS — exact keys and values, deep-equal, with NO `platform` key
 *       and the `customerId` / `dailyMovedMicros` fields the pre-S1 code wrote;
 *    2. the SNAPSHOT BLOBS — the legacy `{ budgetResourceName, prevMicros }` shape
 *       with no `platform` key, so an older `restoreBudgets` reads them unchanged;
 *
 *  plus the exact arguments that reach `@/lib/google/ads`, in order. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-google-identity-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { withMetrics, TARGET_ROAS } = await import("@/lib/campaigns/types");

function row(id, { cost, roasFactor, status = "enabled" }) {
  return withMetrics({
    id,
    name: `Kampaň ${id}`,
    type: "search",
    status,
    impressions: 50_000,
    clicks: 1_000,
    cost,
    conversions: roasFactor > 0 ? 20 : 0,
    conversionValue: Math.round(cost * TARGET_ROAS * roasFactor),
  });
}

const CAMPAIGNS = [
  row("z1", { cost: 8_000, roasFactor: 0 }), // zero-return burner → pause move
  row("d1", { cost: 20_000, roasFactor: 0.5 }), // under-performer → shift donor
  row("w1", { cost: 20_000, roasFactor: 1.4 }), // over-performer → recipient
];

const CUSTOMER_ID = "1234567890";
/** Every call that reaches the Google Ads module, in order. */
const adsCalls = [];

mock.module("@/lib/campaigns/store", {
  namedExports: {
    listCampaigns: async () => CAMPAIGNS,
    getSyncMeta: async () => ({ period: "30d", syncedAt: "2026-08-01T00:00:00.000Z", source: "google" }),
  },
});
mock.module("@/lib/campaigns/connection", {
  namedExports: {
    getAdsConnection: async () => ({ customerId: CUSTOMER_ID, customerName: "Acme", connectedAt: "c" }),
  },
});
mock.module("@/lib/google/token", { namedExports: { getUserAccessToken: async () => "tok" } });
mock.module("@/lib/google/ads", {
  namedExports: {
    adsConfigured: () => true,
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

const { tenantDocs } = await import("@/lib/tenant-docs/backend");
const { createChangeSet, listChangeSets, approveChangeSet, revertChangeSet } = await import(
  "@/lib/campaigns/control-plane"
);

const USER = "u1";
const T = "u_u1_proj_p1_1234567890";

async function auditDocs(tenant) {
  const rows = await (await tenantDocs()).listDocs(tenant, "mutations", { orderBy: { field: "at", dir: "desc" } });
  // `at` is a wall clock and `id` is the store's; everything else is the contract.
  return rows.map(({ data }) => {
    const { at, ...rest } = data;
    assert.equal(typeof at, "string", "every audit doc is stamped");
    return rest;
  });
}

test("[S1 identity] the Google apply writes the SAME audit docs and snapshot blobs as before the seam", async () => {
  const tenant = `${T}_identity`;
  adsCalls.length = 0;
  const cs = await createChangeSet(tenant);
  const applied = await approveChangeSet(tenant, USER, cs.id);
  assert.equal(applied.status, "applied");

  // --- 1. the audit docs, key for key ---
  const docs = await auditDocs(tenant);
  const pause = docs.find((d) => d.action === "pause");
  const shift = docs.find((d) => d.action === "budget_shift");
  assert.deepEqual(pause, {
    action: "pause",
    campaignId: "z1",
    campaignName: "Kampaň z1",
    customerId: CUSTOMER_ID,
    userId: USER,
  });
  assert.deepEqual(shift, {
    action: "budget_shift",
    fromId: "d1",
    fromName: "Kampaň d1",
    toId: "w1",
    toName: "Kampaň w1",
    dailyMovedMicros: 266_666_667,
    customerId: CUSTOMER_ID,
    userId: USER,
  });
  for (const d of docs) {
    assert.equal("platform" in d, false, "a Google audit doc must carry NO platform key");
  }

  // --- 2. the snapshot blobs, exactly the legacy shape ---
  assert.deepEqual(applied.budgetSnapshots, [
    { budgetResourceName: "customers/1/campaignBudgets/d1", prevMicros: 500_000_000 },
    { budgetResourceName: "customers/1/campaignBudgets/w1", prevMicros: 500_000_001 },
  ]);
  assert.deepEqual(applied.statusSnapshots, [
    { campaignId: "z1", campaignName: "Kampaň z1", prevStatus: "enabled" },
  ]);
  for (const s of [...applied.budgetSnapshots, ...applied.statusSnapshots]) {
    assert.equal("platform" in s, false, "a rolled-back deploy must read these unchanged");
  }
  for (const r of applied.results) {
    assert.equal("platform" in r, false, "and so must the stored per-move results");
  }

  // --- 3. the calls that reached Google Ads, in order and argument for argument ---
  // Move order is the recommender's: d1 destroys more (10 000 CZK of waste) than the
  // 8 000 CZK burner z1, so the shift runs first and the pause second.
  assert.deepEqual(adsCalls, [
    ["fetchCampaignBudgets", ["tok", CUSTOMER_ID, ["d1", "w1"]]],
    ["setCampaignBudgetMicros", ["tok", CUSTOMER_ID, "customers/1/campaignBudgets/d1", 233_333_333]],
    ["setCampaignBudgetMicros", ["tok", CUSTOMER_ID, "customers/1/campaignBudgets/w1", 766_666_668]],
    ["pauseCampaign", ["tok", CUSTOMER_ID, "z1"]],
  ]);
});

test("[S1 identity] the Google revert restores exact micros and audits budget_restore unchanged", async () => {
  const tenant = `${T}_identity`;
  adsCalls.length = 0;
  const [applied] = await listChangeSets(tenant);
  const reverted = await revertChangeSet(tenant, USER, applied.id);
  assert.equal(reverted.status, "reverted");

  assert.deepEqual(adsCalls, [
    ["setCampaignBudgetMicros", ["tok", CUSTOMER_ID, "customers/1/campaignBudgets/d1", 500_000_000]],
    ["setCampaignBudgetMicros", ["tok", CUSTOMER_ID, "customers/1/campaignBudgets/w1", 500_000_001]],
    ["resumeCampaign", ["tok", CUSTOMER_ID, "z1"]],
  ]);

  const docs = await auditDocs(tenant);
  assert.deepEqual(
    docs.find((d) => d.action === "budget_restore"),
    {
      action: "budget_restore",
      budgets: ["customers/1/campaignBudgets/d1", "customers/1/campaignBudgets/w1"],
      customerId: CUSTOMER_ID,
      userId: USER,
    }
  );
  assert.deepEqual(docs.find((d) => d.action === "resume"), {
    action: "resume",
    campaignId: "z1",
    campaignName: "Kampaň z1",
    customerId: CUSTOMER_ID,
    userId: USER,
  });
});

test("[S1 identity] a LEGACY snapshot blob (no platform key) still reverts — the rollback contract", async () => {
  const tenant = `${T}_legacy`;
  adsCalls.length = 0;
  const cs = await createChangeSet(tenant);
  const applied = await approveChangeSet(tenant, USER, cs.id);
  // Overwrite the persisted evidence with the literal pre-S1 blob shape, then revert
  // through the NEW code: absent `platform` must read as Google, not as unknown.
  await (await tenantDocs()).setDoc(
    tenant,
    "changeSets",
    applied.id,
    { budgetSnapshots: [{ budgetResourceName: "customers/1/campaignBudgets/legacy", prevMicros: 42_000_000 }] },
    { merge: true }
  );
  adsCalls.length = 0;
  const reverted = await revertChangeSet(tenant, USER, applied.id);
  assert.equal(reverted.status, "reverted");
  assert.deepEqual(adsCalls[0], [
    "setCampaignBudgetMicros",
    ["tok", CUSTOMER_ID, "customers/1/campaignBudgets/legacy", 42_000_000],
  ]);
});

test("[S1 identity] the Google activity strings are unchanged", async () => {
  const { listActivity } = await import("@/lib/campaigns/activity");
  const records = (await listActivity(`${T}_identity`)).records;
  assert.ok(
    records.some((r) => r.detail === "Kampaň byla pozastavena v Google Ads."),
    "the network name is now templated from the mutator — and still renders identically"
  );
  assert.ok(
    records.some((r) => r.detail === "Kampaň byla znovu spuštěna v Google Ads (vrácení změnového balíčku)."),
  );
});
