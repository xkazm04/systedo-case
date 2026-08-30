/** WP S1b — the Google Ads SEARCH-TERM seam: the exact GAQL a real account is asked,
 *  the pure mapper over its rows, and the three criterion mutations' request bodies.
 *
 *  Nothing here can reach Google. The query and the mapper are pure; the three writes
 *  take S3's injectable `fetchImpl`, so every assertion below is made against a
 *  transport that records the request and answers from a fixture. That matters more
 *  here than anywhere else in this module: these are the first CREATE calls in the
 *  file, and a wrong body would add a permanent criterion to a paying advertiser's
 *  account. Pinning the bytes offline is the only proof available without one. */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  searchTermsQuery,
  mapSearchTermRows,
  criterionMutateEndpoint,
  addCampaignNegativeKeyword,
  addAdGroupExactKeyword,
  removeCriterion,
  SEARCH_TERMS_LIMIT,
  AdsApiError,
} = await import("@/lib/google/ads");

const CID = "1234567890";

/** A recording transport: captures every request and answers with `body`. */
function recorder(body, ok = true, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init?.method, body: JSON.parse(init?.body ?? "{}") });
    return {
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { calls, fetchImpl };
}

// --- the GAQL contract ---------------------------------------------------------

test("[S1b] the search-terms GAQL is exactly the query WP S1b specified", () => {
  const q = searchTermsQuery("2026-07-30", "2026-08-29");
  assert.equal(
    q,
    "SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, search_term_view.search_term," +
      " segments.keyword.info.match_type, metrics.cost_micros, metrics.clicks, metrics.impressions," +
      " metrics.conversions, metrics.conversions_value FROM search_term_view WHERE segments.date" +
      " BETWEEN '2026-07-30' AND '2026-08-29' AND campaign.status != 'REMOVED' ORDER BY" +
      " metrics.cost_micros DESC LIMIT 500",
    "the whole contract with Google, pinned verbatim"
  );
});

test("[S1b] the GAQL keeps the two filters that make it safe to act on", () => {
  const q = searchTermsQuery("2026-01-01", "2026-01-31");
  assert.match(q, /campaign\.status != 'REMOVED'/, "a removed campaign's queries are never mined");
  assert.match(q, /ORDER BY metrics\.cost_micros DESC/, "the costliest queries are the ones fetched");
  assert.equal(SEARCH_TERMS_LIMIT, 500);
  assert.match(searchTermsQuery("a", "b", 12), /LIMIT 12$/, "the limit is the caller's when given");
});

// --- the pure mapper -----------------------------------------------------------

const ROW = (over = {}) => ({
  campaign: { id: "11", name: "Kampaň A" },
  adGroup: { id: "22", name: "Sestava B" },
  searchTermView: { searchTerm: "levné boty" },
  segments: { keyword: { info: { matchType: "BROAD" } } },
  metrics: {
    costMicros: "900000000",
    clicks: "40",
    impressions: "1200",
    conversions: "0",
    conversionsValue: "0",
  },
  ...over,
});

test("[S1b] mapSearchTermRows converts micros to account-currency units", () => {
  const [r] = mapSearchTermRows([ROW()]);
  assert.equal(r.term, "levné boty");
  assert.equal(r.campaignId, "11");
  assert.equal(r.campaignName, "Kampaň A");
  assert.equal(r.adGroupId, "22");
  assert.equal(r.adGroupName, "Sestava B");
  assert.equal(r.matchType, "BROAD");
  assert.equal(r.cost, 900, "900_000_000 micros → 900");
  assert.equal(r.clicks, 40);
  assert.equal(r.impressions, 1200);
  assert.equal(r.conversions, 0);
});

test("[S1b] a FRACTIONAL conversion count survives the mapper unrounded", () => {
  // Load-bearing: the negative gate is `conversions === 0`, so rounding 0.4 down here
  // would turn a converting query into one this app blocks forever.
  const [r] = mapSearchTermRows([ROW({ metrics: { ...ROW().metrics, conversions: "0.4" } })]);
  assert.equal(r.conversions, 0.4);
});

test("[S1b] an unrecognised match type becomes OTHER, never a guessed BROAD", () => {
  for (const raw of ["UNSPECIFIED", "UNKNOWN", "SOMETHING_NEW", undefined]) {
    const [r] = mapSearchTermRows([ROW({ segments: { keyword: { info: { matchType: raw } } } })]);
    assert.equal(r.matchType, "OTHER", `${raw} must not be coerced into a real match type`);
  }
  const [exact] = mapSearchTermRows([ROW({ segments: { keyword: { info: { matchType: "EXACT" } } } })]);
  assert.equal(exact.matchType, "EXACT");
});

test("[S1b] rows that cannot be acted on are dropped, not half-mapped", () => {
  const rows = [
    ROW({ searchTermView: undefined }),
    ROW({ campaign: { name: "no id" } }),
    ROW({ adGroup: { name: "no id" } }),
    ROW(),
  ];
  const out = mapSearchTermRows(rows);
  assert.equal(out.length, 1, "only the complete row survives");
  assert.equal(out[0].term, "levné boty");
});

