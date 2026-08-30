/** WP S1 — the whole governance envelope on a SKLIK tenant, end to end against the
 *  real per-tenant store on the LOCAL_DB backend: propose → approve → the actual
 *  wire calls → the snapshots → revert → the restoring wire calls.
 *
 *  What is mocked and why: the campaign READ (`listCampaigns`/`getSyncMeta`, so the
 *  portfolio is a fixture) and the Sklik CREDENTIAL store. The Sklik TRANSPORT is
 *  injected, not mocked, so the real `SklikClient` runs — login handshake, the
 *  isolated method constants, the status envelope — and every `[method, params]`
 *  that would go on the wire is recorded and asserted. Everything else (the claim
 *  policy, the apply loop, budget math, the audit appends, the activity feed) is the
 *  real code, on the real sqlite twin.
 *
 *  Deliberately mirrors campaigns-control-plane-local-store.test.mjs, which is left
 *  UNTOUCHED as the Google byte-identity pin. */
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-sklik-control-plane-${process.pid}.db`);
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

/** Two Sklik campaigns with NUMERIC ids (the adapter stringifies Sklik's own ids)
 *  and no zero-return burner, so the recommender proposes exactly ONE shift — the
 *  acceptance scenario: one move, two budget writes. */
const CAMPAIGNS = [
  withMetrics({
    id: "101",
    name: "Kampaň 101",
    type: "search",
    status: "enabled",
    impressions: 50_000,
    clicks: 1_000,
    cost: 20_000,
    conversions: 20,
    conversionValue: Math.round(20_000 * TARGET_ROAS * 0.5),
    budgetPerDay: 1000,
    source: "sklik",
  }),
  withMetrics({
    id: "102",
    name: "Kampaň 102",
    type: "search",
    status: "enabled",
    impressions: 50_000,
    clicks: 1_000,
    cost: 20_000,
    conversions: 20,
    conversionValue: Math.round(20_000 * TARGET_ROAS * 1.4),
    budgetPerDay: 500,
    source: "sklik",
  }),
];

let SKLIK_CONNECTION = { tokenEnc: "x", connectedAt: "c", moneyVerdict: "czk-plausible" };

mock.module("@/lib/campaigns/store", {
  namedExports: {
    listCampaigns: async () => CAMPAIGNS,
    getSyncMeta: async () => ({ period: "30d", syncedAt: "2026-08-01T00:00:00.000Z", source: "sklik" }),
  },
});
mock.module("@/lib/campaigns/sklik-connection", {
  namedExports: {
    getSklikConnection: async () => SKLIK_CONNECTION,
    getSklikToken: async () => "sklik-tok",
  },
});

const { tenantDocs } = await import("@/lib/tenant-docs/backend");
const { createChangeSet, listChangeSets, approveChangeSet, revertChangeSet } = await import(
  "@/lib/campaigns/control-plane"
);
const { setSklikTransport, resetSklikTransport, SKLIK_WRITES_ENV } = await import("@/lib/campaigns/mutator");
const { SKLIK_CAMPAIGN_UPDATE_METHOD } = await import("@/lib/sklik/client");

const USER = "u1";
const T = "u_u1_proj_p1_sklik";

/** The live Sklik account, as a fixture: current day budgets, and a log of every
 *  call. `updateMethod` mis-set is the rail-1 failure mode. */
function fixtureAccount({ updateMethod = SKLIK_CAMPAIGN_UPDATE_METHOD } = {}) {
  const calls = [];
  const budgets = new Map([
    [101, 1000],
    [102, 500],
  ]);
  let n = 0;
  return {
    calls,
    budgets,
    methods: () => calls.map((c) => c.method),
    updates: () => calls.filter((c) => c.method === SKLIK_CAMPAIGN_UPDATE_METHOD).map((c) => c.params[1]),
    async call(method, params) {
      calls.push({ method, params });
      if (method === "client.loginByToken") return { session: `sess-${++n}`, status: 200 };
      if (method === "campaigns.list") {
        return {
          session: `sess-${++n}`,
          status: 200,
          campaigns: [...budgets].map(([id, dayBudget]) => ({
            id,
            name: `Kampaň ${id}`,
            status: "active",
            type: "fulltext",
            dayBudget,
            deleted: false,
          })),
        };
      }
      if (method === updateMethod) {
        for (const c of params[1]) if (c.dayBudget != null) budgets.set(c.id, c.dayBudget);
        return { session: `sess-${++n}`, status: 200 };
      }
      throw new Error(`unexpected Sklik method ${method}`);
    },
  };
}

beforeEach(() => {
  SKLIK_CONNECTION = { tokenEnc: "x", connectedAt: "c", moneyVerdict: "czk-plausible" };
  delete process.env[SKLIK_WRITES_ENV];
  resetSklikTransport();
});

// --- the acceptance scenario: apply, then revert -------------------------------

test("[S1] a Sklik change-set applies through the fixture transport with the exact wire calls", async () => {
  const tenant = `${T}_apply`;
  process.env[SKLIK_WRITES_ENV] = "1";
  const acct = fixtureAccount();
  setSklikTransport(() => acct);

  const cs = await createChangeSet(tenant);
  assert.equal(cs.moves.length, 1, "one shift: 101 → 102");
  assert.equal(cs.moves[0].fromId, "101");
  assert.equal(cs.moves[0].toId, "102");
  assert.equal(cs.moves[0].fromSource, "sklik", "the move carries its network");
  assert.equal(cs.moves[0].toSource, "sklik");
  assert.deepEqual(cs.violations, [], "a same-network shift is not a cross-source breach");

  const applied = await approveChangeSet(tenant, USER, cs.id);
  assert.equal(applied.status, "applied");
  assert.ok(applied.results.every((r) => r.ok), applied.results[0]?.error);

  // The exact call sequence the acceptance criterion names.
  assert.deepEqual(acct.methods(), [
    "client.loginByToken",
    "campaigns.list",
    SKLIK_CAMPAIGN_UPDATE_METHOD,
    SKLIK_CAMPAIGN_UPDATE_METHOD,
  ]);
  // 8000 CZK over 30 days = 266.666… CZK/day off a 1000 CZK/day donor → 733 stays,
  // 267 moves, and the recipient is funded with EXACTLY what the donor gave up.
  assert.deepEqual(acct.updates(), [[{ id: 101, dayBudget: 733 }], [{ id: 102, dayBudget: 767 }]]);
  assert.equal(1000 - 733, 767 - 500, "the two ends net to zero — no koruna invented by rounding");
  assert.equal(typeof acct.updates()[0][0].id, "number", "numeric ids on the wire");

  // Snapshots are the Sklik shape, in native CZK.
  assert.deepEqual(applied.budgetSnapshots, [
    { platform: "sklik", campaignId: "101", prevDayBudgetCzk: 1000 },
    { platform: "sklik", campaignId: "102", prevDayBudgetCzk: 500 },
  ]);
  assert.equal(applied.results[0].platform, "sklik", "the stored result is tagged");

  // …and the audit doc carries platform + dailyMovedCzk, never micros.
  const rows = await (await tenantDocs()).listDocs(tenant, "mutations", { orderBy: { field: "at", dir: "desc" } });
  assert.equal(rows.length, 1);
  const doc = rows[0].data;
  assert.equal(doc.action, "budget_shift");
  assert.equal(doc.platform, "sklik");
  assert.equal(doc.dailyMovedCzk, 267);
  assert.equal(doc.dailyMovedMicros, undefined, "Sklik audit docs never speak micros");
  assert.equal(doc.customerId, undefined, "there is no Google customer here to name");
});

test("[S1] reverting the Sklik set restores both budgets to their exact prior CZK", async () => {
  const tenant = `${T}_apply`;
  process.env[SKLIK_WRITES_ENV] = "1";
  const acct = fixtureAccount();
  acct.budgets.set(101, 733); // the account as the apply above left it
  acct.budgets.set(102, 767);
  setSklikTransport(() => acct);

  const [applied] = await listChangeSets(tenant);
  const reverted = await revertChangeSet(tenant, USER, applied.id);
  assert.equal(reverted.status, "reverted");

  assert.deepEqual(acct.updates(), [[{ id: 101, dayBudget: 1000 }], [{ id: 102, dayBudget: 500 }]]);
  assert.equal(acct.budgets.get(101), 1000, "the fixture account is back where it started");
  assert.equal(acct.budgets.get(102), 500);
  assert.equal(
    acct.methods().filter((m) => m === "campaigns.list").length,
    0,
    "a restore is an ABSOLUTE write — it never re-reads and re-floors"
  );

  const rows = await (await tenantDocs()).listDocs(tenant, "mutations", { orderBy: { field: "at", dir: "desc" } });
  const restore = rows.find((r) => r.data.action === "budget_restore");
  assert.deepEqual(restore.data.budgets, ["101", "102"], "keyed by CAMPAIGN id — Sklik has no budget resource");
  assert.equal(restore.data.platform, "sklik");
});

// --- the rails, as refusals through the whole envelope -------------------------

test("[S1 rail 3] RED: with writes disabled, approving a Sklik set fails it and touches NOTHING", async () => {
  const tenant = `${T}_flagoff`;
  const acct = fixtureAccount();
  setSklikTransport(() => acct);

  const cs = await createChangeSet(tenant);
  const applied = await approveChangeSet(tenant, USER, cs.id);

  assert.equal(applied.status, "failed", "an all-refused set settles failed, never a snapshot-less 'applied'");
  assert.equal(
    applied.results[0].error,
    "Úpravy kampaní pro Sklik zatím nejsou podporované. Dostupné jsou jen pro Google Ads."
  );
  assert.equal(acct.calls.length, 0, "zero wire calls — not even a login");
  assert.deepEqual(applied.budgetSnapshots, [], "nothing landed, so there is nothing to revert");
  const rows = await (await tenantDocs()).listDocs(tenant, "mutations", {});
  assert.equal(rows.length, 0, "a refusal writes NO audit doc");
});

test("[S1 rail 2] RED: an unsettled money unit fails the set with the next step, and zero updates", async () => {
  const tenant = `${T}_unit`;
  process.env[SKLIK_WRITES_ENV] = "1";
  SKLIK_CONNECTION = { tokenEnc: "x", connectedAt: "c", moneyVerdict: "halere-suspected" };
  const acct = fixtureAccount();
  setSklikTransport(() => acct);

  const cs = await createChangeSet(tenant);
  const applied = await approveChangeSet(tenant, USER, cs.id);

  assert.equal(applied.status, "failed");
  assert.match(applied.results[0].error, /měnová jednotka/);
  assert.equal(acct.updates().length, 0, "no campaigns.update reached the account");
  assert.equal((await (await tenantDocs()).listDocs(tenant, "mutations", {})).length, 0);
});

test("[S1 rail 1] RED: a wrong method constant degrades to a failed set, not a corrupted account", async () => {
  const tenant = `${T}_method`;
  process.env[SKLIK_WRITES_ENV] = "1";
  const acct = fixtureAccount({ updateMethod: "campaign.update" });
  setSklikTransport(() => acct);

  const cs = await createChangeSet(tenant);
  const applied = await approveChangeSet(tenant, USER, cs.id);

  assert.equal(applied.status, "failed");
  assert.match(applied.results[0].error, /unexpected Sklik method/);
  assert.equal(acct.budgets.get(101), 1000, "the donor's budget is untouched");
  assert.equal(acct.budgets.get(102), 500, "and so is the recipient's");
  assert.deepEqual(applied.budgetSnapshots, [], "no snapshot, so revert is refused rather than guessing");
  assert.equal((await (await tenantDocs()).listDocs(tenant, "mutations", {})).length, 0, "no audit for a write that never landed");
});

test("[S1] a failed recipient write rolls the donor back and audits the attempt", async () => {
  const tenant = `${T}_rollback`;
  process.env[SKLIK_WRITES_ENV] = "1";
  const acct = fixtureAccount();
  let updates = 0;
  const failing = {
    ...acct,
    async call(method, params) {
      // fail the SECOND update only — the recipient's
      if (method === SKLIK_CAMPAIGN_UPDATE_METHOD && ++updates === 2) {
        return { status: 403, statusMessage: "denied" };
      }
      return acct.call.call(acct, method, params);
    },
  };
  setSklikTransport(() => failing);

  const cs = await createChangeSet(tenant);
  const applied = await approveChangeSet(tenant, USER, cs.id);

  assert.equal(applied.status, "failed");
  assert.match(applied.results[0].error, /vrácen na původní hodnotu/);
  assert.equal(acct.budgets.get(101), 1000, "the donor was restored — a real campaign is never left starved");

  const rows = await (await tenantDocs()).listDocs(tenant, "mutations", {});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.action, "budget_shift_failed");
  assert.equal(rows[0].data.platform, "sklik");
  assert.equal(rows[0].data.fromPrevDayBudgetCzk, 1000);
  assert.equal(rows[0].data.fromAttemptedDayBudgetCzk, 733);
  assert.equal(rows[0].data.donorRolledBack, true);
});

test("[S1] the MIN_DAILY_CZK floor is the SAME floor on both networks", async () => {
  const tenant = `${T}_floor`;
  process.env[SKLIK_WRITES_ENV] = "1";
  const acct = fixtureAccount();
  acct.budgets.set(101, 10); // the donor is already AT the 10 CZK/day floor
  setSklikTransport(() => acct);

  const cs = await createChangeSet(tenant);
  const applied = await approveChangeSet(tenant, USER, cs.id);
  assert.equal(applied.status, "failed");
  assert.equal(applied.results[0].error, "Zdrojová kampaň už má minimální rozpočet.");
  assert.equal(acct.updates().length, 0, "at_min refuses BEFORE any write");
});
