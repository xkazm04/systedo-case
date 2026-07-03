/** Guards for the paid-traffic pair (impressions + clicks) added to the daily
 *  series and the CTR/CPC metrics derived from it. Reads the committed JSON so
 *  the invariants survive an `--as-of` refresh, and exercises the graceful
 *  fallback for datasets that never measured paid traffic. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { totalsOf } from "@/lib/metrics/totals";
import { evaluatePeriod } from "@/lib/metrics/series";
import { METRICS, TREND_METRICS } from "@/lib/metrics/meta";

const data = JSON.parse(
  readFileSync(new URL("../src/data/performance.json", import.meta.url), "utf8")
);

test("every committed day carries a sane impressions/clicks pair", () => {
  for (const p of data.daily) {
    assert.equal(typeof p.impressions, "number", `${p.date}: impressions present`);
    assert.equal(typeof p.clicks, "number", `${p.date}: clicks present`);
    assert.ok(p.clicks >= 0, `${p.date}: clicks non-negative`);
    assert.ok(p.clicks <= p.visits, `${p.date}: clicks are a share of visits`);
    assert.ok(p.impressions >= p.clicks, `${p.date}: impressions ≥ clicks`);
  }
});

test("blended CTR sits in a believable band and improves as the account matures", () => {
  const ctrOf = (points) => totalsOf(points).ctr;
  const first = ctrOf(data.daily.slice(0, 90));
  const last = ctrOf(data.daily.slice(-90));
  assert.ok(first > 0.005 && first < 0.05, `early CTR believable (${first})`);
  assert.ok(last > 0.005 && last < 0.05, `late CTR believable (${last})`);
  assert.ok(last > first, "CTR improves over the two years");
});

test("totalsOf derives CTR/CPC from the pair and falls back to 0 without it", () => {
  const withPair = totalsOf([
    { date: "2026-01-01", visits: 100, cost: 500, conversions: 5, revenue: 5000, impressions: 4000, clicks: 80 },
    { date: "2026-01-02", visits: 100, cost: 300, conversions: 5, revenue: 5000, impressions: 6000, clicks: 120 },
  ]);
  assert.equal(withPair.impressions, 10_000);
  assert.equal(withPair.clicks, 200);
  assert.equal(withPair.ctr, 0.02);
  assert.equal(withPair.cpc, 4);

  // legacy shape (no paid-traffic fields) — everything else untouched, CTR/CPC 0
  const legacy = totalsOf([
    { date: "2026-01-01", visits: 100, cost: 500, conversions: 5, revenue: 5000 },
  ]);
  assert.equal(legacy.impressions, 0);
  assert.equal(legacy.clicks, 0);
  assert.equal(legacy.ctr, 0);
  assert.equal(legacy.cpc, 0);
  assert.equal(legacy.revenue, 5000);
});

test("evaluatePeriod carries CTR/CPC deltas + significance like every metric", () => {
  const r = evaluatePeriod(data.daily, 30);
  for (const key of ["ctr", "cpc"]) {
    assert.equal(typeof r.delta[key], "number", `${key} delta`);
    assert.ok(["strong", "weak", "noise"].includes(r.significance[key]), `${key} significance`);
  }
  assert.ok(r.current.cpc > 0, "current window has a real CPC");
});

test("metric metadata exposes the new KPIs with the right good-direction", () => {
  assert.equal(METRICS.ctr.goodDirection, "up");
  assert.equal(METRICS.cpc.goodDirection, "down");
  assert.ok(METRICS.ctr.format(0.0199).includes("%"), "CTR formats as a percent");
  assert.ok(TREND_METRICS.includes("ctr") && TREND_METRICS.includes("cpc"), "plottable toggles");
});
