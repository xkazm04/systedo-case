/** Pins the anomaly detector's behaviour across the statistical-hygiene refactor
 *  (one variance estimator + graceful low-data degradation). The full-coverage
 *  fixture proves EQUIVALENCE: the flagged set (date/metric/kind/observed/expected)
 *  and the money impact are byte-identical to the population-variance era; only the
 *  reported z rescales by the known √((n−1)/n) factor of the sample estimator.
 *  Runs the TS source directly via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAnomalies, anomalyImpact } from "@/lib/metrics/anomalies";
import { seriesCoverage, anomalyThreshold, ANOMALY_Z } from "@/lib/metrics/config";

/** Deterministic 84-day series: weekday seasonality (weekends −30 %), a revenue
 *  spike (day 60), a 3-day cost runaway (days 68–70) and a revenue outage (day
 *  75) — self-contained, so a dataset `--as-of` refresh can never move these. */
function fixture() {
  const out = [];
  const base = new Date("2026-01-05T00:00:00Z").getTime(); // Monday
  for (let i = 0; i < 84; i++) {
    const d = new Date(base + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 0.7 : 1;
    let visits = Math.round(1000 * weekend);
    let cost = Math.round(2000 * weekend);
    let conversions = Math.round(40 * weekend);
    let revenue = Math.round(12000 * weekend);
    if (i === 60) { revenue = 40000; conversions = 120; }
    if (i >= 68 && i <= 70) { cost = 9000; }
    if (i === 75) { revenue = 300; conversions = 1; }
    out.push({ date: iso, visits, cost, conversions, revenue });
  }
  return out;
}

/** Golden flagged set (variance-independent fields) + the population-variance z
 *  that day carried before the refactor, captured from the pre-refactor code. */
const GOLDEN = [
  { date: "2026-03-06", metric: "revenue", kind: "spike", observed: 40000, expected: 14178.918169209432, popZ: 26.109678109671364 },
  { date: "2026-03-06", metric: "conversions", kind: "spike", observed: 120, expected: 46.296809986130384, popZ: 25.150492028353337 },
  { date: "2026-03-14", metric: "cost", kind: "spike", observed: 9000, expected: 1786.7895545314902, popZ: 24.89758128486756 },
  { date: "2026-03-14", metric: "pno", kind: "goal-breach", observed: 1.0714285714285714, expected: 0.18, popZ: 24.89758128486756 },
  { date: "2026-03-15", metric: "cost", kind: "spike", observed: 9000, expected: 2058.218125960062, popZ: 5.085660718044174 },
  { date: "2026-03-15", metric: "pno", kind: "goal-breach", observed: 1.0714285714285714, expected: 0.18, popZ: 5.085660718044174 },
  { date: "2026-03-16", metric: "cost", kind: "spike", observed: 9000, expected: 2959.797033567527, popZ: 2.5430523643081724 },
  { date: "2026-03-16", metric: "pno", kind: "goal-breach", observed: 0.75, expected: 0.18, popZ: 2.5430523643081724 },
  { date: "2026-03-21", metric: "conversions", kind: "outage", observed: 1, expected: 27.12244897959184, popZ: -3.407602023060738 },
  { date: "2026-03-21", metric: "revenue", kind: "outage", observed: 300, expected: 8180.730897009967, popZ: -3.0086634835691988 },
  { date: "2026-03-21", metric: "pno", kind: "goal-breach", observed: 4.666666666666667, expected: 0.18, popZ: 3.0086634835691988 },
];

test("full coverage: flagged set + money impact are UNCHANGED by the variance refactor", () => {
  const daily = fixture();
  assert.equal(seriesCoverage(daily.length), "full");

  const anomalies = detectAnomalies(daily, { pno: 0.18 });

  // The business-meaningful output — which day, which metric, which kind, and the
  // observed vs de-seasonalised-expected values — is byte-identical.
  assert.deepEqual(
    anomalies.map((a) => ({ date: a.date, metric: a.metric, kind: a.kind, observed: a.observed, expected: a.expected })),
    GOLDEN.map(({ popZ, ...rest }) => rest)
  );

  // The reported z rescales by exactly √((n−1)/n) (n = 28-day baseline): the
  // sample estimator's only visible effect. Same sign, same ranking, <2 % smaller.
  const factor = Math.sqrt(27 / 28);
  anomalies.forEach((a, i) => {
    assert.ok(Math.abs(a.z - GOLDEN[i].popZ * factor) < 1e-9, `z[${i}] rescaled by √((n−1)/n)`);
  });

  // And the recalibrated flag threshold makes those decisions provably identical.
  const eff = anomalyThreshold(ANOMALY_Z, 28);
  for (const a of anomalies.filter((x) => x.kind !== "goal-breach")) {
    assert.ok(Math.abs(a.z) >= eff - 1e-12, "every non-breach flag clears the recalibrated bar");
  }

  const impact = anomalyImpact(anomalies);
  assert.deepEqual(impact, {
    revenue: -7880.730897009967,
    cost: 20195.19528594092,
    net: -28075.926182950887,
    gained: 25821.08183079057,
    count: 5,
  });
});

test("coverage tiers key off series length", () => {
  assert.equal(seriesCoverage(29), "full");
  assert.equal(seriesCoverage(28), "degraded");
  assert.equal(seriesCoverage(10), "degraded");
  assert.equal(seriesCoverage(9), "insufficient");
  assert.equal(seriesCoverage(0), "insufficient");
});

test("degraded coverage still surfaces a clear spike (no more 29-day cliff)", () => {
  // 20 days: below the old 29-day floor, which returned [] silently. A blatant
  // revenue spike on the last day must still be flagged under the shorter baseline.
  const base = new Date("2026-02-02T00:00:00Z").getTime();
  const daily = [];
  for (let i = 0; i < 20; i++) {
    const iso = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    daily.push({ date: iso, visits: 1000, cost: 2000, conversions: 40, revenue: i === 19 ? 60000 : 12000 });
  }
  assert.equal(seriesCoverage(daily.length), "degraded");
  const anomalies = detectAnomalies(daily, { pno: 0.18 });
  assert.ok(
    anomalies.some((a) => a.date === daily[19].date && a.metric === "revenue" && a.kind === "spike"),
    "the degraded pass flags the spike the old code would have missed entirely"
  );
});

test("insufficient coverage returns no anomalies", () => {
  const base = new Date("2026-02-02T00:00:00Z").getTime();
  const daily = [];
  for (let i = 0; i < 8; i++) {
    const iso = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    daily.push({ date: iso, visits: 1000, cost: 2000, conversions: 40, revenue: i === 7 ? 90000 : 12000 });
  }
  assert.equal(seriesCoverage(daily.length), "insufficient");
  assert.deepEqual(detectAnomalies(daily, { pno: 0.18 }), []);
});
