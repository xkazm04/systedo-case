/** Widened daily-series spine (src/lib/campaigns/types.ts + sample.ts): DailyPoint
 *  carries optional clicks/impressions so CTR/CPC trends become computable, while
 *  legacy points (cost only) still read cleanly. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailyCtr,
  dailyCpc,
  dailyMetricValues,
  seriesSupportsMetric,
} from "@/lib/campaigns/types";
import { sampleSeries, sampleCampaignSeries, sampleCampaigns } from "@/lib/campaigns/sample";
import { CAMPAIGN_PERIOD_DAYS } from "@/lib/campaigns/types";

test("dailyCtr / dailyCpc are null on legacy (spine-less) points and zero denominators", () => {
  // Legacy point: no clicks/impressions.
  const legacy = { date: "2026-07-01", cost: 100, conversions: 1, conversionValue: 500 };
  assert.equal(dailyCtr(legacy), null);
  assert.equal(dailyCpc(legacy), null);
  // Zero denominators.
  assert.equal(dailyCtr({ ...legacy, clicks: 0, impressions: 0 }), null);
  assert.equal(dailyCpc({ ...legacy, clicks: 0, impressions: 100 }), null);
  // Full spine → real ratios.
  const p = { date: "2026-07-01", cost: 100, conversions: 1, conversionValue: 500, clicks: 20, impressions: 1000 };
  assert.equal(dailyCtr(p), 20 / 1000);
  assert.equal(dailyCpc(p), 100 / 20);
});

test("seriesSupportsMetric requires the spine for CTR/CPC; cost always available", () => {
  const legacy = Array.from({ length: 5 }, (_, i) => ({
    date: `2026-07-0${i + 1}`, cost: 10, conversions: 1, conversionValue: 50,
  }));
  assert.equal(seriesSupportsMetric(legacy, "cost"), true);
  assert.equal(seriesSupportsMetric(legacy, "ctr"), false);
  assert.equal(seriesSupportsMetric(legacy, "cpc"), false);

  const spined = legacy.map((p, i) => ({ ...p, clicks: 3 + i, impressions: 200 + i }));
  assert.equal(seriesSupportsMetric(spined, "ctr"), true);
  assert.equal(seriesSupportsMetric(spined, "cpc"), true);
});

test("dailyMetricValues drops undefined-ratio points, keeps every cost point", () => {
  const pts = [
    { date: "a", cost: 100, conversions: 1, conversionValue: 500, clicks: 10, impressions: 1000 },
    { date: "b", cost: 50, conversions: 0, conversionValue: 0 }, // legacy — no ratio
    { date: "c", cost: 80, conversions: 1, conversionValue: 400, clicks: 8, impressions: 800 },
  ];
  assert.deepEqual(dailyMetricValues(pts, "cost"), [100, 50, 80]);
  assert.deepEqual(dailyMetricValues(pts, "cpc"), [100 / 10, 80 / 8]);
  assert.deepEqual(dailyMetricValues(pts, "ctr"), [10 / 1000, 8 / 800]);
});

test("sample providers now emit clicks/impressions on every daily point", () => {
  for (const period of ["7d", "30d", "90d"]) {
    const portfolio = sampleSeries(period);
    assert.equal(portfolio.length, CAMPAIGN_PERIOD_DAYS[period]);
    for (const p of portfolio) {
      assert.equal(typeof p.clicks, "number");
      assert.equal(typeof p.impressions, "number");
      assert.ok(p.impressions >= p.clicks, "impressions >= clicks");
    }
    assert.ok(seriesSupportsMetric(portfolio, "ctr"));
    assert.ok(seriesSupportsMetric(portfolio, "cpc"));
  }

  const byId = sampleCampaignSeries("30d");
  for (const points of Object.values(byId)) {
    assert.ok(points.every((p) => typeof p.clicks === "number" && typeof p.impressions === "number"));
    assert.ok(seriesSupportsMetric(points, "cpc"));
  }
});

test("sample DailyPoint spine is internally consistent (ratios stay believable)", () => {
  // Brand search vs Performance Max keep distinct CTR levels through the spine.
  const byId = sampleCampaignSeries("30d");
  const ids = sampleCampaigns("30d").map((c) => c.id);
  for (const id of ids) {
    const pts = byId[id];
    for (const p of pts) {
      const ctr = dailyCtr(p);
      if (ctr !== null) assert.ok(ctr >= 0 && ctr <= 1, `${id} CTR in [0,1]`);
    }
  }
});
