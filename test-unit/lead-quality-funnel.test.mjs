/** Unit tests for the lead → close funnel + velocity math. Runs the TS source
 *  directly via the shared resolve hook (node --import ./test-llm/setup.mjs). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMetrics, summarize, sourceFunnel, funnelBySource, avgVelocity } from "@/lib/lead-quality/compute";

const EPS = 1e-9;

// Full source: leads ≥ qualified ≥ opportunities ≥ won, with velocity + campaign.
const full = {
  source: "Google Ads",
  leads: 320,
  qualified: 198,
  won: 41,
  spend: 142_000,
  revenue: 1_640_000,
  opportunities: 96,
  daysToQualify: 4,
  daysToClose: 28,
  campaign: "Brand",
};

// Minimal source: only the three flat counts (no optional fields).
const minimal = { source: "Organic", leads: 140, qualified: 110, won: 38, spend: 0, revenue: 1_520_000 };

test("withMetrics / summarize unchanged for the legacy shape (no regression)", () => {
  const m = withMetrics(minimal);
  assert.ok(Math.abs(m.qualRate - 110 / 140) < EPS);
  assert.ok(Math.abs(m.winRate - 38 / 110) < EPS);
  assert.equal(m.roi, Infinity); // spend 0 → ROI Infinity preserved
  const s = summarize([full, minimal]);
  assert.equal(s.leads, 460);
  assert.equal(s.qualified, 308);
  assert.equal(s.won, 79);
});

test("sourceFunnel builds 4 stages with per-step conversion + drop-off", () => {
  const f = sourceFunnel(full);
  assert.deepEqual(
    f.stages.map((st) => st.key),
    ["leads", "qualified", "opportunities", "won"],
  );

  const [lead, sql, opp, won] = f.stages;
  // Entry stage: conversion 1, no drop-off.
  assert.equal(lead.conversion, 1);
  assert.equal(lead.dropOff, 0);
  // SQL: 198 / 320, dropped 122.
  assert.ok(Math.abs(sql.conversion - 198 / 320) < EPS);
  assert.equal(sql.dropOff, 320 - 198);
  // Opportunity: 96 / 198, dropped 102.
  assert.ok(Math.abs(opp.conversion - 96 / 198) < EPS);
  assert.equal(opp.dropOff, 198 - 96);
  // Won: 41 / 96, dropped 55.
  assert.ok(Math.abs(won.conversion - 41 / 96) < EPS);
  assert.equal(won.dropOff, 96 - 41);
  // End-to-end leads → won.
  assert.ok(Math.abs(f.overallConversion - 41 / 320) < EPS);

  // Chained step conversions multiply back to the overall conversion.
  const chained = sql.conversion * opp.conversion * won.conversion;
  assert.ok(Math.abs(chained - f.overallConversion) < EPS);
});

test("sourceFunnel degrades gracefully without the opportunity stage", () => {
  const f = sourceFunnel(minimal);
  assert.deepEqual(
    f.stages.map((st) => st.key),
    ["leads", "qualified", "won"], // opportunity skipped
  );
  const won = f.stages[2];
  // Won converts directly from qualified when no opportunity stage exists.
  assert.ok(Math.abs(won.conversion - 38 / 110) < EPS);
  assert.equal(won.dropOff, 110 - 38);
  assert.ok(Math.abs(f.overallConversion - 38 / 140) < EPS);
});

test("funnelBySource preserves input order and count", () => {
  const fs = funnelBySource([full, minimal]);
  assert.equal(fs.length, 2);
  assert.equal(fs[0].source, "Google Ads");
  assert.equal(fs[1].source, "Organic");
  assert.equal(fs[0].campaign, "Brand");
  assert.equal(fs[1].campaign, undefined);
});

test("avgVelocity averages only the legs that exist", () => {
  const v = avgVelocity([full, { ...full, source: "B", daysToQualify: 6, daysToClose: 32 }]);
  assert.equal(v.daysToQualify, 5); // (4 + 6) / 2
  assert.equal(v.daysToClose, 30); // (28 + 32) / 2
  assert.equal(v.total, 35);
});

test("avgVelocity is all-null when no source carries velocity data", () => {
  const v = avgVelocity([minimal, { ...minimal, source: "B" }]);
  assert.equal(v.daysToQualify, null);
  assert.equal(v.daysToClose, null);
  assert.equal(v.total, null); // caller hides the velocity view
});

test("avgVelocity includes a partial leg (one source missing daysToClose)", () => {
  const v = avgVelocity([{ ...minimal, daysToQualify: 4 }, minimal]);
  assert.equal(v.daysToQualify, 4); // only the one present value
  assert.equal(v.daysToClose, null);
  assert.equal(v.total, 4); // null leg counted as 0 in the sum
});
