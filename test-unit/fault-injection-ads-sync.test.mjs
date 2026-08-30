/** FAULT INJECTION at the store seam — what a sync does when Google Ads lies.
 *
 *  "If the Google Ads connector returned a 500 halfway through a sync, which test
 *  would go red first?" Until this file, none. `test-unit/campaigns-live-retry.test.mjs`
 *  pins `classifyLiveError`, which is the pure DECISION — it says a 500 is worth one
 *  retry. Nothing executed what the decision leads to: the retry itself, the
 *  degrade-to-sample fallback, and the truth-in-labeling flags a degraded sync
 *  persists. Those three are the whole reason a transient Google hiccup does not 500
 *  the dashboard, and the reason a tenant whose token expired is never shown
 *  deterministic demo numbers as if they were their own account data.
 *
 *  WHERE THE FAULT IS INJECTED, and why there. `src/lib/google/ads.ts` says of
 *  itself that every read "reaches the network through the global `fetch`, which is
 *  exactly why none of them can be exercised by a unit test without either
 *  credentials or a global monkey-patch". So this file monkey-patches `fetch` — and
 *  gets, in exchange, the REAL `AdsApiError` construction, the REAL
 *  `classifyLiveError`, the REAL bounded retry, the REAL degrade-to-sample wrapper
 *  and the REAL sample provider. Only credentials are faked (the connection, the
 *  OAuth token, the Sklik connection lookup), because a credential is not the thing
 *  under test and reaching Firestore would be.
 *
 *  Every scenario below is a fault a live account genuinely produces: a 5xx, a 5xx
 *  that clears on the retry, a revoked token, a permanent 403, and a failure that
 *  lands on the SECOND of a sync's two reads — the "halfway through" case, which is
 *  the one where a wrong answer is a dashboard mixing live campaigns with demo
 *  trend data and saying nothing.
 *
 *  Runs in `npm run test:unit` → `npm run check:ci` → `.husky/pre-push`. No
 *  network: `fetch` is replaced for the whole file, so a regression that bypassed
 *  the stub would fail rather than call Google.
 */
import { test, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// The sample provider reconciles its e-shop numbers with the case-study dataset, so
// this module graph reaches src/data/performance.json. Same hook the other tests
// that touch it register (test-unit/demo-tail-leak.test.mjs).
register("./json-loader.mjs", import.meta.url);

process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token-for-tests";
delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

const USER = "u-fault";
const PROJECT = "p-fault";
const CUSTOMER = "1234567890";

/** The access token the connector currently holds. A 401 makes it ask for a fresh
 *  one; returning the SAME string would (correctly) skip the pointless retry, so
 *  the refresh hands back a different token and the retry can be seen carrying it. */
let currentToken = "tok-live-1";
let refreshedTo = "tok-live-2";
let refreshCalls = 0;

mock.module("@/lib/campaigns/connection", {
  namedExports: {
    getAdsConnection: async () => ({
      customerId: CUSTOMER,
      customerName: "Acme",
      connectedAt: "2026-01-01T00:00:00.000Z",
    }),
    getConnectedAccount: async () => null,
  },
});
mock.module("@/lib/google/token", {
  namedExports: {
    getUserAccessToken: async (_userId, opts) => {
      if (opts?.forceRefresh) {
        refreshCalls += 1;
        currentToken = refreshedTo;
      }
      return currentToken;
    },
  },
});
// No Sklik connection: Google wins the provider registry, which is the path under
// test. Mocked rather than left real so nothing reaches a store.
mock.module("@/lib/campaigns/sklik-connection", {
  namedExports: { getSklikConnection: async () => null },
});

const { resolveCampaignContext } = await import("@/lib/campaigns/connector");

// ── the injected transport ───────────────────────────────────────────────────

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

/** Which of the sync's reads a GAQL body is. The three queries are distinguishable
 *  by what they select FROM and by the budget column only the campaign read asks
 *  for — matching on the query text rather than on call order, so a change to the
 *  order of the sync's reads does not silently re-point a fault. */
function kindOf(body) {
  const query = String(JSON.parse(body ?? "{}").query ?? "");
  if (/search_term_view/.test(query)) return "terms";
  if (/campaign_budget\.amount_micros/.test(query)) return "campaigns";
  return "daily";
}

const ok = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});
const httpFail = (status) => ({
  ok: false,
  status,
  json: async () => ({ error: { code: status } }),
  text: async () => `HTTP ${status}`,
});

