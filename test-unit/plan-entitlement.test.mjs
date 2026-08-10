/** Plan display honesty (src/lib/plans.ts): how a plan's AI allowance must be
 *  PRESENTED, and the entitlement shape the account page renders. The rule under
 *  test is the one PLANS' own comment states — for the BYOM tier the listed aiEval
 *  number is the APP-FUNDED FALLBACK cap, not the plan's ceiling, so a surface must
 *  never quote it as "your daily limit". */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLANS,
  aiAllowanceKind,
  planEntitlement,
  planPriceCzk,
} from "@/lib/plans";

const status = (plan) => ({ plan, limits: PLANS[plan], used: { aiEval: 4, sync: 2, image: 1 }, day: "2026-08-10" });

test("AI allowance: metered tiers are capped, BYOM is unlimited-via-own-key", () => {
  assert.equal(aiAllowanceKind("free"), "capped");
  assert.equal(aiAllowanceKind("pro"), "capped");
  assert.equal(aiAllowanceKind("byom"), "unlimited-via-own-key");
});

test("BYOM's listed aiEval is the fallback cap, not the headline — and equals Free's", () => {
  // If these ever diverge, the fallback stopped being "bounded like Free" and the
  // account page's disclosure copy would be quoting a number that means something
  // else. Pin the relationship, not the magic number.
  assert.equal(PLANS.byom.aiEval, PLANS.free.aiEval);
  assert.equal(aiAllowanceKind("byom"), "unlimited-via-own-key");
});

test("planPriceCzk comes from the same catalogue /cena renders", () => {
  assert.equal(planPriceCzk("free"), 0);
  assert.ok(planPriceCzk("pro") > 0);
  assert.ok(planPriceCzk("byom") > 0);
  assert.ok(planPriceCzk("byom") < planPriceCzk("pro"));
});

test("planEntitlement carries plan, limits, today's usage, price and framing", () => {
  const e = planEntitlement(status("free"), false);
  assert.equal(e.plan, "free");
  assert.deepEqual(e.limits, PLANS.free);
  assert.equal(e.used.aiEval, 4);
  assert.equal(e.priceCzk, 0);
  assert.equal(e.byomActive, false);
  assert.equal(e.aiAllowance, "capped");
});

test("byomActive is the CALLER's entitlement verdict, not derived from the plan", () => {
  // The dev switch can unlock BYOM off-production for a free-plan user; the account
  // card discloses exactly that, so the two facts must stay independent here.
  const devUnlocked = planEntitlement(status("free"), true);
  assert.equal(devUnlocked.plan, "free");
  assert.equal(devUnlocked.byomActive, true);
  assert.equal(devUnlocked.aiAllowance, "capped");

  const paid = planEntitlement(status("byom"), true);
  assert.equal(paid.byomActive, true);
  assert.equal(paid.aiAllowance, "unlimited-via-own-key");
});
