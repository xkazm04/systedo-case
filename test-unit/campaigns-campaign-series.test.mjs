/** Per-campaign sample series (src/lib/campaigns/sample.ts sampleCampaignSeries)
 *  behind the table sparklines: deterministic per (seedKey, campaign, period,
 *  date), one entry per campaign spec, one point per day, ascending dates. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMPAIGN_PERIOD_DAYS } from "@/lib/campaigns/types";
import { sampleCampaigns, sampleCampaignSeries } from "@/lib/campaigns/sample";

test("sampleCampaignSeries is deterministic and keyed by the sample campaign ids", () => {
  const a = sampleCampaignSeries("30d");
  const b = sampleCampaignSeries("30d");
  assert.deepEqual(a, b);

  const ids = sampleCampaigns("30d").map((c) => c.id).sort();
  assert.deepEqual(Object.keys(a).sort(), ids);
});

test("each campaign gets one point per day, dates ascending, values non-negative", () => {
  for (const period of ["7d", "30d", "90d"]) {
    const byId = sampleCampaignSeries(period);
    for (const [id, points] of Object.entries(byId)) {
      assert.equal(points.length, CAMPAIGN_PERIOD_DAYS[period], `${id} ${period} day count`);
      for (let i = 1; i < points.length; i++) {
        assert.ok(points[i].date > points[i - 1].date, `${id} dates ascend`);
      }
      for (const p of points) {
        assert.ok(p.cost >= 0 && p.conversions >= 0 && p.conversionValue >= 0);
      }
    }
  }
});

test("campaign shapes are distinct (independent seeds) and scale with the spec", () => {
  const byId = sampleCampaignSeries("30d");
  const sum = (id) => byId[id].reduce((a, p) => a + p.cost, 0);
  // Brand search (small spend) vs Performance Max (portfolio workhorse).
  assert.ok(sum("1003") > sum("1001") * 5, "PMax daily spend dwarfs brand Search");
  // Different campaigns never share the identical cost walk.
  assert.notDeepEqual(
    byId["1001"].map((p) => p.cost),
    byId["1002"].map((p) => p.cost)
  );
});

test("a different seed key produces a different (but stable) walk", () => {
  const a = sampleCampaignSeries("7d", undefined, "mionelo");
  const b = sampleCampaignSeries("7d", undefined, "other-project");
  assert.notDeepEqual(a, b);
});
