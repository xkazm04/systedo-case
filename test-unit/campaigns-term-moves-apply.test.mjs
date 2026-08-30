/** WP S1b — the query-level change-set END TO END on the real per-tenant store
 *  (LOCAL_DB sqlite twin): propose from stored search terms → approve → the exact
 *  criterion calls that reach the ads layer → the snapshots → revert → the removals.
 *
 *  What is mocked and why: the Google Ads WRITE layer (@/lib/google/ads) plus the
 *  token/connection lookups, and the campaign + search-term READ. Everything else —
 *  the recommender, the claim policy, the apply loop, the incremental evidence
 *  writes, the audit appends, the settle rules — is the real code on the real store.
 *  The mocked ads layer RECORDS every call, so the sequence and the arguments are
 *  asserted rather than assumed.
 *
 *  Deliberately mirrors campaigns-control-plane-local-store.test.mjs (the Google
 *  byte-identity pin), which S1b leaves UNTOUCHED — as does S1's Sklik twin. */
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-term-moves-${process.pid}.db`);
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

const CUSTOMER_ID = "1234567890";

/** One healthy campaign: nothing for the BUDGET recommender to act on, so any move a
 *  set contains demonstrably came from the search terms. */
const CAMPAIGNS = [
  withMetrics({
    id: "11",
    name: "Kampaň A",
    type: "search",
    status: "enabled",
    impressions: 50_000,
    clicks: 1_000,
    cost: 20_000,
    conversions: 20,
    conversionValue: Math.round(20_000 * TARGET_ROAS),
  }),
];

/** The acceptance fixture: exactly one negative and one promote. */
const TERMS = [
  {
    term: "levné boty",
    campaignId: "11",
    campaignName: "Kampaň A",
    adGroupId: "22",
    adGroupName: "Sestava B",
    matchType: "BROAD",
    cost: 900,
    clicks: 40,
    impressions: 1200,
    conversions: 0,
    conversionValue: 0,
  },
  {
    term: "boty na běh",
    campaignId: "11",
    campaignName: "Kampaň A",
    adGroupId: "22",
    adGroupName: "Sestava B",
    matchType: "PHRASE",
    cost: 3000,
    clicks: 90,
    impressions: 4000,
    conversions: 3,
    conversionValue: 9000,
  },
];

let SYNC_SOURCE = "google";
let STORED_TERMS = TERMS;
/** Every criterion call that reached the ads layer, in order. */
let adsCalls = [];
/** When set, the next `addCampaignNegativeKeyword` throws this message. */
let failNegative = null;

mock.module("@/lib/campaigns/store", {
  namedExports: {
    listCampaigns: async () => CAMPAIGNS,
    getSyncMeta: async () => ({ period: "30d", syncedAt: "2026-08-01T00:00:00.000Z", source: SYNC_SOURCE }),
    getSearchTerms: async () => STORED_TERMS,
  },
});
mock.module("@/lib/campaigns/connection", {
  namedExports: {
    getAdsConnection: async () => ({
      customerId: CUSTOMER_ID,
      customerName: "Acme",
      connectedAt: "2026-01-01T00:00:00.000Z",
    }),
  },
});
mock.module("@/lib/google/token", { namedExports: { getUserAccessToken: async () => "tok" } });
// Present so the Sklik refusal below is reached through the REAL three write rails
// (switch on, connection present, money unit settled) rather than short-circuiting on
// a missing credential — the refusal must be the CAPABILITY one, not a connect prompt.
mock.module("@/lib/campaigns/sklik-connection", {
  namedExports: {
    getSklikConnection: async () => ({ tokenEnc: "x", connectedAt: "c", moneyVerdict: "czk-plausible" }),
    getSklikToken: async () => "sklik-tok",
  },
});
mock.module("@/lib/google/ads", {
  namedExports: {
    adsConfigured: () => true,
    pauseCampaign: async () => {},
    resumeCampaign: async () => {},
    setCampaignBudgetMicros: async () => {},
    fetchCampaignBudgets: async () => new Map(),
    addCampaignNegativeKeyword: async (token, cid, campaignId, term) => {
      adsCalls.push(["addCampaignNegativeKeyword", cid, campaignId, term]);
      if (failNegative) throw new Error(failNegative);
      return `customers/${cid}/campaignCriteria/${campaignId}~987`;
    },
    addAdGroupExactKeyword: async (token, cid, adGroupId, term) => {
      adsCalls.push(["addAdGroupExactKeyword", cid, adGroupId, term]);
      return `customers/${cid}/adGroupCriteria/${adGroupId}~654`;
    },
    removeCriterion: async (token, cid, resourceName) => {
      adsCalls.push(["removeCriterion", resourceName]);
    },
  },
});

const { tenantDocs } = await import("@/lib/tenant-docs/backend");
const { createChangeSet, listChangeSets, approveChangeSet, revertChangeSet } = await import(
  "@/lib/campaigns/control-plane"
);
const { CRITERION_UNSUPPORTED } = await import("@/lib/campaigns/mutations");
const { SKLIK_WRITES_ENV, sklikMutator, canWriteCriteria, googleMutator } = await import(
  "@/lib/campaigns/mutator"
);

const USER = "u1";
const BASE = "u_u1_proj_p1_1234567890";

beforeEach(() => {
  adsCalls = [];
  failNegative = null;
  SYNC_SOURCE = "google";
  STORED_TERMS = TERMS;
});

// --- creation: the terms recommender fills the set ------------------------------

test("[S1b] moveSource:'terms' proposes criterion moves from the STORED terms", async () => {
  const tenant = `${BASE}_create`;
  const cs = await createChangeSet(tenant, { moveSource: "terms" });
  assert.ok(cs, "the fixture yields a proposal");
  assert.deepEqual(
    cs.moves.map((m) => [m.kind, m.criterion.term]),
    [
      ["negative", "levné boty"],
      ["promote", "boty na běh"],
    ]
  );
  // The projection is an exact identity — a criterion move shifts no budget, and the
  // approval screen must not show a lift that the model cannot justify.
  assert.deepEqual(cs.simulation.after, cs.simulation.before);
  assert.equal(cs.status, "pending");

  const [stored] = await listChangeSets(tenant);
  assert.equal(stored.moves[0].criterion.term, "levné boty", "criterion survives the JSON roundtrip");
  assert.equal(stored.moves[1].criterion.adGroupId, "22");
});

test("[S1b] the default moveSource is unchanged (the BUDGET recommender)", async () => {
  const tenant = `${BASE}_default`;
  // The single healthy campaign gives the budget recommender nothing to do, which is
  // exactly how we know the default path did NOT quietly read the search terms.
  assert.equal(await createChangeSet(tenant), null);
});

test("[S1b] an empty term store proposes nothing rather than inventing a move", async () => {
  STORED_TERMS = [];
  assert.equal(await createChangeSet(`${BASE}_noterms`, { moveSource: "terms" }), null);
});

// --- apply: the exact calls, in order, with a snapshot before the next move ------

test("[S1b] approve writes negative THEN exact, and records both resource names", async () => {
  const tenant = `${BASE}_life`;
  const cs = await createChangeSet(tenant, { moveSource: "terms" });
  const applied = await approveChangeSet(tenant, USER, cs.id);

  assert.equal(applied.status, "applied");
  assert.deepEqual(
    adsCalls,
    [
      ["addCampaignNegativeKeyword", CUSTOMER_ID, "11", "levné boty"],
      ["addAdGroupExactKeyword", CUSTOMER_ID, "22", "boty na běh"],
    ],
    "waste is stopped before anything is added — the recommender's order, honoured"
  );
  assert.equal(applied.results.length, 2);
  assert.ok(applied.results.every((r) => r.ok));
  assert.equal(applied.criterionSnapshots.length, 2);
  assert.deepEqual(applied.criterionSnapshots[0], {
    platform: "google-ads",
    resourceName: `customers/${CUSTOMER_ID}/campaignCriteria/11~987`,
    campaignId: "11",
    term: "levné boty",
    action: "negative",
  });
  assert.deepEqual(applied.criterionSnapshots[1], {
    platform: "google-ads",
    resourceName: `customers/${CUSTOMER_ID}/adGroupCriteria/22~654`,
    campaignId: "11",
    adGroupId: "22",
    term: "boty na běh",
    action: "promote",
  });
  // A criterion-only set captures neither of the older snapshot kinds.
  assert.deepEqual(applied.budgetSnapshots, []);
  assert.deepEqual(applied.statusSnapshots, []);

  const [stored] = await listChangeSets(tenant);
  assert.equal(stored.criterionSnapshots.length, 2, "the snapshots are persisted, not only returned");

  const audit = await (await tenantDocs()).listDocs(tenant, "mutations", {
    orderBy: { field: "at", dir: "desc" },
  });
  assert.deepEqual(
    audit.map((r) => r.data.action),
    ["criterion_add", "criterion_add"],
    "one audit row per live criterion write"
  );
  assert.equal(audit.find((r) => r.data.criterionAction === "negative").data.term, "levné boty");
  assert.equal(audit[0].data.customerId, CUSTOMER_ID, "the Google audit fields ride along unchanged");
});

test("[S1b] revert removes both criteria in REVERSE order and settles 'reverted'", async () => {
  const tenant = `${BASE}_life`;
  const [applied] = await listChangeSets(tenant);
  const reverted = await revertChangeSet(tenant, USER, applied.id);

  assert.equal(reverted.status, "reverted");
  assert.ok(reverted.revertedAt);
  assert.deepEqual(adsCalls, [
    ["removeCriterion", `customers/${CUSTOMER_ID}/adGroupCriteria/22~654`],
    ["removeCriterion", `customers/${CUSTOMER_ID}/campaignCriteria/11~987`],
  ]);
  assert.ok(reverted.results.every((r) => r.ok));

  const audit = await (await tenantDocs()).listDocs(tenant, "mutations", {
    orderBy: { field: "at", dir: "desc" },
  });
  const removal = audit.find((r) => r.data.action === "criterion_remove");
  assert.ok(removal, "the removal is audited");
  assert.equal(removal.data.resourceNames.length, 2);

  // …and it is terminal.
  const noop = await revertChangeSet(tenant, USER, applied.id);
  assert.equal(noop.status, "reverted");
});

test("[S1b] a PARTIAL apply is still revertable — the landed criterion is not stranded", async () => {
  const tenant = `${BASE}_partial`;
  failNegative = "Google Ads addCampaignNegativeKeyword 400: bad";
  const cs = await createChangeSet(tenant, { moveSource: "terms" });
  const applied = await approveChangeSet(tenant, USER, cs.id);

  assert.equal(applied.status, "applied", "one move landed, so the set is applied, not failed");
  assert.deepEqual(applied.results.map((r) => r.ok), [false, true]);
  assert.equal(applied.criterionSnapshots.length, 1, "only the criterion that was really created");
  assert.equal(applied.criterionSnapshots[0].action, "promote");

  adsCalls = [];
  const reverted = await revertChangeSet(tenant, USER, applied.id);
  assert.equal(reverted.status, "reverted");
  assert.deepEqual(adsCalls, [["removeCriterion", `customers/${CUSTOMER_ID}/adGroupCriteria/22~654`]]);
});

test("[S1b] an ALL-FAILED criterion apply settles 'failed' with nothing to revert", async () => {
  const tenant = `${BASE}_allfail`;
  STORED_TERMS = [TERMS[0]]; // negative only, and the negative is rigged to fail
  failNegative = "Google Ads addCampaignNegativeKeyword 403: denied";
  const cs = await createChangeSet(tenant, { moveSource: "terms" });
  const applied = await approveChangeSet(tenant, USER, cs.id);

  assert.equal(applied.status, "failed");
  assert.deepEqual(applied.criterionSnapshots, []);
  assert.equal(applied.results[0].ok, false);
  // A `failed` set is terminal: the revert is an idempotent no-op, not an inverse
  // apply of moves that demonstrably never landed.
  adsCalls = [];
  const noop = await revertChangeSet(tenant, USER, cs.id);
  assert.equal(noop.status, "failed");
  assert.deepEqual(adsCalls, [], "nothing was removed, because nothing was created");
});

// --- Sklik: the honest refusal --------------------------------------------------

test("[S1b] the Sklik mutator declares NO criterion capability", () => {
  // A never-called transport: if this test ever reached the network it would throw.
  const client = { setCampaignStatus: async () => {}, readCampaignBudgets: async () => new Map(), setCampaignDayBudget: async () => {} };
  const sklik = sklikMutator(client);
  assert.equal(sklik.addNegativeKeyword, undefined);
  assert.equal(sklik.addExactKeyword, undefined);
  assert.equal(sklik.removeCriterion, undefined);
  assert.equal(canWriteCriteria(sklik), false, "omission is the honest implementation, not a guessed RPC name");
  assert.equal(canWriteCriteria(googleMutator({ customerId: CUSTOMER_ID, token: "t" })), true);
});

test("[S1b] a Sklik tenant's criterion set settles 'failed' with a clean refusal", async () => {
  const tenant = `${BASE}_sklik`;
  // Build the set as Google (so the recommender runs), then flip the tenant's recorded
  // source to Sklik: exactly the state a set carried across a network switch would be
  // in, and the one place the refusal has to hold.
  const cs = await createChangeSet(tenant, { moveSource: "terms" });
  SYNC_SOURCE = "sklik";
  process.env[SKLIK_WRITES_ENV] = "1";
  try {
    const applied = await approveChangeSet(tenant, USER, cs.id);
    assert.equal(applied.status, "failed", "nothing was written, so the set says so");
    assert.ok(applied.results.every((r) => !r.ok));
    assert.equal(applied.results[0].error, CRITERION_UNSUPPORTED);
    assert.equal(CRITERION_UNSUPPORTED, "Klíčová slova ve Skliku zatím neupravujeme.");
    assert.deepEqual(adsCalls, [], "no Google call was made for a Sklik tenant either");
    const audit = await (await tenantDocs()).listDocs(tenant, "mutations", {
      orderBy: { field: "at", dir: "desc" },
    });
    assert.equal(audit.length, 0, "a refusal writes no audit doc — nothing happened to audit");
  } finally {
    delete process.env[SKLIK_WRITES_ENV];
  }
});
