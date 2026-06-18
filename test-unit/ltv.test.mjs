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

test("a cohort without channels still yields the blended value (no regression)", () => {
  const m = withMetrics(cohort); // `cohort` has no `channels`
  assert.equal(m.channelMetrics.length, 0);
  assert.equal(m.paidCac, m.cac); // paid CAC degrades to blended CAC
  const s = ltvSummary([cohort]);
  assert.equal(s.paidCac, s.blendedCac); // no breakdown → paid == blended
  assert.equal(s.paidSignups, s.signups);
});

test("per-channel spend/signups sum back to the cohort's blended CAC", () => {
  const c = {
    month: "Y",
    signups: 100,
    spend: 100_000,
    arpu: 300,
    retention: [1, 0.7, 0.5, 0.4],
    channels: [
      { channel: "Google Ads (Search + PMax)", spend: 60_000, signups: 50 },
      { channel: "Sklik (Seznam)", spend: 40_000, signups: 30 },
      { channel: "Organic & přímá", spend: 0, signups: 20 },
    ],
  };
  const m = withMetrics(c);

  // Channel spend & signups reconstruct the cohort's blended spend/signups → CAC.
  const totalSpend = m.channelMetrics.reduce((a, ch) => a + ch.spend, 0);
  const totalSignups = m.channelMetrics.reduce((a, ch) => a + ch.signups, 0);
  assert.equal(totalSpend, c.spend);
  assert.equal(totalSignups, c.signups);
  assert.ok(Math.abs(totalSpend / totalSignups - m.cac) < 1e-9); // sums back to blended CAC

  // Each paid channel's CAC is its own spend/signups; organic is free.
  const ga = m.channelMetrics.find((ch) => ch.channel === "Google Ads (Search + PMax)");
  assert.ok(ga.paid && Math.abs(ga.cac - 60_000 / 50) < 1e-9);
  const org = m.channelMetrics.find((ch) => ch.channel === "Organic & přímá");
  assert.equal(org.paid, false);

  // Paid CAC excludes the free organic signups: 100000 / 80, above blended 1000.
  assert.ok(Math.abs(m.paidCac - 100_000 / 80) < 1e-9);
  assert.ok(m.paidCac > m.cac);
});
