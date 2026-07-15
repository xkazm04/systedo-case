/** Direction 3 — the money unit proves itself. The pure verdict function
 *  (classifySklikMoneyUnit) over fixtures, the deterministic thresholds, moneyToCzk's
 *  mode-aware conversion, and that a confirmed-haléře adapter run divides spend +
 *  revenue by 100 while leaving the trusted native-CZK daily budget alone. All
 *  offline (fixture transport). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifySklikMoneyUnit,
  HALERE_SUSPECT_RATIO,
  MIN_EVALUABLE_CAMPAIGNS,
} from "@/lib/sklik/money-verdict";
import { moneyToCzk } from "@/lib/sklik/types";
import { SklikClient } from "@/lib/sklik/client";
import { fetchSklikCampaigns } from "@/lib/sklik/adapter";

test("verdict: czk-plausible when spend tracks the daily budget", () => {
  // 30-day spend ≈ budget × days → daily ratio ≈ 1, well under the threshold.
  const campaigns = [
    { cost: 9000, budgetPerDay: 300 }, // ratio 1.0
    { cost: 6000, budgetPerDay: 250 }, // ratio 0.8
    { cost: 12000, budgetPerDay: 300 }, // ratio 1.33
  ];
  assert.equal(classifySklikMoneyUnit(campaigns, 30), "czk-plausible");
});

test("verdict: halere-suspected when spend is ~100× the budget", () => {
  // Same campaigns but money reported in haléře (×100) → daily ratio ~100.
  const campaigns = [
    { cost: 900000, budgetPerDay: 300 },
    { cost: 600000, budgetPerDay: 250 },
    { cost: 1200000, budgetPerDay: 300 },
  ];
  assert.equal(classifySklikMoneyUnit(campaigns, 30), "halere-suspected");
});

test("verdict: threshold is inclusive and median-based (robust to one outlier)", () => {
  // Median of [1, 1, 100] = 1 → plausible: a single haywire campaign can't flip it.
  assert.equal(
    classifySklikMoneyUnit(
      [
        { cost: 300, budgetPerDay: 300 }, // ratio 1 (days=1)
        { cost: 300, budgetPerDay: 300 }, // ratio 1
        { cost: 30000, budgetPerDay: 300 }, // ratio 100
      ],
      1
    ),
    "czk-plausible"
  );
  // Median exactly at the threshold → suspected (≥ is inclusive).
  assert.equal(
    classifySklikMoneyUnit([{ cost: HALERE_SUSPECT_RATIO * 300, budgetPerDay: 300 }], 1),
    "halere-suspected"
  );
  // Just under → plausible.
  assert.equal(
    classifySklikMoneyUnit([{ cost: (HALERE_SUSPECT_RATIO - 1) * 300, budgetPerDay: 300 }], 1),
    "czk-plausible"
  );
});

test("verdict: insufficient-data with no evaluable campaigns / bad inputs", () => {
  assert.equal(classifySklikMoneyUnit([], 30), "insufficient-data");
  assert.equal(classifySklikMoneyUnit([{ cost: 0, budgetPerDay: 300 }], 30), "insufficient-data"); // no spend
  assert.equal(classifySklikMoneyUnit([{ cost: 9000 }], 30), "insufficient-data"); // no budget
  assert.equal(classifySklikMoneyUnit([{ cost: 9000, budgetPerDay: 300 }], 0), "insufficient-data"); // no days
  assert.ok(MIN_EVALUABLE_CAMPAIGNS >= 1);
});

test("moneyToCzk: native CZK by default, ÷100 only in halere mode", () => {
  assert.equal(moneyToCzk(5000), 5000);
  assert.equal(moneyToCzk(5000, "czk"), 5000);
  assert.equal(moneyToCzk(5000, "halere"), 50);
  assert.equal(moneyToCzk(undefined, "halere"), 0);
  assert.equal(moneyToCzk(99, "halere"), 1); // rounds
});

function fixtureTransport() {
  return {
    async call(method, params) {
      if (method === "client.loginByToken") return { session: "s", status: 200 };
      if (method === "campaigns.list") {
        return {
          session: "s",
          status: 200,
          campaigns: [{ id: 1, name: "Brand", status: "active", type: "fulltext", dayBudget: 300 }],
        };
      }
      if (method === "stats.campaigns") {
        assert.equal(params[1]?.granularity, "total");
        return {
          session: "s",
          status: 200,
          report: [{ campaignId: 1, stats: [{ money: 900000, conversionValue: 200000, conversions: 4, clicks: 40, impressions: 400 }] }],
        };
      }
      throw new Error(`unexpected ${method}`);
    },
  };
}

test("adapter halere mode: spend + revenue ÷100, budget stays native CZK", async () => {
  const czk = await fetchSklikCampaigns(new SklikClient(fixtureTransport(), "t"), "30d"); // default czk
  assert.equal(czk[0].cost, 900000); // native (haléře read as CZK — the lie)
  assert.equal(czk[0].conversionValue, 200000);
  assert.equal(czk[0].budgetPerDay, 300);

  const hal = await fetchSklikCampaigns(new SklikClient(fixtureTransport(), "t"), "30d", "halere");
  assert.equal(hal[0].cost, 9000); // ÷100 → the true CZK spend
  assert.equal(hal[0].conversionValue, 2000); // revenue ÷100 too
  assert.equal(hal[0].budgetPerDay, 300); // budget UNCHANGED (trusted CZK reference)
});
