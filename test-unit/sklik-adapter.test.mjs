/** Sklik connector data-in adapter (src/lib/sklik/*): the SklikClient session
 *  handshake and the three fetchers that map Sklik's wire shapes onto the neutral
 *  Campaign / DailyPoint model. Runs the real client + adapter against a FIXTURE
 *  transport (no network), so the channel-type mapping, native-CZK money handling,
 *  status normalisation and daily-series aggregation are all exercised offline. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SklikClient } from "@/lib/sklik/client";
import {
  fetchSklikCampaigns,
  fetchSklikSeries,
  fetchSklikCampaignSeries,
} from "@/lib/sklik/adapter";
import { sklikChannelType, sklikStatus, moneyToCzk } from "@/lib/sklik/types";
import { seriesSupportsMetric } from "@/lib/campaigns/types";

const CAMPAIGNS = [
  { id: 101, name: "Fulltext · Brand", status: "active", type: "fulltext", dayBudget: 300 },
  { id: 102, name: "Obsahová síť", status: "suspend", type: "context", dayBudget: 0 },
  { id: 103, name: "Zboží", status: "active", type: "product" }, // no dayBudget, no stats
  { id: 104, name: "Smazaná", status: "active", type: "fulltext", deleted: true }, // excluded
  { id: 105, name: "Neznámý typ", status: "active", type: "mystery" }, // → fallback search
];

const TOTAL_REPORT = [
  { campaignId: 101, stats: [{ impressions: 1000, clicks: 100, money: 5000, conversions: 10, conversionValue: 20000 }] },
  { campaignId: 102, stats: [{ impressions: 500, clicks: 20, money: 1000, conversions: 1, conversionValue: 3000 }] },
  { campaignId: 105, stats: [{ impressions: 40, clicks: 4, money: 80, conversions: 0, conversionValue: 0 }] },
];

const DAILY_REPORT = [
  {
    campaignId: 101,
    stats: [
      { date: "2026-07-10", impressions: 400, clicks: 40, money: 2000, conversions: 4, conversionValue: 8000 },
      { date: "2026-07-11", impressions: 600, clicks: 60, money: 3000, conversions: 6, conversionValue: 12000 },
    ],
  },
  {
    campaignId: 102,
    stats: [
      { date: "2026-07-11", impressions: 500, clicks: 20, money: 1000, conversions: 1, conversionValue: 3000 },
    ],
  },
];

/** A fixture SklikTransport: canned responses per method, recording every call so
 *  the session handshake can be asserted. Rotates the session per response like
 *  the real API. */
function fixtureTransport() {
  const calls = [];
  let n = 0;
  return {
    calls,
    async call(method, params) {
      calls.push({ method, params });
      if (method === "client.loginByToken") return { session: `sess-${++n}`, status: 200 };
      if (method === "campaigns.list") return { session: `sess-${++n}`, status: 200, campaigns: CAMPAIGNS };
      if (method === "stats.campaigns") {
        const granularity = params[1]?.granularity;
        const report = granularity === "daily" ? DAILY_REPORT : TOTAL_REPORT;
        return { session: `sess-${++n}`, status: 200, report };
      }
      throw new Error(`unexpected Sklik method ${method}`);
    },
  };
}

test("pure mappers: channel type, status, native-CZK money", () => {
  assert.equal(sklikChannelType("fulltext"), "search");
  assert.equal(sklikChannelType("FULLTEXT"), "search"); // case-insensitive
  assert.equal(sklikChannelType("context"), "display");
  assert.equal(sklikChannelType("product"), "shopping");
  assert.equal(sklikChannelType("video"), "video");
  assert.equal(sklikChannelType("combined"), "performance_max");
  assert.equal(sklikChannelType("mystery"), "search"); // generic fallback
  assert.equal(sklikChannelType(undefined), "search");

  assert.equal(sklikStatus("active"), "enabled");
  assert.equal(sklikStatus("suspend"), "paused");
  assert.equal(sklikStatus(undefined), "paused");

  // Native CZK — NOT divided by 1e6 like Google micros.
  assert.equal(moneyToCzk(5000), 5000);
  assert.equal(moneyToCzk(undefined), 0);
});

