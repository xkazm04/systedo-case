/** Campaigns page response assembly (src/app/api/campaigns/state.ts). Pins the
 *  exact response SHAPE that survived the read-path collapse (one tenant-root
 *  read + parallelised reads), plus the two pure rules the route relied on:
 *  stale-report detection and the non-active-period meta rewrite. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleCampaignsState } from "@/app/api/campaigns/state";
import { hashEvalInputs } from "@/lib/campaigns/store";

const CAMPAIGNS = [
  { id: "1001", name: "Brand", type: "search", status: "enabled", impressions: 1000, clicks: 50, cost: 200, conversions: 5, conversionValue: 2000 },
];

function baseInputs(overrides = {}) {
  return {
    meta: { source: "google-ads", period: "30d", syncedAt: "2026-07-10T00:00:00.000Z" },
    period: "30d",
    campaigns: CAMPAIGNS,
    changes: null,
    reports: {},
    inputHashes: {},
    histories: {},
    series: [],
    campaignSeries: {},
    snapshotSummaries: [],
    ...overrides,
  };
}

test("response shape has exactly the keys the client consumes", () => {
  const out = assembleCampaignsState(baseInputs());
  assert.deepEqual(
    Object.keys(out).sort(),
    [
      "campaignSeries",
      "campaigns",
      "changes",
      "histories",
      "meta",
      "reports",
      "series",
      "snapshotSummaries",
      "staleKeys",
    ].sort()
  );
});

test("meta passes through unchanged when the requested period IS the active one", () => {
  const out = assembleCampaignsState(baseInputs());
  assert.deepEqual(out.meta, {
    source: "google-ads",
    period: "30d",
    syncedAt: "2026-07-10T00:00:00.000Z",
  });
});

test("serving a non-active period rewrites meta.period + syncedAt to that period", () => {
  const out = assembleCampaignsState(
    baseInputs({
      period: "7d",
      meta: {
        source: "google-ads",
        period: "30d",
        syncedAt: "2026-07-10T00:00:00.000Z",
        syncedByPeriod: { "7d": "2026-07-12T00:00:00.000Z", "30d": "2026-07-10T00:00:00.000Z" },
      },
    })
  );
  assert.equal(out.meta.period, "7d");
  assert.equal(out.meta.syncedAt, "2026-07-12T00:00:00.000Z");
});

test("a report whose stored hash no longer matches the current data is stale", () => {
  // Store a hash for a DIFFERENT campaign set so it can't match the current one.
  const staleHash = hashEvalInputs("overall", null, "30d", [], null);
  const freshHash = hashEvalInputs("overall", null, "30d", CAMPAIGNS, null);
  assert.notEqual(staleHash, freshHash);

  const out = assembleCampaignsState(
    baseInputs({
      reports: { overall: { scope: "overall" }, "1001": { scope: "campaign" } },
      inputHashes: {
        overall: staleHash, // mismatches current → stale
        "1001": null, // pre-hashing report → never flagged
      },
    })
  );
  assert.deepEqual(out.staleKeys, ["overall"]);
});

test("no reports / no meta → empty staleKeys, never throws", () => {
  assert.deepEqual(assembleCampaignsState(baseInputs({ meta: null })).staleKeys, []);
  assert.deepEqual(assembleCampaignsState(baseInputs({ reports: {}, inputHashes: {} })).staleKeys, []);
});
