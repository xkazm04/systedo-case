/** Direction 3 pin: the sync cron fetches each account's date-segmented rows ONCE at
 *  the widest (report) window and serves BOTH the report mapper AND the campaigns
 *  period series from them. These tests freeze the two byte-identical guarantees the
 *  dedup rests on — using only the PURE mappers + the pure window slice (the network
 *  fetcher is credential-gated and not exercised):
 *   1. adding `campaign.id` to the report SELECT does not change the report's per-date
 *      sum (so sharing the campaigns query's rows leaves the report blob unchanged), and
 *   2. slicing the wide window to the campaign window equals fetching that window
 *      directly (both share today's end date within a run). */
import { test } from "node:test";
import assert from "node:assert/strict";

const { mapAdsRowsToMetrics } = await import("@/lib/report-metrics/map");
const { mapRowsToDailySeries, mapRowsToCampaignDailySeries, filterRowsFromDate } = await import("@/lib/google/ads");

// Two campaigns across a "far" day (outside the campaign window) and two "recent" days.
const FAR = "2026-01-05";
const R1 = "2026-06-01";
const R2 = "2026-06-02";
const rowsWithId = [
  { campaign: { id: "111" }, segments: { date: FAR }, metrics: { impressions: "800", clicks: 8, costMicros: "2000000", conversions: 3, conversionsValue: 6000 } },
  { campaign: { id: "111" }, segments: { date: R1 }, metrics: { impressions: 500, clicks: "5", costMicros: 500000, conversions: 1, conversionsValue: "1200" } },
  { campaign: { id: "111" }, segments: { date: R2 }, metrics: { impressions: "1000", clicks: 10, costMicros: "1500000", conversions: 2, conversionsValue: 4000 } },
  { campaign: { id: "222" }, segments: { date: R2 }, metrics: { impressions: "300", clicks: 3, costMicros: "500000", conversions: 1, conversionsValue: 800 } },
];

test("report mapper: adding campaign.id to the SELECT does not change the per-date sum", () => {
  // Strip the campaign id → what the campaign.id-free fetchAccountDailyRows returns.
  const rowsNoId = rowsWithId.map(({ campaign, ...rest }) => rest);
  assert.deepEqual(mapAdsRowsToMetrics(rowsWithId), mapAdsRowsToMetrics(rowsNoId));
});

test("window slice: keeps only rows on/after the start; drops the far day", () => {
  const recent = filterRowsFromDate(rowsWithId, R1);
  assert.deepEqual(recent.map((r) => r.segments.date).sort(), [R1, R2, R2]);
  // Everything before R1 is gone.
  assert.ok(!recent.some((r) => r.segments.date === FAR));
});

test("campaigns series from the SLICED wide-window rows == series from the window's own rows", () => {
  // The rows a direct campaign-window fetch would return (only the recent days).
  const windowRows = rowsWithId.filter((r) => r.segments.date === R1 || r.segments.date === R2);
  const sliced = filterRowsFromDate(rowsWithId, R1);
  assert.deepEqual(mapRowsToDailySeries(sliced), mapRowsToDailySeries(windowRows));
  assert.deepEqual(mapRowsToCampaignDailySeries(sliced), mapRowsToCampaignDailySeries(windowRows));
});

test("one shared row set feeds report (sum over full window) + campaigns series (sliced) consistently", () => {
  // Report reads the FULL window (the far day counts toward the report totals)…
  const report = mapAdsRowsToMetrics(rowsWithId);
  assert.deepEqual(report.map((r) => r.date), [FAR, R1, R2]);
  const far = report.find((r) => r.date === FAR);
  assert.equal(far.cost, 2); // 2_000_000 micros → 2
  assert.equal(far.conversions, 3);
  // …while the campaigns series reads only the sliced window (far day excluded).
  const portfolio = mapRowsToDailySeries(filterRowsFromDate(rowsWithId, R1));
  assert.deepEqual(portfolio.map((p) => p.date), [R1, R2]);
});
