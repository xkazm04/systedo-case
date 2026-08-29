/** WP W1-G / ADR-0010 — the campaigns payload as a UNION of a project's
 *  per-account tenants (src/app/api/campaigns/state.ts).
 *
 *  The rules pinned here are the ones the console's honesty rests on:
 *    1. the union of ONE tenant is that tenant — byte-identical, and NOT one key
 *       wider (campaigns-state-shape.test.mjs pins the exact key set, and it must
 *       keep passing unmodified);
 *    2. rows carry their own network, tagged from the tenant's recorded SyncMeta
 *       source (so a degraded tenant's rows say "sample", not "google-ads");
 *    3. the PRIMARY tenant wins every collision, and losing an id is REPORTED
 *       rather than repaired — change-sets reference those ids;
 *    4. money is never summed across currencies;
 *    5. `changes` / `snapshotSummaries` stay primary-only, because they feed the
 *       mutation surfaces and a union read is not a union write.
 *
 *  Pure — no Firestore, no clock. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assembleCampaignsState,
  assembleProjectCampaignsState,
} from "@/app/api/campaigns/state";
import { hashEvalInputs } from "@/lib/campaigns/store";

const SHAPE_KEYS = [
  "campaignSeries",
  "campaigns",
  "changes",
  "histories",
  "meta",
  "reports",
  "series",
  "snapshotSummaries",
  "staleKeys",
].sort();

function campaign(id, over = {}) {
  return {
    id,
    name: `Kampaň ${id}`,
    type: "search",
    status: "enabled",
    impressions: 1000,
    clicks: 50,
    cost: 200,
    conversions: 5,
    conversionValue: 2000,
    ...over,
  };
}

function day(date, cost, over = {}) {
  return { date, cost, conversions: 1, conversionValue: cost * 4, ...over };
}

function inputs(over = {}) {
  return {
    meta: { source: "google-ads", period: "30d", syncedAt: "2026-08-20T00:00:00.000Z" },
    period: "30d",
    campaigns: [campaign("1001")],
    changes: null,
    reports: {},
    inputHashes: {},
    histories: {},
    series: [],
    campaignSeries: {},
    snapshotSummaries: [],
    ...over,
  };
}

const googlePart = (over = {}) => ({ source: "google-ads", inputs: inputs(over) });
const sklikPart = (over = {}) => ({
  source: "sklik",
  inputs: inputs({
    meta: { source: "sklik", period: "30d", syncedAt: "2026-08-21T00:00:00.000Z" },
    campaigns: [campaign("s-1")],
    ...over,
  }),
});

test("one tenant: the union IS that tenant — same payload, not one key wider", () => {
  const only = googlePart();
  const union = assembleProjectCampaignsState([only]);
  assert.deepStrictEqual(union, assembleCampaignsState(only.inputs));
  assert.deepEqual(Object.keys(union).sort(), SHAPE_KEYS);
  assert.equal("sources" in union, false);
  assert.equal("mixedCurrency" in union, false);
});

test("no tenant at all degrades to an empty payload instead of throwing", () => {
  const out = assembleProjectCampaignsState([]);
  assert.deepEqual(Object.keys(out).sort(), SHAPE_KEYS);
  assert.deepEqual(out.campaigns, []);
  assert.equal(out.meta, null);
});

test("two tenants: rows concatenate in precedence order and carry their source", () => {
  const out = assembleProjectCampaignsState([googlePart(), sklikPart()]);
  assert.deepEqual(
    out.campaigns.map((c) => [c.id, c.source]),
    [
      ["1001", "google-ads"],
      ["s-1", "sklik"],
    ]
  );
  // additive keys, present only above one tenant
  assert.equal(out.sources.length, 2);
  assert.deepEqual(
    out.sources.map((s) => [s.source, s.campaigns, s.collisions]),
    [
      ["google-ads", 1, 0],
      ["sklik", 1, 0],
    ]
  );
  // meta is the PRIMARY's, unchanged semantics
  assert.equal(out.meta.source, "google-ads");
  assert.equal(out.meta.syncedAt, "2026-08-20T00:00:00.000Z");
});

test("a row that already carries a source keeps it; a degraded tenant tags honestly", () => {
  const out = assembleProjectCampaignsState([
    // tenant labelled google-ads by precedence, but its last sync degraded and
    // recorded "sample" — its untagged rows must say "sample".
    {
      source: "google-ads",
      inputs: inputs({
        meta: { source: "sample", period: "30d", syncedAt: "2026-08-20T00:00:00.000Z", degraded: true },
        campaigns: [campaign("1001"), campaign("1002", { source: "google-ads" })],
      }),
    },
    sklikPart(),
  ]);
  assert.equal(out.campaigns[0].source, "sample");
  assert.equal(out.campaigns[1].source, "google-ads");
  assert.equal(out.sources[0].source, "sample");
});

test("id collision across tenants: the primary wins and the loss is counted", () => {
  const out = assembleProjectCampaignsState([
    googlePart({
      reports: { "1001": { scope: "campaign", who: "google" } },
      histories: { "1001": [{ score: 10 }] },
      campaignSeries: { "1001": [day("2026-08-01", 10)] },
    }),
    sklikPart({
      campaigns: [campaign("1001")],
      reports: { "1001": { scope: "campaign", who: "sklik" } },
      histories: { "1001": [{ score: 99 }] },
      campaignSeries: { "1001": [day("2026-08-01", 99)] },
    }),
  ]);
  assert.equal(out.reports["1001"].who, "google");
  assert.deepEqual(out.histories["1001"], [{ score: 10 }]);
  assert.equal(out.campaignSeries["1001"][0].cost, 10);
  // reported, never renamed — change-sets reference the ids
  assert.equal(out.sources[0].collisions, 0);
  assert.equal(out.sources[1].collisions, 1);
  // both rows still reach the table (nothing is silently dropped)
  assert.equal(out.campaigns.length, 2);
});

test("same currency: the portfolio series is summed per day, sorted by date", () => {
  const out = assembleProjectCampaignsState([
    googlePart({ series: [day("2026-08-02", 100), day("2026-08-01", 100)] }),
    sklikPart({ series: [day("2026-08-01", 50, { clicks: 7 })] }),
  ]);
  assert.equal(out.mixedCurrency, false);
  assert.deepEqual(out.series.map((p) => p.date), ["2026-08-01", "2026-08-02"]);
  assert.equal(out.series[0].cost, 150);
  assert.equal(out.series[1].cost, 100);
  // the optional spine is summed only over the points that carry it
  assert.equal(out.series[0].clicks, 7);
});

test("different currencies are NEVER summed: primary series alone + mixedCurrency", () => {
  const out = assembleProjectCampaignsState([
    googlePart({
      meta: { source: "google-ads", period: "30d", syncedAt: "2026-08-20T00:00:00.000Z", currency: "CZK" },
      series: [day("2026-08-01", 100)],
    }),
    sklikPart({
      meta: { source: "sklik", period: "30d", syncedAt: "2026-08-21T00:00:00.000Z", currency: "EUR" },
      series: [day("2026-08-01", 50)],
    }),
  ]);
  assert.equal(out.mixedCurrency, true);
  assert.equal(out.series.length, 1);
  assert.equal(out.series[0].cost, 100);
  assert.deepEqual(
    out.sources.map((s) => s.currency),
    ["CZK", "EUR"]
  );
  // an absent code reads as the base CZK, so it does not fake a mismatch
  const noCodes = assembleProjectCampaignsState([googlePart(), sklikPart()]);
  assert.equal(noCodes.mixedCurrency, false);
});

test("staleKeys are the union; changes and snapshots stay primary-only", () => {
  const staleHash = hashEvalInputs("overall", null, "30d", [], null);
  const changes = { current: null, items: [{ kind: "changed", campaignId: "1001" }] };
  const out = assembleProjectCampaignsState([
    googlePart({
      reports: { overall: { scope: "overall" } },
      inputHashes: { overall: staleHash },
      changes,
      snapshotSummaries: [{ at: "2026-08-20T00:00:00.000Z" }],
    }),
    sklikPart({
      reports: { "s-1": { scope: "campaign" } },
      inputHashes: { "s-1": staleHash },
      changes: { current: null, items: [{ kind: "changed", campaignId: "s-1" }] },
      snapshotSummaries: [{ at: "2026-08-21T00:00:00.000Z" }],
    }),
  ]);
  assert.deepEqual(out.staleKeys.sort(), ["overall", "s-1"]);
  assert.deepEqual(out.changes, changes);
  assert.equal(out.snapshotSummaries.length, 1);
  assert.equal(out.snapshotSummaries[0].at, "2026-08-20T00:00:00.000Z");
});