const CAMPAIGN_ROWS = [
  {
    campaign: { id: "111", name: "Search · Značka", status: "ENABLED", advertisingChannelType: "SEARCH" },
    campaignBudget: { amountMicros: "500000000" },
    // A non-CZK account on purpose: the captured currency is one of the things a
    // degraded fetch has to give back, and CZK would be indistinguishable from the
    // sample provider's own base currency.
    customer: { currencyCode: "EUR", timeZone: "Europe/Prague" },
    metrics: { impressions: "10000", clicks: "500", costMicros: "12000000", conversions: "20", conversionsValue: "90000" },
  },
];
const DAILY_ROWS = [
  {
    campaign: { id: "111" },
    segments: { date: "2026-08-01" },
    customer: { currencyCode: "EUR", timeZone: "Europe/Prague" },
    metrics: { impressions: "500", clicks: "20", costMicros: "1000000", conversions: "2", conversionsValue: "8000" },
  },
];
const TERM_ROWS = [
  {
    campaign: { id: "111", name: "Search · Značka" },
    adGroup: { id: "222", name: "Sestava" },
    searchTermView: { searchTerm: "levné boty" },
    segments: { keyword: { info: { matchType: "BROAD" } } },
    metrics: { impressions: "100", clicks: "9", costMicros: "3000000", conversions: "0", conversionsValue: "0" },
  },
];

/** Per-read response queues. A queue with one entry answers every call the same
 *  way (an outage that lasts the whole request); a longer queue is consumed one
 *  entry per call (a fault that clears, or a token that gets refreshed). */
let respond;
/** Every request the code under test made, in order. */
let requests;

beforeEach(() => {
  requests = [];
  respond = {
    campaigns: [ok([{ results: CAMPAIGN_ROWS }])],
    daily: [ok([{ results: DAILY_ROWS }])],
    terms: [ok([{ results: TERM_ROWS }])],
  };
  currentToken = "tok-live-1";
  refreshedTo = "tok-live-2";
  refreshCalls = 0;
});

globalThis.fetch = async (url, init) => {
  const kind = kindOf(init?.body);
  requests.push({ kind, url: String(url), auth: init?.headers?.Authorization });
  const q = respond[kind];
  const step = q.length > 1 ? q.shift() : q[0];
  return step;
};

const count = (kind) => requests.filter((r) => r.kind === kind).length;
const connector = async () => (await resolveCampaignContext(USER, PROJECT, "eshop")).connector;

// ── control ──────────────────────────────────────────────────────────────────

test("control: a healthy account serves live data through the injected transport", async () => {
  // Without this, every "it degraded" assertion below could be passing because the
  // live provider was never reached at all.
  const c = await connector();
  const campaigns = await c.fetchCampaigns("30d");

  assert.equal(count("campaigns"), 1, "the live campaign read never happened — the fetch stub is not in the loop.");
  assert.equal(c.source, "google-ads");
  assert.deepEqual(
    campaigns.map((x) => x.id),
    ["111"],
    "the live rows must be the ones served when Google answers."
  );
  assert.equal(c.currency, "EUR", "the account's own currency is captured during the campaign fetch.");
  assert.equal(c.timeZone, "Europe/Prague", "so is its clock — the next sync windows its GAQL with it.");
  assert.deepEqual(c.degradation, { campaigns: false, series: false, reason: null });
});

// ── a transient 500 ──────────────────────────────────────────────────────────

test("a 500 that clears on the retry costs a retry, not the account's real data", async () => {
  respond.campaigns = [httpFail(500), ok([{ results: CAMPAIGN_ROWS }])];

  const c = await connector();
  const campaigns = await c.fetchCampaigns("30d");

  assert.equal(count("campaigns"), 2, "a 5xx is worth exactly one bounded retry — no more, and not zero.");
  assert.deepEqual(campaigns.map((x) => x.id), ["111"], "the retry succeeded, so the user must see LIVE data.");
  assert.equal(c.degradation.campaigns, false, "a recovered fetch is not a degradation and must not be flagged as one.");
  assert.equal(c.currency, "EUR");
});

test("a 500 that does NOT clear degrades to sample data — and says so", async () => {
  // The property that makes a Google outage survivable AND honest. Serving the
  // sample silently would put deterministic demo numbers on screen under a
  // "Google Ads · živá data" label, which is the one outcome worse than an error.
  respond.campaigns = [httpFail(500)];

  const c = await connector();
  const campaigns = await c.fetchCampaigns("30d");

  assert.equal(count("campaigns"), 2, "the read is tried twice (original + one backoff retry) and then given up on.");
  assert.ok(campaigns.length > 0, "a failed live fetch must still return usable data — that is the whole point.");
  assert.ok(
    campaigns.every((x) => x.id !== "111"),
    "the live row cannot be in the result: the live read failed, so these must be the sample provider's."
  );
  assert.equal(c.degradation.campaigns, true, "the campaigns flag is what stops sample data being persisted as live.");
  assert.equal(c.degradation.series, false, "only the fetch that failed is flagged.");
  assert.match(
    String(c.degradation.reason),
    /500/,
    "the persisted reason must name what went wrong; a degraded sync with no reason is unattributable later."
  );
  assert.match(
    String(c.degradation.reason),
    /retry:backoff/,
    "the reason must record that a retry was attempted and exhausted, so 'did it even try?' is answerable."
  );
  assert.equal(
    c.currency,
    "CZK",
    "a degraded fetch must fall back to the base currency, not keep a stale one captured from another run."
  );
});

// ── the "halfway through a sync" case ────────────────────────────────────────

