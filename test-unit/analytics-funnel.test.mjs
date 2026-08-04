/** Funnel readers over the first-party daily counters (src/lib/analytics/
 *  funnel.ts) — the arithmetic that makes the sign-up-conversion and activation
 *  KPIs computable from recorded events only. Pins the window math, the honest
 *  no-data / insufficient statuses (a thin window never renders as a confident
 *  0 %), and the two named rollups' metric wiring. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activationRollup,
  funnelRollup,
  METRIC_ACTIVATION,
  METRIC_GATE_VIEW,
  METRIC_SIGNUP,
  MIN_DENOMINATOR_FOR_RATE,
  pageViewMetric,
  signupConversionRollup,
} from "@/lib/analytics/funnel";

const NOW = new Date("2026-08-04T12:00:00.000Z");
const row = (metric, day, count) => ({ metric, day, count });

test("metric keys: gate view is the /app-gate page view", () => {
  assert.equal(METRIC_GATE_VIEW, "view:/app-gate");
  assert.equal(pageViewMetric("/dashboard"), "view:/dashboard");
});

test("signup conversion: sums both metrics inside the window and divides", () => {
  const rows = [
    row(METRIC_GATE_VIEW, "2026-08-01", 6),
    row(METRIC_GATE_VIEW, "2026-08-03", 4),
    row(METRIC_SIGNUP, "2026-08-03", 2),
    row("view:/dashboard", "2026-08-03", 99), // unrelated metric — ignored
  ];
  const r = signupConversionRollup(rows, { now: NOW, windowDays: 30 });
  assert.equal(r.denominator, 10);
  assert.equal(r.numerator, 2);
  assert.equal(r.status, "ok");
  assert.equal(r.rate, 0.2);
});

test("events outside the window are ignored on both sides (inclusive bounds)", () => {
  const r = funnelRollup(
    [
      row(METRIC_GATE_VIEW, "2026-07-29", 5), // == sinceDay for a 7-day window → in
      row(METRIC_GATE_VIEW, "2026-07-28", 100), // one day before → out
      row(METRIC_SIGNUP, "2026-08-04", 1), // today → in
      row(METRIC_SIGNUP, "2026-08-05", 100), // the future → out
    ],
    { numerator: METRIC_SIGNUP, denominator: METRIC_GATE_VIEW },
    { now: NOW, windowDays: 7 }
  );
  assert.equal(r.sinceDay, "2026-07-29");
  assert.equal(r.denominator, 5);
  assert.equal(r.numerator, 1);
});

test("no denominator events → status no-data, rate withheld (null)", () => {
  const r = signupConversionRollup([row(METRIC_SIGNUP, "2026-08-03", 3)], { now: NOW });
  assert.equal(r.status, "no-data");
  assert.equal(r.rate, null);
  assert.equal(r.numerator, 3, "counts are still reported honestly");
});

test("thin window → status insufficient, rate withheld — never a confident %", () => {
  const rows = [row(METRIC_GATE_VIEW, "2026-08-01", MIN_DENOMINATOR_FOR_RATE - 1), row(METRIC_SIGNUP, "2026-08-01", 1)];
  const r = signupConversionRollup(rows, { now: NOW });
  assert.equal(r.status, "insufficient");
  assert.equal(r.rate, null);
  assert.equal(r.minDenominator, MIN_DENOMINATOR_FOR_RATE);
});

test("activation rollup divides activations by signups", () => {
  const rows = [
    row(METRIC_SIGNUP, "2026-08-01", 8),
    row(METRIC_ACTIVATION, "2026-08-02", 2),
    row(METRIC_GATE_VIEW, "2026-08-01", 50), // not this funnel's denominator
  ];
  const r = activationRollup(rows, { now: NOW });
  assert.equal(r.denominator, 8);
  assert.equal(r.numerator, 2);
  assert.equal(r.rate, 0.25);
});

test("malformed counts (negative / NaN) are ignored, never subtract", () => {
  const rows = [
    row(METRIC_GATE_VIEW, "2026-08-01", 6),
    row(METRIC_GATE_VIEW, "2026-08-02", -5),
    row(METRIC_GATE_VIEW, "2026-08-03", Number.NaN),
    row(METRIC_SIGNUP, "2026-08-03", 3),
  ];
  const r = signupConversionRollup(rows, { now: NOW });
  assert.equal(r.denominator, 6);
  assert.equal(r.rate, 0.5);
});
