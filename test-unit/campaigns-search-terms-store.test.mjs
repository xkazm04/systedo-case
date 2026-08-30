/** WP S1b — the search-term STORE and the sync join that fills it, on the real
 *  LOCAL_DB backend (`campaign_docs`), with no mocks at all: a fake connector object
 *  drives the real `runTenantSync` against the real stores.
 *
 *  The gate is the point. A negative keyword is a permanent change to a paying
 *  advertiser's account, so the rule "nothing sampled ever becomes a negative" cannot
 *  be a convention — it has to be a branch that a test can hold. Two independent
 *  halves enforce it and both are pinned below: the sync refuses to fetch at all when
 *  the campaign fetch degraded to sample data, and the sample provider answers `[]`
 *  so even a non-degraded sample sync writes nothing. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-search-terms-store-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { searchTermsDocId } = await import("@/lib/campaigns/store-keys");
const { saveSearchTerms, getSearchTerms, capSearchTerms, SEARCH_TERMS_CAP } = await import(
  "@/lib/campaigns/store/search-terms"
);
const { runTenantSync } = await import("@/lib/campaigns/sync");
const { tenantStore } = await import("@/lib/campaigns/store/backend");

const row = (over = {}) => ({
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
  ...over,
});

const CAMPAIGN = {
  id: "11",
  name: "Kampaň A",
  type: "search",
  status: "enabled",
  impressions: 50_000,
  clicks: 1_000,
  cost: 20_000,
  conversions: 20,
  conversionValue: 60_000,
};

/** A minimal AdsConnector stand-in. `degraded` flips the campaign-fetch degradation
 *  flag exactly as `withSampleFallback` would after a failed live read. */
function connector({ terms = [row()], degraded = false, throws = false } = {}) {
  const calls = { searchTerms: 0 };
  return {
    calls,
    source: "google-ads",
    label: "Google Ads · živá data",
    currency: "CZK",
    timeZone: null,
    degradation: { campaigns: degraded, series: false, reason: degraded ? "boom" : null },
    async fetchCampaigns() {
      return [CAMPAIGN];
    },
    async fetchSeries() {
      return [];
    },
    async fetchCampaignSeries() {
      return {};
    },
    async fetchSearchTerms() {
      calls.searchTerms += 1;
      if (throws) throw new Error("live search-terms read failed");
      return terms;
    },
  };
}

const sync = (tenant, c) => runTenantSync(c, tenant, { userId: null, period: "30d", actor: "Test" });

// --- the store ------------------------------------------------------------------

test("[S1b] the doc id is period-keyed and self-identifying", () => {
  assert.equal(searchTermsDocId("30d"), "searchTerms_30d");
  assert.equal(searchTermsDocId("7d"), "searchTerms_7d");
  assert.notEqual(searchTermsDocId("7d"), searchTermsDocId("30d"), "two periods coexist");
});

test("[S1b] save → get roundtrips the rows for the requested period", async () => {
  const tenant = "u_s1b_store";
  await saveSearchTerms(tenant, [row(), row({ term: "boty na běh", cost: 3000 })], { period: "30d" });
  const back = await getSearchTerms(tenant, "30d");
  assert.equal(back.length, 2);
  assert.equal(back[0].term, "boty na běh", "costliest first — the store's own order");
  assert.equal(back[0].cost, 3000);
  assert.deepEqual(await getSearchTerms(tenant, "7d"), [], "another period is not this period's data");
});

test("[S1b] the cap keeps the COSTLIEST rows, never an arbitrary slice", () => {
  const many = Array.from({ length: SEARCH_TERMS_CAP + 50 }, (_, i) => row({ term: `t${i}`, cost: i }));
  const capped = capSearchTerms(many);
  assert.equal(capped.length, SEARCH_TERMS_CAP);
  assert.equal(capped[0].cost, SEARCH_TERMS_CAP + 49, "the most expensive query survives");
  assert.ok(capped.every((r) => r.cost >= 50), "the cheap tail is what falls off");
});

test("[S1b] a save REPLACES the period's doc wholesale", async () => {
  const tenant = "u_s1b_overwrite";
  await saveSearchTerms(tenant, [row({ term: "old" }), row({ term: "older" })], { period: "30d" });
  await saveSearchTerms(tenant, [row({ term: "new" })], { period: "30d" });
  const back = await getSearchTerms(tenant, "30d");
  assert.deepEqual(back.map((r) => r.term), ["new"], "no stale row survives a fresh sync");
});

// --- the sync join --------------------------------------------------------------

test("[S1b] a live sync fetches the terms, persists them and reports searchTermsOk", async () => {
  const tenant = "u_s1b_sync_live";
  const c = connector();
  const res = await sync(tenant, c);
  assert.equal(res.searchTermsOk, true);
  assert.equal(c.calls.searchTerms, 1);
  assert.deepEqual((await getSearchTerms(tenant, "30d")).map((r) => r.term), ["levné boty"]);
});

test("[S1b] a DEGRADED campaign fetch never even asks for terms", async () => {
  // The whole gate: `campaigns` are sample rows here, so any query mined from this
  // sync would be a fabricated one approval away from a real account.
  const tenant = "u_s1b_sync_degraded";
  const c = connector({ degraded: true });
  const res = await sync(tenant, c);
  assert.equal(res.searchTermsOk, false);
  assert.equal(c.calls.searchTerms, 0, "not called — not merely discarded");
  assert.deepEqual(await getSearchTerms(tenant, "30d"), []);
});

test("[S1b] an EMPTY answer (what the sample provider gives) writes nothing", async () => {
  const tenant = "u_s1b_sync_empty";
  await saveSearchTerms(tenant, [row({ term: "last good" })], { period: "30d" });
  const res = await sync(tenant, connector({ terms: [] }));
  assert.equal(res.searchTermsOk, false);
  assert.deepEqual(
    (await getSearchTerms(tenant, "30d")).map((r) => r.term),
    ["last good"],
    "only-overwrite-on-success: an empty fetch must not blank the panel"
  );
});

test("[S1b] a THROWN search-terms read is best-effort — the sync still succeeds", async () => {
  const tenant = "u_s1b_sync_throws";
  await saveSearchTerms(tenant, [row({ term: "last good" })], { period: "30d" });
  const res = await sync(tenant, connector({ throws: true }));
  assert.equal(res.campaigns.length, 1, "the sync itself is unaffected");
  assert.equal(res.searchTermsOk, false);
  assert.deepEqual((await getSearchTerms(tenant, "30d")).map((r) => r.term), ["last good"]);
});

test("[S1b] a provider WITHOUT the capability (Sklik) is a silent, honest no-op", async () => {
  const tenant = "u_s1b_sync_nocap";
  const c = connector();
  delete c.fetchSearchTerms;
  const res = await sync(tenant, c);
  assert.equal(res.searchTermsOk, false);
  const doc = await (await tenantStore()).getDoc(tenant, "searchTerms", searchTermsDocId("30d"));
  assert.equal(doc, undefined, "no doc is created for a network that has no query report");
});
