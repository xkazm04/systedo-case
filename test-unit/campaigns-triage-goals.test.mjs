/** Direction 1 — triage learns the tenant's goals (src/lib/campaigns/triage.ts).
 *  The rules/tones judge against a per-tenant goal (agreed pnoGoal → target ROAS,
 *  plus a margin-based break-even) threaded through the pure functions, while the
 *  module constants stay the ONLY no-profile fallback: no goals, or goals built
 *  from the default paid-portfolio pnoGoal, must be byte-identical to the pre-goal
 *  code (pinned below BEFORE asserting the new behaviour). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TARGET_ROAS, TARGET_PNO, withMetrics } from "@/lib/campaigns/types";
import { PAID_PORTFOLIO_TARGET_PNO } from "@/lib/targets";
import {
  triage,
  triageWeight,
  summarize,
  triageGoals,
  roasMetricTone,
  pnoMetricTone,
} from "@/lib/campaigns/triage";

/** A row at an EXACT roas (conversionValue = cost × roas). */
function roasRow(id, roas, { cost = 10_000, status = "enabled" } = {}) {
  return withMetrics({
    id,
    name: `Kampaň ${id}`,
    type: "search",
    status,
    impressions: 50_000,
    clicks: 1_000,
    cost,
    conversions: roas > 0 ? 20 : 0,
    conversionValue: cost * roas,
  });
}

// A spread of campaigns across every ROAS band, plus a paused-spender and a
// zero-return burner — enough to exercise every current rule.
const PORTFOLIO = [
  roasRow("above", TARGET_ROAS * 1.2), // comfortably above target
  roasRow("mid", TARGET_ROAS * 0.9), // below target → warning
  roasRow("deep", TARGET_ROAS * 0.4), // deep below → critical
  roasRow("burner", 0, { cost: 5_000 }), // spending, no conversions → critical
  roasRow("paused", TARGET_ROAS * 0.9, { status: "paused" }),
];

// --- byte-identical default (pinned) ----------------------------------------

test("no goals === undefined goals === goals from the default pnoGoal", () => {
  const defaultGoals = triageGoals(PAID_PORTFOLIO_TARGET_PNO);
  for (const c of PORTFOLIO) {
    const bare = triage(c);
    assert.deepEqual(triage(c, undefined), bare, `undefined change/goals byte-identical (${c.id})`);
    assert.deepEqual(
      triage(c, undefined, defaultGoals),
      bare,
      `default-pnoGoal goals byte-identical (${c.id})`
    );
  }
});

test("summarize + tones are byte-identical under the default-pnoGoal goal", () => {
  const defaultGoals = triageGoals(PAID_PORTFOLIO_TARGET_PNO);
  assert.deepEqual(summarize(PORTFOLIO, undefined, defaultGoals), summarize(PORTFOLIO));
  for (const c of PORTFOLIO) {
    assert.equal(roasMetricTone(c.roas, defaultGoals.targetRoas), roasMetricTone(c.roas));
    assert.equal(pnoMetricTone(c.pno, defaultGoals.targetPno), pnoMetricTone(c.pno));
  }
});

test("triageGoals derives target ROAS/PNO from one pnoGoal; degenerate → constants", () => {
  const g = triageGoals(0.1);
  assert.equal(g.targetPno, 0.1);
  assert.equal(g.targetRoas, 10);
  // A non-positive/garbage pnoGoal collapses to the module target.
  assert.equal(triageGoals(0).targetPno, TARGET_PNO);
  assert.equal(triageGoals(-1).targetRoas, TARGET_ROAS);
});

// --- goal threading changes the verdict -------------------------------------

test("a tighter pnoGoal pulls an above-target campaign below target", () => {
  // Campaign at 1.2× the module target. Under the module goal it is healthy…
  const c = roasRow("x", TARGET_ROAS * 1.2);
  assert.equal(triage(c).severity, "ok");

  // …but with a stricter goal (target ROAS 1.5× the module target, so the 1.2×
  // campaign lands in the [0.6, 1.0) warning band) it now triages as below-target
  // — the badge follows the tenant's own goal.
  const strict = triageGoals(PAID_PORTFOLIO_TARGET_PNO / 1.5); // 1.5× stricter ROAS target
  const t = triage(c, undefined, strict);
  assert.equal(t.severity, "warning");
  assert.equal(t.primary?.id, "below_target");
});

test("roas/pno tones follow the threaded target", () => {
  const roas = TARGET_ROAS * 1.1; // good under the module target
  assert.equal(roasMetricTone(roas), "good");
  // A stricter target ROAS (1.25× this roas → ratio 0.8, inside the neutral band)
  // turns the same cell neutral.
  assert.equal(roasMetricTone(roas, roas * 1.25), "neutral");

  const pno = TARGET_PNO * 0.9; // good under the module target
  assert.equal(pnoMetricTone(pno), "good");
  // A stricter target PNO (this pno now just above target, below the red ratio).
  assert.equal(pnoMetricTone(pno, pno / 1.25), "neutral");
});

// --- margin-aware severity (break-even above target) ------------------------

test("above target but below margin break-even → an honest 'unprofitable' warning", () => {
  // Tenant with a LOW margin (25%) whose break-even ROAS (4×) sits ABOVE their
  // agreed target ROAS (~2.86× for pnoGoal 0.35). A campaign between the two is
  // "on target" yet loses money.
  const goals = triageGoals(0.35, /* breakEvenRoas */ 4);
  assert.ok(goals.targetRoas < 4, "sanity: target is below break-even for this tenant");

  const c = roasRow("thin", 3.2); // >= target (2.86), < break-even (4)
  const t = triage(c, undefined, goals);
  assert.equal(t.severity, "warning");
  assert.equal(t.primary?.id, "below_breakeven");

  // A campaign above break-even is genuinely healthy — the rule does not fire.
  assert.equal(triage(roasRow("fat", 5), undefined, goals).severity, "ok");
});

test("break-even severity is inert without a cost model (margin-blind default)", () => {
  // Same campaign, but goals carry NO break-even (no persisted model): the rule
  // can never fire, so the margin-blind path is unchanged.
  const goals = triageGoals(0.35);
  const c = roasRow("thin", 3.2);
  const t = triage(c, undefined, goals);
  assert.ok(t.reasons.every((r) => r.id !== "below_breakeven"));

  // And a break-even at/below target (healthy-margin tenant) never fires either —
  // the campaign is above target AND above break-even.
  const healthy = triageGoals(PAID_PORTFOLIO_TARGET_PNO, /* breakEvenRoas */ 2.4);
  assert.ok(
    triage(roasRow("ok", TARGET_ROAS * 1.1), undefined, healthy).reasons.every(
      (r) => r.id !== "below_breakeven"
    )
  );
});

test("triageWeight threads goals and keeps the severity-then-spend ordering", () => {
  const strict = triageGoals(PAID_PORTFOLIO_TARGET_PNO / 1.5);
  const c = roasRow("x", TARGET_ROAS * 1.2, { cost: 10_000 });
  // ok under the module goal, warning under the strict goal → strictly higher weight.
  assert.ok(triageWeight(c, undefined, strict) > triageWeight(c));
});