test("[S1b] a row with no metrics maps to zeros rather than NaN", () => {
  const [r] = mapSearchTermRows([ROW({ metrics: undefined })]);
  assert.deepEqual(
    { cost: r.cost, clicks: r.clicks, conversions: r.conversions, conversionValue: r.conversionValue },
    { cost: 0, clicks: 0, conversions: 0, conversionValue: 0 }
  );
});

// --- the three criterion mutations ---------------------------------------------

test("[S1b] addCampaignNegativeKeyword posts the campaignCriteria create body", async () => {
  const { calls, fetchImpl } = recorder({
    results: [{ resourceName: `customers/${CID}/campaignCriteria/11~987` }],
  });
  const rn = await addCampaignNegativeKeyword("tok", CID, "11", "levné boty", fetchImpl);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://googleads.googleapis.com/v18/customers/${CID}/campaignCriteria:mutate`);
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(
    calls[0].body,
    {
      operations: [
        {
          create: {
            campaign: `customers/${CID}/campaigns/11`,
            negative: true,
            keyword: { text: "levné boty", matchType: "PHRASE" },
          },
        },
      ],
    },
    "campaign-level, negative:true, PHRASE — the whole account-changing payload"
  );
  assert.equal(rn, `customers/${CID}/campaignCriteria/11~987`, "the created resource name is returned");
});

test("[S1b] addAdGroupExactKeyword posts the adGroupCriteria create body", async () => {
  const { calls, fetchImpl } = recorder({
    results: [{ resourceName: `customers/${CID}/adGroupCriteria/22~654` }],
  });
  const rn = await addAdGroupExactKeyword("tok", CID, "22", "boty na běh", fetchImpl);

  assert.equal(calls[0].url, `https://googleads.googleapis.com/v18/customers/${CID}/adGroupCriteria:mutate`);
  assert.deepEqual(calls[0].body, {
    operations: [
      {
        create: {
          adGroup: `customers/${CID}/adGroups/22`,
          status: "ENABLED",
          keyword: { text: "boty na běh", matchType: "EXACT" },
        },
      },
    ],
  });
  assert.equal(rn, `customers/${CID}/adGroupCriteria/22~654`);
});

test("[S1b] a create whose response carries no resourceName FAILS", async () => {
  // The criterion exists on the account and nothing could ever remove it — reporting
  // success here would be the one un-revertable outcome this WP must not produce.
  const { fetchImpl } = recorder({ results: [{}] });
  await assert.rejects(
    () => addCampaignNegativeKeyword("tok", CID, "11", "x", fetchImpl),
    (err) => err instanceof AdsApiError && /resourceName/.test(err.message)
  );
});

test("[S1b] a non-OK create throws AdsApiError carrying the status (module invariant)", async () => {
  const { fetchImpl } = recorder({ error: "nope" }, false, 429);
  await assert.rejects(
    () => addAdGroupExactKeyword("tok", CID, "22", "x", fetchImpl),
    (err) => err instanceof AdsApiError && err.status === 429
  );
});

test("[S1b] criterionMutateEndpoint is a whitelist over the resource name", () => {
  assert.equal(criterionMutateEndpoint(`customers/${CID}/campaignCriteria/11~987`), "campaignCriteria");
  assert.equal(criterionMutateEndpoint(`customers/${CID}/adGroupCriteria/22~654`), "adGroupCriteria");
  assert.equal(criterionMutateEndpoint(`customers/${CID}/campaigns/11`), null, "not a criterion");
  assert.equal(criterionMutateEndpoint("garbage"), null);
});

test("[S1b] removeCriterion routes each snapshot to the endpoint its name implies", async () => {
  const neg = recorder({ results: [{}] });
  await removeCriterion("tok", CID, `customers/${CID}/campaignCriteria/11~987`, neg.fetchImpl);
  assert.equal(neg.calls[0].url, `https://googleads.googleapis.com/v18/customers/${CID}/campaignCriteria:mutate`);
  assert.deepEqual(neg.calls[0].body, {
    operations: [{ remove: `customers/${CID}/campaignCriteria/11~987` }],
  });

  const pro = recorder({ results: [{}] });
  await removeCriterion("tok", CID, `customers/${CID}/adGroupCriteria/22~654`, pro.fetchImpl);
  assert.equal(pro.calls[0].url, `https://googleads.googleapis.com/v18/customers/${CID}/adGroupCriteria:mutate`);
  assert.deepEqual(pro.calls[0].body, {
    operations: [{ remove: `customers/${CID}/adGroupCriteria/22~654` }],
  });
});

test("[S1b] removeCriterion refuses an unrecognised resource name instead of guessing", async () => {
  const { calls, fetchImpl } = recorder({});
  await assert.rejects(
    () => removeCriterion("tok", CID, "customers/1/campaigns/11", fetchImpl),
    (err) => err instanceof AdsApiError && err.status === 400
  );
  assert.equal(calls.length, 0, "nothing was sent anywhere");
});