test("fetchSklikCampaigns maps the neutral model (types, status, native cost, budget)", async () => {
  const transport = fixtureTransport();
  const client = new SklikClient(transport, "tok");
  const campaigns = await fetchSklikCampaigns(client, "30d");

  // Deleted campaign 104 is excluded; the other four survive.
  assert.deepEqual(campaigns.map((c) => c.id), ["101", "102", "103", "105"]);

  const brand = campaigns.find((c) => c.id === "101");
  assert.equal(brand.type, "search");
  assert.equal(brand.status, "enabled");
  assert.equal(brand.cost, 5000); // native CZK, no micros division
  assert.equal(brand.clicks, 100);
  assert.equal(brand.impressions, 1000);
  assert.equal(brand.conversionValue, 20000);
  assert.equal(brand.budgetPerDay, 300);

  const obsah = campaigns.find((c) => c.id === "102");
  assert.equal(obsah.type, "display");
  assert.equal(obsah.status, "paused");
  assert.ok(!("budgetPerDay" in obsah), "dayBudget 0 → budgetPerDay omitted");

  // 103 has no stats row → present with all-zero metrics (like the Google path).
  const zbozi = campaigns.find((c) => c.id === "103");
  assert.equal(zbozi.type, "shopping");
  assert.equal(zbozi.cost, 0);
  assert.equal(zbozi.clicks, 0);
  assert.ok(!("budgetPerDay" in zbozi), "missing dayBudget → budgetPerDay omitted");

  // Unknown Sklik type falls back to generic search.
  assert.equal(campaigns.find((c) => c.id === "105").type, "search");
});

test("session handshake: login once, reused across calls, campaignIds threaded", async () => {
  const transport = fixtureTransport();
  const client = new SklikClient(transport, "tok");
  await fetchSklikCampaigns(client, "7d");
  await fetchSklikSeries(client, "7d");

  // loginByToken is called exactly once for the client's lifetime.
  assert.equal(transport.calls.filter((c) => c.method === "client.loginByToken").length, 1);
  // campaigns.list is followed by a total-granularity stats call carrying the ids.
  const totalStats = transport.calls.find(
    (c) => c.method === "stats.campaigns" && c.params[1]?.granularity === "total"
  );
  assert.deepEqual(totalStats.params[1].campaignIds, [101, 102, 103, 105]);
  // Every authenticated call passes a { session } user struct as arg 0.
  for (const c of transport.calls.filter((c) => c.method !== "client.loginByToken")) {
    assert.equal(typeof c.params[0].session, "string");
  }
});

test("fetchSklikSeries sums daily stats across campaigns, sorted, with the CTR/CPC spine", async () => {
  const client = new SklikClient(fixtureTransport(), "tok");
  const series = await fetchSklikSeries(client, "30d");

  assert.deepEqual(series.map((p) => p.date), ["2026-07-10", "2026-07-11"]);
  // 07-10: only campaign 101. 07-11: 101 + 102 summed.
  assert.equal(series[0].cost, 2000);
  assert.equal(series[1].cost, 3000 + 1000);
  assert.equal(series[1].clicks, 60 + 20);
  assert.equal(series[1].impressions, 600 + 500);
  // Spine present → CTR/CPC trends computable.
  assert.ok(seriesSupportsMetric(series, "ctr"));
  assert.ok(seriesSupportsMetric(series, "cpc"));
});

test("fetchSklikCampaignSeries groups per campaign id (stringified)", async () => {
  const client = new SklikClient(fixtureTransport(), "tok");
  const byId = await fetchSklikCampaignSeries(client, "30d");

  assert.deepEqual(Object.keys(byId).sort(), ["101", "102"]);
  assert.deepEqual(byId["101"].map((p) => p.date), ["2026-07-10", "2026-07-11"]);
  assert.equal(byId["101"][1].cost, 3000);
  assert.equal(byId["102"].length, 1);
  assert.equal(byId["102"][0].clicks, 20);
});
