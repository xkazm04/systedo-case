/** WP S1 — the write SEAM and its three rails.
 *
 *  `mutatorForTenant` is the one place that decides whether a tenant's writes go to
 *  Google Ads, to Sklik, or nowhere. Because this is the first code in the repo that
 *  can change a real Sklik account, each of the three rails is pinned RED (the state
 *  where a write must be impossible) next to GREEN (the state where it is allowed),
 *  so no rail can be removed without a test going red:
 *
 *    rail 1 — the wire method constants degrade (proved end to end here: an unknown
 *             method surfaces as a throw the mutation layer turns into ok:false;
 *             the exact payloads are pinned in sklik-writes.test.mjs)
 *    rail 2 — a Sklik write is refused unless the money-unit verdict is settled
 *    rail 3 — SKLIK_WRITES_ENABLED, default OFF, only "1" arms it
 *
 *  What is mocked and why: the credential seams only — the tenant's sync meta, the
 *  Google connection/token, and the Sklik connection/token. The mutator, the rails
 *  and the real SklikClient are the code under test; the Sklik transport is injected
 *  as a fixture, so nothing here can reach the network. */
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { contract } from "./contract.mjs";

/** What a failure on rail 3 MEANS. `no-live-ad-writes` is the row in
 *  .github/constraint-map.json for the one boundary in this repository where being
 *  wrong spends an advertiser's budget, and this file is the fence it names — so a
 *  red assertion below cites the rule, its rung and where it is stated, rather than
 *  reporting that a boolean differed. See test-unit/contract.mjs. */
const liveAdWrites = contract("no-live-ad-writes");

let SYNC_SOURCE = "google";
let GOOGLE_CONFIGURED = true;
let GOOGLE_CONNECTION = { customerId: "1234567890" };
let GOOGLE_TOKEN = "tok";
let SKLIK_CONNECTION = { tokenEnc: "x", connectedAt: "2026-01-01T00:00:00.000Z", moneyVerdict: "czk-plausible" };
let SKLIK_TOKEN = "sklik-tok";

mock.module("@/lib/campaigns/store", {
  namedExports: {
    getSyncMeta: async () => ({ period: "30d", syncedAt: "2026-08-01T00:00:00.000Z", source: SYNC_SOURCE }),
    listCampaigns: async () => [],
  },
});
mock.module("@/lib/campaigns/connection", {
  namedExports: { getAdsConnection: async () => GOOGLE_CONNECTION },
});
mock.module("@/lib/google/token", { namedExports: { getUserAccessToken: async () => GOOGLE_TOKEN } });
mock.module("@/lib/google/ads", {
  namedExports: {
    adsConfigured: () => GOOGLE_CONFIGURED,
    pauseCampaign: async () => {},
    resumeCampaign: async () => {},
    setCampaignBudgetMicros: async () => {},
    fetchCampaignBudgets: async () => new Map(),
  },
});
mock.module("@/lib/campaigns/sklik-connection", {
  namedExports: {
    getSklikConnection: async () => SKLIK_CONNECTION,
    getSklikToken: async () => SKLIK_TOKEN,
  },
});

const {
  mutatorForTenant,
  sklikWritable,
  sklikWritesEnabled,
  setSklikTransport,
  resetSklikTransport,
  SKLIK_WRITES_ENV,
} = await import("@/lib/campaigns/mutator");
const { SKLIK_CAMPAIGN_UPDATE_METHOD } = await import("@/lib/sklik/client");

const TENANT = "u_u1_proj_p1_sklik";
const USER = "u1";

function fixtureTransport({ updateMethod = SKLIK_CAMPAIGN_UPDATE_METHOD } = {}) {
  const calls = [];
  let n = 0;
  return {
    calls,
    async call(method, params) {
      calls.push({ method, params });
      if (method === "client.loginByToken") return { session: `sess-${++n}`, status: 200 };
      if (method === "campaigns.list") {
        return {
          session: `sess-${++n}`,
          status: 200,
          campaigns: [{ id: 101, name: "A", status: "active", dayBudget: 1000, deleted: false }],
        };
      }
      if (method === updateMethod) return { session: `sess-${++n}`, status: 200 };
      throw new Error(`unexpected Sklik method ${method}`);
    },
  };
}

beforeEach(() => {
  SYNC_SOURCE = "google";
  GOOGLE_CONFIGURED = true;
  GOOGLE_CONNECTION = { customerId: "1234567890" };
  GOOGLE_TOKEN = "tok";
  SKLIK_CONNECTION = { tokenEnc: "x", connectedAt: "2026-01-01T00:00:00.000Z", moneyVerdict: "czk-plausible" };
  SKLIK_TOKEN = "sklik-tok";
  delete process.env[SKLIK_WRITES_ENV];
  resetSklikTransport();
});

// --- rail 3: the global off switch ---------------------------------------------

