/** FAULT INJECTION at the OTHER channel boundary — what a sync does when Sklik lies.
 *
 *  `test-unit/fault-injection-ads-sync.test.mjs` asks this question of Google Ads and
 *  answers it well: a 500, a revoked token, a permanent 403, a failure landing on the
 *  second of two reads. Every one of those is an HTTP FAILURE, and every one of them
 *  is Google's. Two gaps were left, and they are the ones a marketer would feel:
 *
 *    1. SKLIK. It is the #1 channel for this product's market, it reaches the same
 *       dashboard through the same neutral Campaign / DailyPoint model, and nothing
 *       fed it a hostile response. Its client parses defensively — `num()` coerces
 *       every wire value and returns 0 for anything non-finite, arrays are checked
 *       before they are walked, rows with no id are dropped — and not one line of
 *       that was asserted. Defensive code nobody tests is defensive code the next
 *       refactor simplifies away, and the mutation that deletes
 *       `Number.isFinite(n) ? n : 0` from src/lib/sklik/client.ts survives today.
 *
 *    2. A 200 THAT IS WRONG. Every scenario in the Google file is a non-2xx. A
 *       channel that answers 200 with half a payload, a truncated body, a string
 *       where a number belongs or a stats block for a campaign that is not in the
 *       account never reaches the retry-and-degrade machinery AT ALL — it is a
 *       success, and whatever it maps to is persisted and rendered as live data.
 *
 *  WHY THAT SECOND ONE IS THE WORST CASE FOR A MARKETER. A failed sync is visible:
 *  it degrades to sample data and the degradation is flagged, which is the property
 *  the Google file spends most of its assertions on. A malformed 200 is invisible.
 *  `NaN` spend and `NaN` conversions render as broken numbers or, worse, propagate
 *  into a ratio and produce a plausible wrong one — a ROAS, a CPA, a budget headroom
 *  figure that somebody makes a spending decision on. So the assertion that matters
 *  most in this file is the dullest one: **every number that comes out of a hostile
 *  payload is finite.**
 *
 *  WHERE THE FAULT IS INJECTED. Two places, deliberately:
 *
 *    • the SklikTransport seam, which src/lib/sklik/client.ts documents as existing
 *      "so the adapter can be unit-tested against a fixture with no network". The
 *      real client and the real adapter run; only the wire is fake.
 *    • `globalThis.fetch`, for the handful of assertions about the real
 *      `httpSklikTransport` — the rate-limit envelope is the one thing a fixture
 *      transport cannot exercise, because Sklik signals it inside an HTTP 200.
 *
 *  No network is reachable from this file: the transport is a fixture, and the one
 *  test that touches `fetch` replaces it and restores it.
 *
 *  Runs in `npm run test:unit` → `npm run check:ci` → `.husky/pre-push`.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { SklikClient, SklikApiError, httpSklikTransport } from "@/lib/sklik/client";
import { fetchSklikCampaigns, fetchSklikSeries, fetchSklikCampaignSeries } from "@/lib/sklik/adapter";
import { classifyLiveError } from "@/lib/google/ads";

/** A fixture wire. `responses` maps a Sklik method to the object it answers with,
 *  or to an Error it throws. Anything unlisted answers `{}`, which is itself a
 *  hostile response worth having as the default: it is what a truncated or
 *  HTML-bodied reply decodes to. */
function transport(responses = {}) {
  const calls = [];
  return {
    calls,
    async call(method, params) {
      calls.push({ method, params });
      const r = responses[method];
      if (r instanceof Error) throw r;
      return r ?? {};
    },
  };
}

const LOGIN = { "client.loginByToken": { session: "sess-1" } };
const client = (responses) => {
  const t = transport({ ...LOGIN, ...responses });
  return { client: new SklikClient(t, "token"), transport: t };
};
const called = (t, method) => t.calls.filter((c) => c.method === method).length;

/** Every metric on a mapped campaign or point, so "is any of this NaN?" is one call. */
const numbersOf = (o) => [o.impressions, o.clicks, o.cost, o.conversions, o.conversionValue];

// ── the shape of the payload is wrong ────────────────────────────────────────

