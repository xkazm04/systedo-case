/** Unit tests for weekdayProfile (src/lib/metrics/seasonality.ts) — the
 *  user-facing day-of-week performance view derived from the same weights the
 *  forecast and anomaly detection already use. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekdayProfile, weekdayWeightsFor } from "@/lib/metrics/seasonality";

/** `weeks` full weeks of daily points starting on a Sunday, with revenue picked
 *  per UTC day-of-week by `revenueFor`. 2023-01-01 is a Sunday. */
function weeksOf(weeks, revenueFor) {
  const out = [];
  const base = Date.UTC(2023, 0, 1);
  for (let i = 0; i < weeks * 7; i++) {
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

test("flags the strongest and weakest weekday with indices around 1", () => {
  // Tuesdays strong (+), Sundays weak (−), everything else flat.
  const daily = weeksOf(8, (dow) => (dow === 2 ? 1500 : dow === 0 ? 600 : 1000));
  const profile = weekdayProfile(daily);

  assert.equal(profile.length, 7);
  assert.deepEqual(profile.map((p) => p.day), [0, 1, 2, 3, 4, 5, 6]);

  const best = profile.find((p) => p.best);
  const worst = profile.find((p) => p.worst);
  assert.equal(best.day, 2, "Tuesday is the best day");
  assert.equal(worst.day, 0, "Sunday is the worst day");
  assert.ok(best.index > 1.2, `Tuesday clearly above average (${best.index})`);
  assert.ok(worst.index < 0.8, `Sunday clearly below average (${worst.index})`);
  assert.equal(profile.filter((p) => p.best).length, 1, "exactly one best");
  assert.equal(profile.filter((p) => p.worst).length, 1, "exactly one worst");

  // The profile IS the engine's weights — one source of truth, two consumers.
  assert.deepEqual(profile.map((p) => p.index), weekdayWeightsFor(daily, "revenue"));
});

test("a flat or too-short series yields a flat profile with no extremes", () => {
  for (const daily of [[], weeksOf(6, () => 1000)]) {
    const profile = weekdayProfile(daily);
    assert.deepEqual(profile.map((p) => p.index), [1, 1, 1, 1, 1, 1, 1]);
    assert.ok(profile.every((p) => !p.best && !p.worst), "no best/worst on a flat week");
  }
});

test("profiles other raw metrics on request", () => {
  // Saturday visits dip; revenue stays flat — the metric argument matters.
  const daily = weeksOf(8, () => 1000).map((p) => ({
    ...p,
    visits: new Date(`${p.date}T00:00:00Z`).getUTCDay() === 6 ? 40 : 100,
  }));
  const byVisits = weekdayProfile(daily, "visits");
  assert.equal(byVisits.find((p) => p.worst).day, 6);
  const byRevenue = weekdayProfile(daily, "revenue");
  assert.ok(byRevenue.every((p) => !p.best && !p.worst), "revenue profile stays flat");
});
