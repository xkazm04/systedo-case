/** parseMetrics / parseMetricField (src/lib/images/attribution-types.ts) — the
 *  locale-tolerant metric parse behind the attribution PATCH/POST. A Czech user
 *  types "1,5" or "1 000"; the old `Number()` coercion turned those into a silent
 *  0 with a 200/ok response. Now: absent → 0, present-but-unparseable → invalid
 *  (so the route can 422). Pure — no I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMetricField, parseMetrics } from "@/lib/images/attribution-types";

test("absent fields coerce to 0", () => {
  assert.equal(parseMetricField(undefined), 0);
  assert.equal(parseMetricField(null), 0);
  assert.equal(parseMetricField(""), 0);
});

test("Czech decimal comma is honored, not zeroed", () => {
  assert.equal(parseMetricField("1,5"), 1.5);
  assert.equal(parseMetricField("1 000"), 1000);
  assert.equal(parseMetricField("2 500"), 2500); // NBSP thousands
});

test("plain numbers and numeric strings pass through, clamped to >= 0", () => {
  assert.equal(parseMetricField(42), 42);
  assert.equal(parseMetricField("42"), 42);
  assert.equal(parseMetricField(-3), 0);
});

test("genuinely unparseable input is invalid (null), not 0", () => {
  assert.equal(parseMetricField("abc"), null);
  assert.equal(parseMetricField("1,2,3"), null);
  assert.equal(parseMetricField(NaN), null);
});

test("parseMetrics returns coerced metrics for a valid payload", () => {
  const out = parseMetrics({ impressions: "1 000", clicks: 50, conversions: "", cost: "1,5", convValue: 3 });
  assert.deepEqual(out, { metrics: { impressions: 1000, clicks: 50, conversions: 0, cost: 1.5, convValue: 3 } });
});

test("parseMetrics flags the first invalid field name", () => {
  const out = parseMetrics({ impressions: 1, clicks: "oops", conversions: 0, cost: 0, convValue: 0 });
  assert.deepEqual(out, { invalidField: "clicks" });
});

test("parseMetrics returns null for a non-object", () => {
  assert.equal(parseMetrics(null), null);
  assert.equal(parseMetrics("x"), null);
});
