/** Demo reconciliation (src/lib/campaigns/envelope.ts + sample.ts scaling):
 *  the keyless sample campaigns and the case-study dashboard both describe
 *  Mionelo, so the campaign console's Google Ads totals must land on the
 *  dashboard's same-window Google channel share instead of a tuned-in-isolation
 *  portfolio (previously ~2× apart on cost). The dataset is injected (the test
 *  reads the committed JSON itself) because the resolve hook can't load JSON
 *  modules — same pattern as the dataset-* tests. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { googleDemoEnvelope } from "@/lib/campaigns/envelope";
import { sampleCampaigns } from "@/lib/campaigns/sample";
import { CAMPAIGN_PERIOD_DAYS, withMetrics } from "@/lib/campaigns/types";
import { triage } from "@/lib/campaigns/triage";

const data = JSON.parse(
  readFileSync(new URL("../src/data/performance.json", import.meta.url), "utf8")
);

const DAY_MS = 86_400_000;
const MONDAY = Date.UTC(2026, 6, 6); // Mon 2026-07-06 (a fixed drift week)

const sum = (rows, key) => rows.reduce((a, r) => a + r[key], 0);
const relDiff = (a, b) => Math.abs(a - b) / b;

test("googleDemoEnvelope projects the Google shares onto the window totals", () => {
  const synthetic = {
    daily: [
      { date: "2026-01-01", visits: 100, cost: 100, conversions: 5, revenue: 1000 },
      { date: "2026-01-02", visits: 100, cost: 300, conversions: 5, revenue: 3000 },
    ],
    channels: [
      { channel: "Google Ads (Search + PMax)", color: "#000", shares: { visits: 0.5, cost: 0.4, conversions: 0.5, revenue: 0.3 } },
      { channel: "Google Nákupy", color: "#000", shares: { visits: 0.2, cost: 0.1, conversions: 0.2, revenue: 0.2 } },
      { channel: "Meta (FB / IG)", color: "#000", shares: { visits: 0.3, cost: 0.5, conversions: 0.3, revenue: 0.5 } },
    ],
  };
  // whole window: cost 400 × (0.4+0.1), revenue 4000 × (0.3+0.2)
  assert.deepEqual(googleDemoEnvelope(synthetic, 2), { cost: 200, value: 2000 });
  // shorter window slices the tail only: cost 300 × 0.5, revenue 3000 × 0.5
  assert.deepEqual(googleDemoEnvelope(synthetic, 1), { cost: 150, value: 1500 });
  // degenerate inputs → null (callers keep the unscaled profiles)
  assert.equal(googleDemoEnvelope({ daily: [], channels: synthetic.channels }, 7), null);
  assert.equal(googleDemoEnvelope({ daily: synthetic.daily, channels: [] }, 7), null);
});

test("the committed dataset yields a usable envelope for every period", () => {
  for (const period of ["7d", "30d", "90d"]) {
    const env = googleDemoEnvelope(data, CAMPAIGN_PERIOD_DAYS[period]);
    assert.ok(env, `${period}: envelope exists`);
    assert.ok(env.cost > 0 && env.value > 0, `${period}: positive totals`);
  }
});

test("sample campaign totals reconcile with the dashboard's Google share", () => {
  for (const period of ["7d", "30d", "90d"]) {
    const env = googleDemoEnvelope(data, CAMPAIGN_PERIOD_DAYS[period]);
    // Across several drift weeks: jitter (±5 % per campaign) and the weekly
    // mover (±16 % on one campaign) leave the AGGREGATE within a slim band.
    for (let w = 0; w < 6; w++) {
      const now = MONDAY + w * 7 * DAY_MS;
      const rows = sampleCampaigns(period, undefined, "mionelo", now, env);
      assert.ok(
        relDiff(sum(rows, "cost"), env.cost) < 0.15,
        `${period} week ${w}: cost ${sum(rows, "cost")} ≈ envelope ${Math.round(env.cost)}`
      );
      assert.ok(
        relDiff(sum(rows, "conversionValue"), env.value) < 0.15,
        `${period} week ${w}: value ${sum(rows, "conversionValue")} ≈ envelope ${Math.round(env.value)}`
      );
    }
  }
});

test("scaling preserves the per-campaign story (weights, triage, budgets)", () => {
  const env = googleDemoEnvelope(data, CAMPAIGN_PERIOD_DAYS["30d"]);
  const plain = sampleCampaigns("30d", undefined, "mionelo", MONDAY);
  const scaled = sampleCampaigns("30d", undefined, "mionelo", MONDAY, env);

  // Relative cost weights are unchanged — one uniform factor, same seeds.
  const plainTotal = sum(plain, "cost");
  const scaledTotal = sum(scaled, "cost");
  for (let i = 0; i < plain.length; i++) {
    assert.ok(
      Math.abs(plain[i].cost / plainTotal - scaled[i].cost / scaledTotal) < 0.02,
      `${plain[i].id}: cost share preserved`
    );
  }

  // The demo triage story survives: paused Video still spends (critical) and
  // brand Search stays healthy — the e2e suite depends on both existing.
  const rows = scaled.map(withMetrics);
  const video = rows.find((c) => c.id === "1007");
  assert.equal(triage(video).severity, "critical");
  const brand = rows.find((c) => c.id === "1001");
  assert.equal(triage(brand).severity, "ok");

  // Budgets scale with their campaigns, so the budget-limited brand Search
  // stays budget-limited instead of gaining phantom headroom.
  assert.ok(video.budgetPerDay > 0 && brand.budgetPerDay > 0);
  const pacingPlain = plain[0].cost / (CAMPAIGN_PERIOD_DAYS["30d"] * plain[0].budgetPerDay);
  const pacingScaled = scaled[0].cost / (CAMPAIGN_PERIOD_DAYS["30d"] * scaled[0].budgetPerDay);
  assert.ok(Math.abs(pacingPlain - pacingScaled) < 0.03, "brand pacing ratio preserved");
});

test("no envelope → the original tuned profiles, byte-identical", () => {
  assert.deepEqual(
    sampleCampaigns("30d", undefined, "mionelo", MONDAY, null),
    sampleCampaigns("30d", undefined, "mionelo", MONDAY)
  );
});
