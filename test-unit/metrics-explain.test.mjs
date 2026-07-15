/** Direction 1: the pure date-window join that labels anomalies with the calendar
 *  event (authored event OR client annotation, unified upstream into events) that
 *  explains them. Proves: inside/outside the window, range vs point (± window),
 *  nearest-of-multiple + first-on-tie, and that fields/order are preserved and the
 *  join never suppresses. Runs the TS source via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { explainAnomalies, EXPLAIN_POINT_WINDOW_DAYS } from "@/lib/metrics/explain";

/** A minimal anomaly — only date matters to the join; other fields ride along. */
function anom(date, extra = {}) {
  return { date, metric: "revenue", observed: 100, expected: 60, z: 3.2, kind: "spike", ...extra };
}

test("a point event explains a same-day anomaly and marks it with its title", () => {
  const out = explainAnomalies([anom("2026-11-27")], [{ date: "2026-11-27", label: "Black Friday", kind: "spike" }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].explanation, "Black Friday");
  // all original fields preserved
  assert.equal(out[0].metric, "revenue");
  assert.equal(out[0].z, 3.2);
});

test("a point event reaches ±1 day but not ±2", () => {
  const events = [{ date: "2026-11-27", label: "Black Friday", kind: "spike" }];
  assert.equal(EXPLAIN_POINT_WINDOW_DAYS, 1);
  assert.equal(explainAnomalies([anom("2026-11-26")], events)[0].explanation, "Black Friday"); // day before
  assert.equal(explainAnomalies([anom("2026-11-28")], events)[0].explanation, "Black Friday"); // day after
  assert.equal(explainAnomalies([anom("2026-11-25")], events)[0].explanation, undefined); // 2 days before
  assert.equal(explainAnomalies([anom("2026-11-29")], events)[0].explanation, undefined); // 2 days after
});

test("a range event explains every day inside its span, exactly (no extra padding)", () => {
  // Dec 1–5 ramp (days: 5) → covers 2026-12-01 … 2026-12-05 inclusive, and NOTHING
  // outside (a range gets no ± padding, unlike a point event).
  const events = [{ date: "2026-12-01", label: "Vánoční ramp", kind: "milestone", days: 5 }];
  assert.equal(explainAnomalies([anom("2026-12-01")], events)[0].explanation, "Vánoční ramp"); // first day
  assert.equal(explainAnomalies([anom("2026-12-03")], events)[0].explanation, "Vánoční ramp"); // middle
  assert.equal(explainAnomalies([anom("2026-12-05")], events)[0].explanation, "Vánoční ramp"); // last day
  assert.equal(explainAnomalies([anom("2026-11-30")], events)[0].explanation, undefined); // day before span
  assert.equal(explainAnomalies([anom("2026-12-06")], events)[0].explanation, undefined); // day after span
});

test("multiple candidates → the nearest event wins (distance beats input order)", () => {
  // Anomaly on 06-09. Both events' windows cover it, but by DIFFERENT distances:
  //  · "Den vedle" is a point on 06-08 → window 06-07…06-09, core 06-08, distance 1
  //  · "Přesně dnes" is a point on 06-09 → core 06-09, distance 0
  // The nearer one wins even though it is listed SECOND.
  const events = [
    { date: "2026-06-08", label: "Den vedle", kind: "spike" },
    { date: "2026-06-09", label: "Přesně dnes", kind: "spike" },
  ];
  assert.equal(explainAnomalies([anom("2026-06-09")], events)[0].explanation, "Přesně dnes");
});

test("ties break to the first event in input order", () => {
  const events = [
    { date: "2026-07-15", label: "První", kind: "spike" },
    { date: "2026-07-15", label: "Druhý", kind: "spike" },
  ];
  assert.equal(explainAnomalies([anom("2026-07-15")], events)[0].explanation, "První");
});

test("no events / empty anomalies degrade to a clean pass-through (never suppressed)", () => {
  const a = [anom("2026-01-01"), anom("2026-02-02")];
  const passUndef = explainAnomalies(a, undefined);
  const passEmpty = explainAnomalies(a, []);
  assert.equal(passUndef.length, 2);
  assert.equal(passEmpty.length, 2);
  assert.equal(passUndef[0].explanation, undefined);
  assert.equal(passEmpty[1].explanation, undefined);
  // order + fields preserved, and a fresh object (no mutation of the input)
  assert.deepEqual(passUndef.map((x) => x.date), ["2026-01-01", "2026-02-02"]);
  assert.notEqual(passUndef[0], a[0]);
});

test("an unrelated event leaves the anomaly unexplained", () => {
  const out = explainAnomalies([anom("2026-03-20")], [{ date: "2026-09-01", label: "Jindy", kind: "spike" }]);
  assert.equal(out[0].explanation, undefined);
});
