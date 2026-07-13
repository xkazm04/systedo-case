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
