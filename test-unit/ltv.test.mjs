/** Unit tests for the CAC/LTV cohort math. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMetrics, ltvSummary } from "@/lib/ltv/compute";

const cohort = { month: "X", signups: 100, spend: 100_000, arpu: 300, retention: [1, 0.7, 0.5, 0.4] };

test("withMetrics computes CAC, LTV and payback", () => {
  const m = withMetrics(cohort);
  assert.equal(m.cac, 1000); // 100000 / 100
  assert.ok(m.ltv > 0);
  assert.ok(m.ltvCac > 0);
  // payback is a month index (or null) within the horizon
  assert.ok(m.paybackMonth === null || (m.paybackMonth >= 1 && m.paybackMonth <= 12));
});

test("ltvSummary blends CAC across cohorts", () => {
  const s = ltvSummary([cohort, { ...cohort, signups: 200, spend: 160_000 }]);
  assert.equal(s.signups, 300);
  assert.ok(Math.abs(s.blendedCac - 260_000 / 300) < 0.01); // total spend / total signups
  assert.ok(s.avgLtvCac > 0);
});
