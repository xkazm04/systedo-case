/** Direction 3: one ratio & delta spine. Proves the shared weekday-weights bundle
 *  is numerically identical to each detector re-deriving its own weights, that the
 *  snapshot exposes the real prior-window totals (snap.previous, not a delta
 *  inversion), and that poas() matches its inline formula. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAnomalies } from "@/lib/metrics/anomalies";
import { detectTrends } from "@/lib/metrics/trends";
import { monthlyPacing } from "@/lib/metrics/pacing";
import { weekdayWeightsBundle } from "@/lib/metrics/seasonality";
import { buildMetricsSnapshot } from "@/lib/metrics/snapshot";
import { evaluatePeriod } from "@/lib/metrics/series";
import { poas } from "@/lib/metrics/ratios";

/** 120 days with weekday seasonality + a mid-series spike and cost runaway, so the
 *  detectors actually fire and the weights matter. */
function series() {
  const out = [];
  const base = new Date("2026-01-05T00:00:00Z").getTime();
  for (let i = 0; i < 120; i++) {
    const d = new Date(base + i * 86_400_000);
    const dow = d.getUTCDay();
    const w = dow === 0 || dow === 6 ? 0.7 : 1;
    let cost = Math.round(2000 * w);
    let revenue = Math.round(12000 * w);
    let conversions = Math.round(40 * w);
    if (i === 80) { revenue = 40000; conversions = 120; }
    if (i >= 90 && i <= 92) cost = 9000;
    out.push({ date: d.toISOString().slice(0, 10), visits: Math.round(1000 * w), cost, conversions, revenue });
  }
  return out;
}

const data = {
  client: { name: "T", domain: "t.cz", segment: "e-shop", currency: "CZK", managedBy: "x" },
  meta: { disclaimer: "", asOf: "2026-05-04", days: 120, seed: 1 },
  goals: { pno: 0.18, monthlyRevenue: 400000 },
  channels: [],
  daily: series(),
};

test("shared weekday-weights bundle is byte-identical to per-detector derivation", () => {
  const daily = data.daily;
  const goals = data.goals;
  const weights = weekdayWeightsBundle(daily);

  assert.deepEqual(
    detectAnomalies(daily, goals, { weights }),
    detectAnomalies(daily, goals),
    "anomalies identical with shared weights"
  );
  assert.deepEqual(
    detectTrends(daily, { weights }),
    detectTrends(daily),
    "trends identical with shared weights"
  );
  assert.deepEqual(
    monthlyPacing(daily, goals.monthlyRevenue, weights.revenue),
    monthlyPacing(daily, goals.monthlyRevenue),
    "pacing identical with shared revenue weights"
  );
});

test("snapshot exposes the real prior-window totals (not a delta inversion)", () => {
  const snap = buildMetricsSnapshot(data, { key: "30d", label: "30 dní", days: 30 });
  const result = evaluatePeriod(data.daily, 30, "previous");
  // snap.previous is the totals of the equal-length comparison window itself, so a
  // consumer reads it directly instead of reconstructing current/(1+delta).
  assert.deepEqual(snap.previous, result.previous);
});

test("poas() equals the guarded gross-profit / cost formula", () => {
  for (const [gp, cost] of [[500, 100], [0, 100], [500, 0], [-50, 200]]) {
    assert.equal(poas(gp, cost), cost > 0 ? gp / cost : 0);
  }
});