test("campaigns.list answering 200 with a non-array yields no campaigns, not a crash", async () => {
  // A truncated body, an HTML error page decoded as JSON, an API version that
  // renamed the key. All decode to "the field is not an array".
  const { client: c, transport: t } = client({ "campaigns.list": { campaigns: "<html>502</html>" } });
  const campaigns = await fetchSklikCampaigns(c, "30d");

  assert.deepEqual(campaigns, [], "an unusable campaign list must map to nothing, never to a partial guess.");
  assert.equal(
    called(t, "stats.campaigns"),
    0,
    "with no campaigns there is nothing to report on — asking anyway spends a round trip per sync on a payload " +
      "that already failed."
  );
});

test("a 200 with no recognisable body at all is empty rather than undefined-shaped", async () => {
  const { client: c } = client({ "campaigns.list": {} });
  assert.deepEqual(await fetchSklikCampaigns(c, "30d"), []);
  const { client: c2 } = client({ "stats.campaigns": { report: null } });
  assert.deepEqual(await fetchSklikSeries(c2, "30d"), [], "a null report must not be walked.");
});

test("campaign rows with no id are dropped, and deleted ones never reach the dashboard", async () => {
  const { client: c } = client({
    "campaigns.list": {
      campaigns: [
        { id: 1, name: "Brand", status: "active", type: "fulltext" },
        { name: "No id at all", status: "active" },
        { id: null, name: "Explicit null id" },
        { id: 2, name: "Smazaná", status: "active", deleted: true },
      ],
    },
    "stats.campaigns": { report: [] },
  });
  const campaigns = await fetchSklikCampaigns(c, "30d");

  assert.deepEqual(
    campaigns.map((x) => x.id),
    ["1"],
    "an id-less row cannot be keyed, joined to its stats, or acted on — carrying it forward invents a campaign."
  );
});

// ── the numbers are wrong ────────────────────────────────────────────────────

test("garbage where a number belongs becomes 0, and NEVER NaN", async () => {
  // The assertion this whole file exists for. A NaN cost is not an error anyone
  // sees; it is a broken figure on a dashboard, or a plausible wrong ratio derived
  // from one, that somebody changes a budget over.
  const { client: c } = client({
    "campaigns.list": { campaigns: [{ id: 7, name: "Hostile", status: "active", type: "fulltext", dayBudget: "n/a" }] },
    "stats.campaigns": {
      report: [
        {
          campaignId: 7,
          stats: [
            {
              impressions: "12abc",
              clicks: null,
              money: "N/A",
              conversions: {},
              conversionValue: undefined,
            },
          ],
        },
      ],
    },
  });
  const [campaign] = await fetchSklikCampaigns(c, "30d");

  for (const n of numbersOf(campaign)) {
    assert.equal(typeof n, "number", `a metric came back as ${typeof n} instead of a number.`);
    assert.ok(Number.isFinite(n), `a hostile payload produced ${n}. Finite-or-zero is the contract.`);
  }
  assert.deepEqual(numbersOf(campaign), [0, 0, 0, 0, 0], "unreadable metrics are zero, not guesses.");
  assert.equal(
    campaign.budgetPerDay,
    undefined,
    "an unreadable dayBudget must be ABSENT, not 0 — the model treats a present budget as a real cap, and a " +
      "zero cap reads as a campaign that has been throttled to nothing."
  );
});

test("string numerics are still read — defensiveness must not throw away real data", async () => {
  // The failure mode on the other side of the same code: a coercion so cautious it
  // discards Sklik's legitimate string-encoded numbers would zero out a live account.
  const { client: c } = client({
    "campaigns.list": { campaigns: [{ id: 8, name: "Wire strings", status: "active", type: "fulltext", dayBudget: "300" }] },
    "stats.campaigns": {
      report: [
        {
          campaignId: 8,
          stats: [{ impressions: "1000", clicks: "100", money: "5000", conversions: "10", conversionValue: "20000" }],
        },
      ],
    },
  });
  const [campaign] = await fetchSklikCampaigns(c, "30d");

  assert.deepEqual(numbersOf(campaign), [1000, 100, 5000, 10, 20000]);
  assert.equal(campaign.budgetPerDay, 300);
});