test("[S1 rail 3] the env name is SKLIK_WRITES_ENABLED and only the exact string \"1\" arms it", () => {
  const armed = (value) =>
    liveAdWrites(
      `SKLIK_WRITES_ENABLED=${JSON.stringify(value)} ARMED real Sklik mutations. Only the exact string "1" ` +
        "may, and every other value widens the guard — which is money leaving an advertiser's account"
    );
  assert.equal(
    SKLIK_WRITES_ENV,
    "SKLIK_WRITES_ENABLED",
    liveAdWrites("the off switch has been renamed — every document, runbook and deny rule names the old one")
  );
  assert.equal(sklikWritesEnabled({}), false, armed("(absent)"));
  assert.equal(sklikWritesEnabled({ SKLIK_WRITES_ENABLED: "" }), false, armed(""));
  assert.equal(sklikWritesEnabled({ SKLIK_WRITES_ENABLED: "0" }), false, armed("0"));
  assert.equal(sklikWritesEnabled({ SKLIK_WRITES_ENABLED: "true" }), false, armed("true"));
  assert.equal(sklikWritesEnabled({ SKLIK_WRITES_ENABLED: "yes" }), false, armed("yes"));
  assert.equal(
    sklikWritesEnabled({ SKLIK_WRITES_ENABLED: "1" }),
    true,
    liveAdWrites('SKLIK_WRITES_ENABLED="1" no longer arms writes — the operator\'s live proof cannot be run')
  );
});

test("[S1 rail 3] RED: with the flag off, a Sklik tenant resolves to a refusal — no client, no credential read", async () => {
  SYNC_SOURCE = "sklik";
  const res = await mutatorForTenant(USER, TENANT);
  assert.equal(
    res.ok,
    false,
    liveAdWrites(
      "with SKLIK_WRITES_ENABLED unset, a Sklik tenant resolved to a WORKING mutator. The default is off " +
        "everywhere and this is the assertion that keeps it that way"
    )
  );
  assert.equal(
    res.code,
    "sklik-writes-disabled",
    liveAdWrites("the refusal no longer names the off switch, so a caller cannot tell why the write stopped")
  );
  assert.equal(
    res.error,
    "Úpravy kampaní pro Sklik zatím nejsou podporované. Dostupné jsou jen pro Google Ads.",
    "the pre-S1 refusal string, kept verbatim — with the flag off it is still exactly true"
  );
});

test("[S1 rail 3] GREEN: with SKLIK_WRITES_ENABLED=1 the same tenant resolves to a Sklik mutator", async () => {
  SYNC_SOURCE = "sklik";
  process.env[SKLIK_WRITES_ENV] = "1";
  const res = await mutatorForTenant(USER, TENANT);
  assert.equal(res.ok, true);
  assert.equal(res.mutator.source, "sklik");
  assert.equal(res.tenant, TENANT);
  assert.deepEqual(res.mutator.auditFields, { platform: "sklik" }, "Sklik audit docs are tagged");
  assert.equal(res.mutator.networkLabel, "Sklik");
});

// --- rail 2: the money unit must be settled ------------------------------------

test("[S1 rail 2] sklikWritable is a full verdict × confirmed table", () => {
  const V = ["czk-plausible", "halere-suspected", "insufficient-data", undefined];
  const rows = [];
  for (const moneyVerdict of V) {
    for (const halereConfirmed of [true, false]) {
      rows.push([moneyVerdict ?? "(absent)", halereConfirmed, sklikWritable({ moneyVerdict, halereConfirmed })]);
    }
  }
  assert.deepEqual(rows, [
    ["czk-plausible", true, true],
    ["czk-plausible", false, true],
    ["halere-suspected", true, true], // the owner settled it explicitly — writable
    ["halere-suspected", false, false], // THE open question — never writable
    ["insufficient-data", true, true],
    ["insufficient-data", false, false], // unknown is not the same as fine
    ["(absent)", true, true],
    ["(absent)", false, false], // never evaluated → not writable
  ]);
  assert.equal(sklikWritable(null), false, "no connection at all is not writable");
  assert.equal(sklikWritable(undefined), false);
});

test("[S1 rail 2] RED: an unsettled money unit refuses the write even with the flag ON", async () => {
  SYNC_SOURCE = "sklik";
  process.env[SKLIK_WRITES_ENV] = "1";
  SKLIK_CONNECTION = { tokenEnc: "x", connectedAt: "c", moneyVerdict: "halere-suspected" };
  const res = await mutatorForTenant(USER, TENANT);
  assert.equal(res.ok, false);
  assert.equal(res.code, "sklik-unit-unsettled");
  assert.match(res.error, /měnová jednotka/, "the message names what to settle");
  assert.match(res.error, /Nastavení/, "…and where to settle it");
});

