/** Direction 3 — the time edges get filed down. Pins for:
 *  - pacing daysElapsed counting PRESENT days (gappy month no longer reads behind);
 *  - the de-seasonalisation weight floor (tiny weekday weight can't manufacture a
 *    spike), with normal weights left byte-identical;
 *  - weekdayProfile reusing a shared weekday-weights bundle (byte-identical) and the
 *    snapshot exposing that bundle.
 *  (The 364-vs-365 YoY shift is pinned in metrics-yoy.test.mjs.) Runs the TS source
 *  via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyPacing } from "@/lib/metrics/pacing";
import {
  seasonalWeight,
  DESEASON_WEIGHT_FLOOR,
  weekdayProfile,
  weekdayWeightsBundle,
} from "@/lib/metrics/seasonality";
import { buildMetricsSnapshot } from "@/lib/metrics/snapshot";

/** A weekday-seasonal daily series: `n` days from `start`, revenue chosen per UTC
 *  day-of-week by `revenueFor` (other metrics flat). */
function seasonalDays(start, n, revenueFor) {
  const out = [];
  const base = new Date(`${start}T00:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    const d = new Date(base + i * 86_400_000);
    out.push({
      date: d.toISOString().slice(0, 10),
      visits: 100,
      cost: 100,
      conversions: 2,
      revenue: revenueFor(d.getUTCDay()),
    });
  }
  return out;
}

// --- 3b: pacing counts present days -----------------------------------------

test("3b: pacing counts present days, so a gappy month doesn't read behind pace", () => {
  // May 2026, flat 1000/day, but only 10 of the first 20 days are present.
  const presentDoms = [1, 3, 5, 7, 9, 11, 13, 15, 17, 20];
  const daily = presentDoms.map((d) => ({
    date: `2026-05-${String(d).padStart(2, "0")}`,
    visits: 100,
    cost: 100,
    conversions: 2,
    revenue: 1000,
  }));
  const p = monthlyPacing(daily, 31_000);
  assert.ok(p);
  assert.equal(p.daysElapsed, 10, "present days, not the day-of-month (20)");
  assert.equal(p.mtd, 10_000);
  // On pace: prorated to 10 present days = 31000 × 10/31 = 10000 = mtd.
  assert.ok(Math.abs(p.pace) < 1e-9, "reads on pace");
  assert.equal(p.onPace, true);
  // The old day-of-month proration (20/31) would have read the account ~50% behind.
  const oldProrated = 31_000 * (20 / 31);
  assert.ok((10_000 - oldProrated) / oldProrated < -0.4, "DOM proration read behind");
});

test("3b: a gapless month is unchanged (present count == day-of-month)", () => {
  const daily = [];
  for (let d = 1; d <= 20; d++) {
    daily.push({ date: `2026-05-${String(d).padStart(2, "0")}`, visits: 100, cost: 100, conversions: 2, revenue: 1000 });
  }
  const p = monthlyPacing(daily, 31_000);
  assert.equal(p.daysElapsed, 20);
  assert.equal(p.daysRemaining, 11);
  assert.equal(p.mtd, 20_000);
});

// --- 3c: de-seasonalisation weight floor ------------------------------------

test("3c: seasonalWeight floors tiny weights but leaves normal ones and the fallback", () => {
  assert.equal(DESEASON_WEIGHT_FLOOR, 0.25);
  assert.equal(seasonalWeight(0.02), 0.25, "tiny weight clamped to the floor");
  assert.equal(seasonalWeight(0.25), 0.25, "at the floor, unchanged");
  assert.equal(seasonalWeight(0.9), 0.9, "weights ≥ floor unchanged");
  assert.equal(seasonalWeight(1.4), 1.4);
  assert.equal(seasonalWeight(0), 1, "non-positive → flat-1 fallback");
  assert.equal(seasonalWeight(-3), 1);
});

test("3c: the floor caps de-seasonalisation so a tiny weekday weight can't manufacture a spike", () => {
  // The manufactured-spike mechanism: dividing an ordinary value by a near-zero
  // weekday weight. The old code divided by the raw weight; the floor caps it.
  const value = 1000;
  const tinyWeight = 0.02;
  const rawAdj = value / (tinyWeight > 0 ? tinyWeight : 1); // OLD path → 50 000
  const flooredAdj = value / seasonalWeight(tinyWeight); //     NEW path → 4 000
  assert.equal(rawAdj, 50_000);
  assert.equal(flooredAdj, 4_000);
  assert.ok(rawAdj / flooredAdj >= 10, "old amplification was an order of magnitude larger");
});

// --- 3d: weekdayProfile reuses the shared bundle ----------------------------

const perf = {
  client: { name: "T", domain: "t.cz", segment: "e-shop", currency: "CZK", managedBy: "x" },
  meta: { disclaimer: "", asOf: "2026-05-04", days: 120, seed: 1 },
  goals: { pno: 0.18, monthlyRevenue: 400_000 },
  channels: [],
  // Tuesday strong, Sunday weak — a real weekday shape so the weights matter.
  daily: seasonalDays("2026-01-05", 120, (dow) => (dow === 2 ? 1600 : dow === 0 ? 500 : 1000)),
};

test("3d: weekdayProfile with the shared bundle weights is byte-identical to deriving its own", () => {
  const bundle = weekdayWeightsBundle(perf.daily);
  assert.deepEqual(
    weekdayProfile(perf.daily, "revenue", bundle.revenue),
    weekdayProfile(perf.daily)
  );
});

test("3d: the snapshot exposes the weekday-weights bundle for reuse", () => {
  const snap = buildMetricsSnapshot(perf, { key: "90d", label: "90 dní", days: 90 });
  assert.deepEqual(snap.weekdayWeights, weekdayWeightsBundle(perf.daily));
  // The digest/dashboard can build the profile straight off the snapshot's bundle.
  assert.deepEqual(
    weekdayProfile(perf.daily, "revenue", snap.weekdayWeights.revenue),
    weekdayProfile(perf.daily)
  );
});