test("campaigns land, then the series read 500s — only the series is flagged", async () => {
  // The literal halfway failure. A sync fetches campaigns first and the daily
  // series second, so the interesting state is a connector holding REAL campaigns
  // and SAMPLE trend data. If the flags collapsed into one, the dashboard would
  // either discard good live campaigns or present demo trend lines as live.
  respond.daily = [httpFail(500)];

  const c = await connector();
  const campaigns = await c.fetchCampaigns("30d");
  const series = await c.fetchSeries("30d");

  assert.deepEqual(campaigns.map((x) => x.id), ["111"], "the campaign read succeeded and must not be thrown away.");
  assert.equal(c.degradation.campaigns, false, "a series failure must not mark the campaign data degraded.");
  assert.equal(c.degradation.series, true, "the trend chart is sample data and the flag is the only thing that says so.");
  assert.ok(series.length > 0, "the chart still renders — degraded, labelled, not empty.");
  assert.equal(
    c.currency,
    "EUR",
    "the currency captured by the SUCCESSFUL campaign fetch survives a later failure; resetting it here would " +
      "relabel a live EUR account as CZK because its trend chart hiccuped."
  );
});

test("both series fetchers degrade off ONE failed read, not two", async () => {
  // The portfolio series and the per-campaign sparklines share a single memoised
  // GAQL read. A rejected read is memoised too — otherwise a failing series costs
  // the account two failed round-trips and two backoff waits per sync.
  respond.daily = [httpFail(503)];

  const c = await connector();
  await c.fetchSeries("30d");
  await c.fetchCampaignSeries("30d");

  assert.equal(
    count("daily"),
    2,
    "the date-segmented read must be issued once (plus its one retry) and shared, not repeated per consumer."
  );
  assert.equal(c.degradation.series, true);
});

// ── a revoked token, and a permanent refusal ─────────────────────────────────

test("a 401 is retried with a FRESH token, and the retry carries it", async () => {
  // The commonest live failure: a token Auth.js still considers unexpired that
  // Google has revoked. Retrying with the same token would just fail again, so
  // "was the retry actually different?" is the assertion that matters.
  respond.campaigns = [httpFail(401), ok([{ results: CAMPAIGN_ROWS }])];

  const c = await connector();
  const campaigns = await c.fetchCampaigns("30d");

  assert.equal(refreshCalls, 1, "a 401 must force a token refresh, not a blind backoff retry.");
  assert.equal(count("campaigns"), 2);
  assert.equal(requests[0].auth, "Bearer tok-live-1");
  assert.equal(
    requests[1].auth,
    "Bearer tok-live-2",
    "the retry re-sent the OLD token, so the refresh bought nothing and the sync degrades for no reason."
  );
  assert.deepEqual(campaigns.map((x) => x.id), ["111"]);
  assert.equal(c.degradation.campaigns, false);
});

test("a 401 with nothing fresher to offer degrades instead of retrying pointlessly", async () => {
  respond.campaigns = [httpFail(401)];
  refreshedTo = "tok-live-1"; // the refresh returns the same token → nothing new to try

  const c = await connector();
  await c.fetchCampaigns("30d");

  assert.equal(count("campaigns"), 1, "with no fresher token there is nothing to retry WITH — one call, then degrade.");
  assert.equal(c.degradation.campaigns, true);
});

test("a 403 is permanent — degrade at once rather than pay for the same refusal twice", async () => {
  respond.campaigns = [httpFail(403)];

  const c = await connector();
  await c.fetchCampaigns("30d");

  assert.equal(count("campaigns"), 1, "a permanent 4xx must not be retried; the second call would be pure waste.");
  assert.equal(c.degradation.campaigns, true);
  assert.match(String(c.degradation.reason), /403/);
  assert.doesNotMatch(
    String(c.degradation.reason),
    /retry:/,
    "no retry was attempted, so the reason must not claim one was exhausted."
  );
});

// ── the fetch that must NOT degrade ──────────────────────────────────────────

test("a failed search-terms read THROWS — it must never degrade to sample queries", async () => {
  // The one live read deliberately left outside the degrade-to-sample wrapper.
  // Its rows feed the negative-keyword / promote recommender, so a sample query
  // served here would be one operator approval away from a permanent change on a
  // real ad account. Failing loudly is the feature.
  respond.terms = [httpFail(500)];

  const c = await connector();
  assert.ok(typeof c.fetchSearchTerms === "function", "the Google provider must expose the search-terms capability.");

  await assert.rejects(
    () => c.fetchSearchTerms("30d"),
    /500/,
    "a failed search-terms read returned something instead of throwing. If that something is sample data, a demo " +
      "query is now a candidate negative keyword on a live account."
  );
  assert.equal(count("terms"), 2, "it still gets the module's one bounded retry before it gives up.");
  assert.deepEqual(
    c.degradation,
    { campaigns: false, series: false, reason: null },
    "a search-terms failure is not a data degradation — the sync records it separately and keeps the last good rows."
  );
});