test("[S1 rail 2] GREEN: the owner confirming haléře settles the unit and the write is allowed", async () => {
  SYNC_SOURCE = "sklik";
  process.env[SKLIK_WRITES_ENV] = "1";
  SKLIK_CONNECTION = { tokenEnc: "x", connectedAt: "c", moneyVerdict: "halere-suspected", halereConfirmed: true };
  const res = await mutatorForTenant(USER, TENANT);
  assert.equal(res.ok, true);
  assert.equal(res.mutator.source, "sklik");
});

test("[S1] a Sklik tenant with no stored connection / no decryptable token refuses as not-connected", async () => {
  SYNC_SOURCE = "sklik";
  process.env[SKLIK_WRITES_ENV] = "1";
  SKLIK_CONNECTION = null;
  assert.equal((await mutatorForTenant(USER, TENANT)).code, "sklik-not-connected");

  SKLIK_CONNECTION = { tokenEnc: "x", connectedAt: "c", moneyVerdict: "czk-plausible" };
  SKLIK_TOKEN = null;
  assert.equal((await mutatorForTenant(USER, TENANT)).code, "sklik-not-connected");
});

// --- rail 1: the method constants degrade, end to end --------------------------

test("[S1 rail 1] an unrecognised write method throws out of the mutator — it cannot half-write", async () => {
  SYNC_SOURCE = "sklik";
  process.env[SKLIK_WRITES_ENV] = "1";
  const tr = fixtureTransport({ updateMethod: "campaign.update" });
  setSklikTransport(() => tr);
  const res = await mutatorForTenant(USER, TENANT);
  assert.equal(res.ok, true, "resolution succeeds — the constant is only tested at the wire");
  await assert.rejects(
    () => res.mutator.setBudget({ platform: "sklik", campaignId: "101", dayBudgetCzk: 0 }, 733),
    /unexpected Sklik method/
  );
});

test("[S1] the Sklik mutator speaks campaign ids as numbers and refuses a non-numeric id", async () => {
  SYNC_SOURCE = "sklik";
  process.env[SKLIK_WRITES_ENV] = "1";
  const tr = fixtureTransport();
  setSklikTransport(() => tr);
  const { mutator } = await mutatorForTenant(USER, TENANT);

  await mutator.pause("101");
  assert.deepEqual(tr.calls.at(-1).params[1], [{ id: 101, status: "suspend" }]);
  await mutator.resume("101");
  assert.deepEqual(tr.calls.at(-1).params[1], [{ id: 101, status: "active" }]);

  const budgets = await mutator.readBudgets(["101"]);
  assert.deepEqual(budgets.get("101"), { platform: "sklik", campaignId: "101", dayBudgetCzk: 1000 });

  await assert.rejects(() => mutator.pause("customers/1/campaigns/9"), /neplatné ID kampaně/);
});

// --- the Google path is unchanged ----------------------------------------------

test("[S1] a Google tenant resolves to a Google mutator whose audit fields are exactly { customerId }", async () => {
  const res = await mutatorForTenant(USER, "u_u1_proj_p1_1234567890");
  assert.equal(res.ok, true);
  assert.equal(res.mutator.source, "google-ads");
  assert.equal(res.mutator.networkLabel, "Google Ads");
  assert.deepEqual(
    res.mutator.auditFields,
    { customerId: "1234567890" },
    "no `platform` key — Google audit docs stay byte-identical to every one already written"
  );
});

test("[S1] the three Google refusal messages are byte-identical to the pre-S1 ones", async () => {
  GOOGLE_CONFIGURED = false;
  let res = await mutatorForTenant(USER, "t");
  assert.equal(res.code, "google-not-configured");
  assert.equal(res.error, "Živé úpravy vyžadují Google Ads developer token.");

  GOOGLE_CONFIGURED = true;
  GOOGLE_CONNECTION = null;
  res = await mutatorForTenant(USER, "t");
  assert.equal(res.error, "Nejdřív připojte živý účet Google Ads.");

  GOOGLE_CONNECTION = { customerId: "1234567890" };
  GOOGLE_TOKEN = null;
  res = await mutatorForTenant(USER, "t");
  assert.equal(res.error, "Chybí autorizace Google (přihlaste se znovu).");
});

test("[S1] a sample tenant still falls through to the Google guards — S1 changes nothing it is told", async () => {
  SYNC_SOURCE = "sample";
  GOOGLE_CONNECTION = null;
  const res = await mutatorForTenant(USER, "u_u1_proj_p1");
  assert.equal(res.ok, false);
  assert.equal(
    res.error,
    "Nejdřív připojte živý účet Google Ads.",
    "the pre-S1 message for a demo tenant, deliberately not reworded by this WP"
  );
});

test("[S1] the Sklik rails never fire on a Google tenant — the flag is irrelevant there", async () => {
  SKLIK_CONNECTION = { tokenEnc: "x", connectedAt: "c", moneyVerdict: "halere-suspected" };
  const res = await mutatorForTenant(USER, "u_u1_proj_p1_1234567890");
  assert.equal(res.ok, true, "an unsettled SKLIK unit cannot block a GOOGLE write");
  assert.equal(res.mutator.source, "google-ads");
});
