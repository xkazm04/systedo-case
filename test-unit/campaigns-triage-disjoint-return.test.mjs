/** The snapshot rules are disjoint on the return axis: value reported against zero
 *  conversions is a count problem (no_conversions) and must not also carry a
 *  roas_critical / below_target / below_breakeven line that contradicts it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMetrics } from "@/lib/campaigns/types";
import { triage, triageGoals } from "@/lib/campaigns/triage";

const row = (over) =>
  withMetrics({
    id: "c", name: "c", status: "enabled", type: "search",
    impressions: 1000, clicks: 50, cost: 1000, conversions: 3, conversionValue: 1500, ...over,
  });

test("value without conversions yields only no_conversions", () => {
  for (const value of [50, 800, 2500, 8000]) {
    const r = triage(row({ conversions: 0, conversionValue: value }), undefined, triageGoals(0.18, 8));
    assert.deepEqual(r.reasons.map((x) => x.id), ["no_conversions"], `value ${value}`);
    assert.equal(r.severity, "critical");
  }
});

test("a fractional conversion count is not zero: the return rules still speak", () => {
  const r = triage(row({ conversions: 0.4, conversionValue: 800 }));
  assert.deepEqual(r.reasons.map((x) => x.id), ["roas_critical"]);
});

test("with conversions the return bands are unchanged", () => {
  assert.deepEqual(triage(row({ conversionValue: 4000 })).reasons.map((x) => x.id), ["below_target"]);
  assert.deepEqual(triage(row({ conversionValue: 8000 })).reasons.map((x) => x.id), []);
});
