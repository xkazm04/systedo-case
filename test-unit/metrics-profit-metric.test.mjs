/** Unit tests for the first-class `profit` metric (revenue − cost) — the
 *  absolute contribution figure the efficiency ratios (PNO/ROAS) can't express:
 *  a rising-revenue/rising-cost account can be flat on contribution while every
 *  headline ratio looks green. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { totalsOf } from "@/lib/metrics/totals";
import { evaluatePeriod } from "@/lib/metrics/series";
import { channelRows } from "@/lib/metrics/channels";
import { METRICS, TREND_METRICS, HEADLINE_METRICS, RATIO_METRICS } from "@/lib/metrics/meta";

const day = (date, revenue, cost) => ({ date, visits: 100, cost, conversions: 2, revenue });

test("totalsOf derives profit = revenue − cost (negative days included)", () => {
  const t = totalsOf([day("2026-01-01", 5000, 1200), day("2026-01-02", 800, 1000)]);
  assert.equal(t.profit, 5800 - 2200);

  const burning = totalsOf([day("2026-01-01", 500, 900)]);
  assert.equal(burning.profit, -400, "contribution can go negative");
});

test("evaluatePeriod carries profit totals, delta and significance", () => {
  // previous window: 1000/day profit; current window: 1500/day profit
  const iso = (d) => `2026-01-${String(d).padStart(2, "0")}`;
  const daily = [
    ...Array.from({ length: 7 }, (_, i) => day(iso(i + 1), 2000, 1000)),
    ...Array.from({ length: 7 }, (_, i) => day(iso(i + 8), 2500, 1000)),
  ];
  const r = evaluatePeriod(daily, 7);
  assert.equal(r.current.profit, 7 * 1500);
  assert.equal(r.previous.profit, 7 * 1000);
  assert.ok(Math.abs(r.delta.profit - 0.5) < 1e-9, "profit up 50 %");
  assert.equal(r.significance.profit, "strong");
});

test("channel rows carry profit and reconcile with the period totals", () => {
  const totals = totalsOf([day("2026-01-01", 10_000, 2_000)]);
  const channels = [
    { channel: "A", color: "#000", shares: { visits: 0.5, cost: 0.7, conversions: 0.5, revenue: 0.6 } },
    { channel: "B", color: "#000", shares: { visits: 0.5, cost: 0.3, conversions: 0.5, revenue: 0.4 } },
  ];
  const rows = channelRows(channels, totals);
  const a = rows.find((r) => r.channel === "A");
  assert.equal(a.profit, 10_000 * 0.6 - 2_000 * 0.7);
  // channel shares each sum to 1, so channel profits sum to the total profit
  const summed = rows.reduce((s, r) => s + r.profit, 0);
  assert.ok(Math.abs(summed - totals.profit) < 1e-9);
});

test("metadata: CZK-formatted, up-is-good, plottable — but not a headline card", () => {
  assert.equal(METRICS.profit.goodDirection, "up");
  assert.ok(METRICS.profit.plottable);
  assert.ok(METRICS.profit.format(12_345).includes("Kč"));
  assert.ok(TREND_METRICS.includes("profit"), "offered as a trend toggle");
  assert.ok(!HEADLINE_METRICS.includes("profit"), "5-card headline layout preserved");
  assert.ok(!RATIO_METRICS.has("profit"), "additive metric — y-axis stays zero-anchored");
});
