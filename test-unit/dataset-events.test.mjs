/** Guards for the dataset's authored "story events" (scripts/generate-data.mjs):
 *  the committed performance.json must carry the event calendar AND the events
 *  must actually fire the anomaly engine's dead-without-them paths — a spike, an
 *  outage, a goal-breach and a negative money-impact headline. Reads the events
 *  from the JSON itself, so the assertions survive an `--as-of` refresh. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectAnomalies, anomalyImpact } from "@/lib/metrics/anomalies";

const data = JSON.parse(
  readFileSync(new URL("../src/data/performance.json", import.meta.url), "utf8")
);

/** All ISO dates an event spans (multi-day events expand). */
function eventDates(e) {
  const out = [];
  const start = new Date(`${e.date}T00:00:00Z`);
  for (let k = 0; k < (e.days ?? 1); k++) {
    out.push(new Date(start.getTime() + k * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

test("the dataset carries a story-event calendar inside the series range", () => {
  assert.ok(Array.isArray(data.events), "events array present");
  assert.ok(data.events.length >= 4, "at least four authored events");

  const kinds = new Set(data.events.map((e) => e.kind));
  for (const kind of ["spike", "outage", "cost-runaway", "milestone"]) {
    assert.ok(kinds.has(kind), `event kind "${kind}" present`);
  }

  const first = data.daily[0].date;
  const last = data.daily[data.daily.length - 1].date;
  for (const e of data.events) {
    for (const d of eventDates(e)) {
      assert.ok(d >= first && d <= last, `event day ${d} inside ${first}..${last}`);
    }
  }
});

test("story events actually fire the anomaly engine (spike / outage / goal-breach)", () => {
  const anomalies = detectAnomalies(data.daily, data.goals);
  const onDates = (e) => {
    const dates = new Set(eventDates(e));
    return anomalies.filter((a) => dates.has(a.date));
  };

  // Black Friday → a positive spike on at least one monetary metric.
  const spikes = data.events.filter((e) => e.kind === "spike");
  assert.ok(spikes.length > 0);
  for (const e of spikes) {
    assert.ok(
      onDates(e).some((a) => a.kind === "spike" && (a.metric === "revenue" || a.metric === "conversions")),
      `spike event ${e.date} flagged by the detector`
    );
  }

  // Tracking outage → the "outage" kind (observed ≤ 10 % of expected), which the
  // smooth generator could mathematically never produce before.
  const outage = data.events.find((e) => e.kind === "outage");
  assert.ok(outage, "outage event authored");
  assert.ok(
    onDates(outage).some((a) => a.kind === "outage"),
    "outage day flagged with the outage kind"
  );

  // Cost runaway → a cost spike AND a PNO goal-breach on the same days.
  const runaway = data.events.find((e) => e.kind === "cost-runaway");
  assert.ok(runaway, "cost-runaway event authored");
  const runawayHits = onDates(runaway);
  assert.ok(
    runawayHits.some((a) => a.kind === "spike" && a.metric === "cost"),
    "runaway day flagged as a cost spike"
  );
  assert.ok(
    runawayHits.some((a) => a.kind === "goal-breach"),
    "runaway day breaches the PNO goal"
  );

  // The milestone is annotation-only — it must NOT distort the series.
  const milestone = data.events.find((e) => e.kind === "milestone");
  assert.ok(milestone, "milestone event authored");
  assert.equal(onDates(milestone).length, 0, "milestone day carries no anomaly");

  // And the aggregate money impact is a real, negative damage headline.
  const impact = anomalyImpact(anomalies);
  assert.ok(impact.count > 0, "monetary anomalies counted");
  assert.ok(impact.net < 0, "net impact is damage (dopad ≈ −X Kč)");
  assert.ok(impact.gained > 0, "Black Friday windfall reported separately");
});