test("an unreadable status is paused and an unreadable type is search — never the riskier reading", async () => {
  // Both fallbacks are safety-directional. Mis-reading a paused campaign as serving
  // is what puts a campaign on a dashboard as live spend that is not happening.
  const { client: c } = client({
    "campaigns.list": {
      campaigns: [
        { id: 9, name: "Numeric status", status: 1, type: 42 },
        { id: 10, name: "Unknown type", status: "active", type: "mystery" },
      ],
    },
    "stats.campaigns": { report: [] },
  });
  const campaigns = await fetchSklikCampaigns(c, "30d");
  const byId = Object.fromEntries(campaigns.map((x) => [x.id, x]));

  assert.equal(byId["9"].status, "paused", "a status that is not Sklik's \"active\" must never map to enabled.");
  assert.equal(byId["9"].type, "search", "an unmappable type falls back to the generic channel.");
  assert.equal(byId["10"].status, "enabled");
  assert.equal(byId["10"].type, "search");
});

// ── half a payload ───────────────────────────────────────────────────────────

test("a campaign whose stats block is missing or malformed still appears, at zero", async () => {
  // The partial payload. Dropping the campaign would make it vanish from the table
  // for the period, which reads as "deleted"; inventing metrics would be worse.
  const { client: c } = client({
    "campaigns.list": {
      campaigns: [
        { id: 11, name: "Has stats", status: "active", type: "fulltext" },
        { id: 12, name: "Stats not an array", status: "active", type: "fulltext" },
        { id: 13, name: "No stats row at all", status: "active", type: "fulltext" },
      ],
    },
    "stats.campaigns": {
      report: [
        { campaignId: 11, stats: [{ impressions: 100, clicks: 10, money: 500, conversions: 1, conversionValue: 900 }] },
        { campaignId: 12, stats: "unavailable" },
        // 13 is simply absent from the report.
        { campaignId: 999, stats: [{ impressions: 1, clicks: 1, money: 1, conversions: 1, conversionValue: 1 }] },
      ],
    },
  });
  const campaigns = await fetchSklikCampaigns(c, "30d");

  assert.deepEqual(
    campaigns.map((x) => x.id).sort(),
    ["11", "12", "13"],
    "campaign 999 is in the stats report and not in the account. A report row must never conjure a campaign."
  );
  const byId = Object.fromEntries(campaigns.map((x) => [x.id, x]));
  assert.deepEqual(numbersOf(byId["11"]), [100, 10, 500, 1, 900]);
  assert.deepEqual(numbersOf(byId["12"]), [0, 0, 0, 0, 0], "an unreadable stats block is zero, and the row survives.");
  assert.deepEqual(numbersOf(byId["13"]), [0, 0, 0, 0, 0]);
});

test("daily points with no usable date are dropped, not bucketed under a wrong day", async () => {
  const { client: c } = client({
    "stats.campaigns": {
      report: [
        {
          campaignId: 21,
          stats: [
            { date: "2026-07-10", impressions: 400, clicks: 40, money: 2000, conversions: 4, conversionValue: 8000 },
            // A number where the wire promises YYYY-MM-DD, and a row with no date.
            { date: 20260711, impressions: 999, clicks: 99, money: 9999, conversions: 9, conversionValue: 9999 },
            { impressions: 500, clicks: 50, money: 3000, conversions: 5, conversionValue: 1000 },
          ],
        },
      ],
    },
  });

  const series = await fetchSklikSeries(c, "30d");
  assert.deepEqual(
    series.map((p) => p.date),
    ["2026-07-10"],
    "an undated row cannot be placed on a trend line; folding it into a neighbouring day invents a spike."
  );
  assert.deepEqual(numbersOf(series[0]), [400, 40, 2000, 4, 8000], "and it must not leak into the day that IS valid.");

  const perCampaign = await fetchSklikCampaignSeries(c, "30d");
  assert.deepEqual(perCampaign["21"].map((p) => p.date), ["2026-07-10"], "the sparkline path drops it too.");
});

