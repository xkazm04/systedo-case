/** Direction 3 pin: the account-daily mappers extracted from google/ads.ts. Both the
 *  campaigns portfolio series (mapRowsToDailySeries) and the per-campaign series
 *  (mapRowsToCampaignDailySeries) now run over the ONE shared raw fetcher's rows;
 *  these fixtures freeze their output so the refactor stays byte-compatible. The
 *  network fetcher itself is credential-gated and not exercised — only the pure
 *  mapping the fetch feeds. ads.ts imports only campaigns/types (framework-free), so
 *  it imports cleanly under the react-server condition. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { mapRowsToDailySeries, mapRowsToCampaignDailySeries } = await import("@/lib/google/ads");

// A realistic mixed-type searchStream response: two campaigns across two days, with
// string/number metric variants (the API returns micros/counts as strings).
const ROWS = [
  { campaign: { id: "111" }, segments: { date: "2026-06-02" }, metrics: { impressions: "1000", clicks: 10, costMicros: "1500000", conversions: 2, conversionsValue: 4000 } },
  { campaign: { id: "111" }, segments: { date: "2026-06-01" }, metrics: { impressions: 500, clicks: "5", costMicros: 500000, conversions: 1, conversionsValue: "1200" } },
  { campaign: { id: "222" }, segments: { date: "2026-06-02" }, metrics: { impressions: "300", clicks: 3, costMicros: "500000", conversions: 1, conversionsValue: 800 } },
  { segments: { date: "2026-06-02" }, metrics: { clicks: 99 } }, // no campaign id → dropped by per-campaign, summed by portfolio
];

test("portfolio mapper: sums per date, cost micros→CZK rounded per row, keeps clicks+impressions", () => {
  const series = mapRowsToDailySeries(ROWS);
  assert.deepEqual(series, [
    { date: "2026-06-01", cost: 1, conversions: 1, conversionValue: 1200, clicks: 5, impressions: 500 },
    // 2026-06-02: per-ROW cost rounding — 111 (1.5→2) + 222 (0.5→1) + id-less row (0) = 3
    { date: "2026-06-02", cost: 3, conversions: 3, conversionValue: 4800, clicks: 112, impressions: 1300 },
  ]);
});

test("portfolio mapper: rows without a date are dropped; empty input → []", () => {
  assert.deepEqual(mapRowsToDailySeries([]), []);
  assert.deepEqual(mapRowsToDailySeries([{ metrics: { clicks: 7 } }]), []);
});

test("per-campaign mapper: keyed by campaign.id, id-less rows dropped, each sorted ascending", () => {
  const byCampaign = mapRowsToCampaignDailySeries(ROWS);
  assert.deepEqual(Object.keys(byCampaign).sort(), ["111", "222"]);
  assert.deepEqual(byCampaign["111"], [
    { date: "2026-06-01", cost: 1, conversions: 1, conversionValue: 1200, clicks: 5, impressions: 500 },
    { date: "2026-06-02", cost: 2, conversions: 2, conversionValue: 4000, clicks: 10, impressions: 1000 },
  ]);
  assert.deepEqual(byCampaign["222"], [
    { date: "2026-06-02", cost: 1, conversions: 1, conversionValue: 800, clicks: 3, impressions: 300 },
  ]);
});

test("per-campaign mapper: malformed / empty input never throws", () => {
  assert.deepEqual(mapRowsToCampaignDailySeries([]), {});
  assert.deepEqual(mapRowsToCampaignDailySeries([{ campaign: { id: "1" } }]), {}); // no date → dropped
});

// ── a 200 that is WRONG ──────────────────────────────────────────────────────
//
// Every other fault-injection assertion about this connector
// (test-unit/fault-injection-ads-sync.test.mjs) is a non-2xx: a 500, a revoked
// token, a 403. Those reach the retry-and-degrade machinery, and a degraded sync is
// FLAGGED — which is the whole reason it is survivable. A malformed 200 reaches
// none of it. It is a success, and whatever these mappers make of it is persisted
// and rendered as the account's own live data. The rows below are the shapes a
// proxy, a partial write or an API version change actually produces.

test("garbage where a metric belongs becomes 0 — a live dashboard never renders NaN", () => {
  // A NaN cost is not an error anybody sees. It is a broken figure on a chart, or a
  // plausible wrong ROAS/CPA derived from one, that somebody moves a budget over.
  const series = mapRowsToDailySeries([
    {
      campaign: { id: "111" },
      segments: { date: "2026-06-02" },
      metrics: { impressions: "12abc", clicks: null, costMicros: "N/A", conversions: {}, conversionsValue: undefined },
    },
    // The same row with no `metrics` block at all — a partial payload rather than a
    // corrupt one.
    { campaign: { id: "111" }, segments: { date: "2026-06-03" } },
  ]);

  assert.deepEqual(series, [
    { date: "2026-06-02", cost: 0, conversions: 0, conversionValue: 0, clicks: 0, impressions: 0 },
    { date: "2026-06-03", cost: 0, conversions: 0, conversionValue: 0, clicks: 0, impressions: 0 },
  ]);
  for (const p of series) {
    for (const n of [p.cost, p.conversions, p.conversionValue, p.clicks, p.impressions]) {
      assert.ok(Number.isFinite(n), `an unreadable metric produced ${n}. Finite-or-zero is the contract.`);
    }
  }
});

test("a date that is not a string is dropped rather than sorted — two of them used to throw", () => {
  // `segments.date` is typed `string | undefined`, which is a claim about what
  // Google sends and not a check on what arrived. A numeric date passed the old
  // truthiness guard, became the point's `date`, and then `sortByDate` called
  // `.localeCompare` on a number — a TypeError out of a 200 response, on the one
  // path a malformed payload takes. It needed TWO such rows to fire, because a
  // single-element sort never calls its comparator.
  const rows = [
    { campaign: { id: "111" }, segments: { date: 20260602 }, metrics: { clicks: 5 } },
    { campaign: { id: "111" }, segments: { date: 20260603 }, metrics: { clicks: 7 } },
    { campaign: { id: "111" }, segments: { date: "2026-06-04" }, metrics: { clicks: 9 } },
  ];

  assert.deepEqual(mapRowsToDailySeries(rows), [
    { date: "2026-06-04", cost: 0, conversions: 0, conversionValue: 0, clicks: 9, impressions: 0 },
  ]);
  assert.deepEqual(mapRowsToCampaignDailySeries(rows), {
    "111": [{ date: "2026-06-04", cost: 0, conversions: 0, conversionValue: 0, clicks: 9, impressions: 0 }],
  });
});
