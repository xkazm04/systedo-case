/** Unit tests for the retention survival curve + sparkline helpers (feature #1). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMetrics, survivalSparkline, sparklinePoints } from "@/lib/ltv/compute";

const base = { month: "Led", signups: 100, spend: 100_000, arpu: 300, retention: [1, 0.7, 0.5, 0.4] };

test("withMetrics exposes a 12-month survival curve split into observed/modeled", () => {
  const m = withMetrics(base);
  assert.equal(m.survival.length, 12); // extrapolated to the horizon
  assert.equal(m.observedMonths, 4); // four observed retention months
  // the observed prefix matches the raw retention input exactly
  assert.deepEqual(m.survival.slice(0, 4), base.retention);
  // every survival value is a sane fraction in [0,1] and the tail keeps decaying
  for (const s of m.survival) assert.ok(s >= 0 && s <= 1);
  assert.ok(m.survival[11] <= m.survival[4]);
});

test("observedMonths never exceeds the 12-month horizon", () => {
  const long = Array.from({ length: 20 }, (_, i) => 1 - i * 0.02);
  const m = withMetrics({ ...base, retention: long });
  assert.equal(m.survival.length, 12);
  assert.equal(m.observedMonths, 12); // capped at the horizon, not 20
});

test("survivalSparkline maps the curve into the box, y inverted (1.0 → top)", () => {
  const { observed, extrapolated } = survivalSparkline([1, 0.5, 0], 2, 100, 40);
  assert.equal(observed.length, 2);
  // first point: x=0, retention 1.0 → y=0 (top)
  assert.deepEqual(observed[0], { x: 0, y: 0 });
  // 3 points over width 100 → step 50; retention 0.5 → mid height
  assert.deepEqual(observed[1], { x: 50, y: 20 });
  // extrapolated reuses the last observed point as its first vertex (seamless join)
  assert.deepEqual(extrapolated[0], observed[1]);
  // last point: x=100, retention 0 → y=height (bottom)
  assert.deepEqual(extrapolated[extrapolated.length - 1], { x: 100, y: 40 });
});

test("survivalSparkline clamps out-of-range fractions and handles edge sizes", () => {
  assert.deepEqual(survivalSparkline([], 0, 100, 40), { observed: [], extrapolated: [] });
  // single observed point → one point, no extrapolated segment
  const one = survivalSparkline([0.6], 1, 100, 40);
  assert.equal(one.observed.length, 1);
  assert.equal(one.extrapolated.length, 0);
  // values >1 / <0 clamp to the top / bottom of the box
  const clamped = survivalSparkline([1.5, -0.2], 2, 10, 40);
  assert.equal(clamped.observed[0].y, 0); // clamped to top
  assert.equal(clamped.observed[1].y, 40); // clamped to bottom
});

test("survivalSparkline with no observed months yields only an extrapolated tail", () => {
  const { observed, extrapolated } = survivalSparkline([1, 0.8, 0.6], 0, 100, 40);
  assert.equal(observed.length, 0);
  assert.equal(extrapolated.length, 3); // whole curve is modeled
});

test("sparklinePoints serializes to an SVG points attr rounded to 2 decimals", () => {
  // height 30, retention 0.55 → y = 30 * (1 - 0.55) = 13.5 (exact, 2 dp)
  const pts = survivalSparkline([1, 0.55], 2, 100, 30).observed;
  assert.equal(sparklinePoints(pts), "0,0 100,13.5");
  // a value that needs rounding: y = 30 * (1 - 0.333) = 20.01
  const r = survivalSparkline([0.333], 1, 100, 30).observed;
  assert.equal(sparklinePoints(r), "0,20.01");
  assert.equal(sparklinePoints([]), "");
});