test("campaigns land, then the stats read fails — the whole fetch fails rather than reporting zero spend", async () => {
  // The literal "half a payload mid-sync" case, and the one place where degrading
  // is the RIGHT answer and returning data is not. Campaigns are already in hand;
  // swallowing the stats failure would produce a complete-looking table of real
  // campaign names with zero cost and zero conversions — which is not a degradation
  // anything flags, it is a live table saying the account spent nothing.
  const { client: c, transport: t } = client({
    "campaigns.list": { campaigns: [{ id: 31, name: "Brand", status: "active", type: "fulltext" }] },
    "stats.campaigns": new SklikApiError(503, "Sklik stats.campaigns status 503"),
  });

  await assert.rejects(
    () => fetchSklikCampaigns(c, "30d"),
    (err) => err instanceof SklikApiError && err.status === 503,
    "a failed stats read must propagate, so the connector's degrade-to-sample wrapper can flag it. Returning " +
      "the campaigns with zeroed metrics is the one outcome that is both wrong and invisible."
  );
  assert.equal(called(t, "campaigns.list"), 1, "the first read did happen — this is the halfway case, not a total one.");
});

// ── the failure is classified the same way Google's is ───────────────────────

test("a rate-limited Sklik gets the same one bounded retry a rate-limited Google does", () => {
  // src/lib/sklik/client.ts records that the transport used to throw plain Errors
  // with the status only interpolated into the message, so EVERY Sklik failure
  // classified as "permanent" and degraded at once — while the identical Google
  // failure backed off and retried. The fix was SklikApiError carrying `.status`;
  // this is what keeps it carrying one.
  assert.equal(classifyLiveError(new SklikApiError(429, "rate limited")), "backoff");
  assert.equal(classifyLiveError(new SklikApiError(503, "unavailable")), "backoff");
  assert.equal(classifyLiveError(new SklikApiError(500, "boom")), "backoff");
  assert.equal(
    classifyLiveError(new SklikApiError(401, "bad session")),
    "token",
    "401 is a token failure. Sklik has no refresher, so the connector degrades at once — correctly — but the " +
      "classification has to be the truthful one or the reason recorded on the sync is wrong."
  );
  assert.equal(classifyLiveError(new SklikApiError(403, "forbidden")), "permanent");
});

// ── the real transport, on the responses only it can produce ─────────────────

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

const response = ({ ok = true, status = 200, body = {}, text = "" }) => ({
  ok,
  status,
  json: async () => body,
  text: async () => text,
});

test("Sklik signals a rate limit inside an HTTP 200 — the transport must not read that as success", async () => {
  // The failure a fixture transport cannot reach and a fetch stub can. Sklik answers
  // 200 and puts the outcome in a `status` field, so a transport that trusted the
  // HTTP code would hand the client an error envelope, the client would find no
  // `campaigns` key, and the sync would report an empty account instead of backing
  // off. An empty account and a throttled one are the same picture to a marketer.
  globalThis.fetch = async () => response({ body: { status: 429, statusMessage: "Rate limit exceeded" } });

  await assert.rejects(
    () => httpSklikTransport("https://example.invalid/x").call("campaigns.list", []),
    (err) => err instanceof SklikApiError && err.status === 429,
    "an error envelope returned under HTTP 200 must throw, carrying Sklik's own status so the connector can " +
      "classify it as a backoff."
  );
});

test("an HTTP failure carries its status too, rather than becoming a bare Error", async () => {
  globalThis.fetch = async () => response({ ok: false, status: 503, text: "upstream unavailable" });

  await assert.rejects(
    () => httpSklikTransport("https://example.invalid/x").call("campaigns.list", []),
    (err) => err instanceof SklikApiError && err.status === 503
  );
});

test("a body that is not JSON at all degrades to an empty envelope instead of throwing a parse error", async () => {
  // A proxy's HTML error page served with a 200. The client maps it to nothing,
  // which is the tolerant read contract the module documents for its read paths.
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
    text: async () => "<html>",
  });

  const c = new SklikClient(httpSklikTransport("https://example.invalid/x"), "token");
  await assert.rejects(
    () => fetchSklikCampaigns(c, "30d"),
    /login failed/,
    "with an unparseable body there is no session, so the handshake is what fails — loudly, before any read " +
      "can be mistaken for an empty account."
  );
});
