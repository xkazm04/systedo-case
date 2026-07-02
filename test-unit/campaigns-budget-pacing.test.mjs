/** Budget pacing (src/lib/campaigns/types.ts budgetPacing) — the pure layer
 *  behind the "omezeno rozpočtem" flag: a profitable campaign spending its whole
 *  budget is a winner starved by its budget, not a healthy row. Plus the sample
 *  provider's derived budgets, so demo mode exercises the same code path. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUDGET_CAP_PACING_MIN,
  CAMPAIGN_PERIOD_DAYS,
  TARGET_ROAS,
  budgetPacing,
  withMetrics,
} from "@/lib/campaigns/types";
import { sampleCampaigns } from "@/lib/campaigns/sample";

/** A profitable enabled campaign spending `dailySpend` against `budgetPerDay`. */
function row({ dailySpend, budgetPerDay, roasFactor = 1.5, status = "enabled" }) {
  const days = CAMPAIGN_PERIOD_DAYS["30d"];
  const cost = dailySpend * days;
  return withMetrics({
    id: "c1",
    name: "Test",
    type: "search",
    status,
    impressions: 100_000,
    clicks: 2_000,
    cost,
    conversions: 50,
    conversionValue: Math.round(cost * TARGET_ROAS * roasFactor),
    ...(budgetPerDay != null ? { budgetPerDay } : {}),
  });
}

test("budgetPacing returns null without a positive daily budget (no mis-flags)", () => {
  assert.equal(budgetPacing(row({ dailySpend: 100 }), "30d"), null);
  assert.equal(budgetPacing(row({ dailySpend: 100, budgetPerDay: 0 }), "30d"), null);
});

test("budgetPacing computes cost / (days × budget) for the requested period", () => {
  const r = row({ dailySpend: 90, budgetPerDay: 100 });
  const p = budgetPacing(r, "30d");
  assert.ok(p);
  assert.ok(Math.abs(p.pacing - 0.9) < 1e-9);
  // Same row read over 7 days would imply a much higher run-rate vs budget.
  const p7 = budgetPacing(r, "7d");
  assert.ok(p7.pacing > p.pacing);
});

test("capped fires only for enabled, at/above-target campaigns pacing at the threshold", () => {
  // Profitable + pacing at the threshold → capped.
  const capped = budgetPacing(
    row({ dailySpend: 100 * BUDGET_CAP_PACING_MIN, budgetPerDay: 100 }),
    "30d"
  );
  assert.equal(capped.capped, true);

  // Same pacing but ROAS below target → an over-paced loser, not a capped winner.
  const belowTarget = budgetPacing(
    row({ dailySpend: 100 * BUDGET_CAP_PACING_MIN, budgetPerDay: 100, roasFactor: 0.8 }),
    "30d"
  );
  assert.equal(belowTarget.capped, false);

  // Profitable with headroom → not capped.
  const headroom = budgetPacing(row({ dailySpend: 60, budgetPerDay: 100 }), "30d");
  assert.equal(headroom.capped, false);

  // Paused campaigns never flag, whatever the numbers say.
  const paused = budgetPacing(
    row({ dailySpend: 100, budgetPerDay: 100, status: "paused" }),
    "30d"
  );
  assert.equal(paused.capped, false);
});

test("sample campaigns carry a deterministic positive daily budget", () => {
  const now = Date.UTC(2026, 6, 1); // fixed week → fully deterministic
  const a = sampleCampaigns("30d", undefined, "mionelo", now);
  const b = sampleCampaigns("30d", undefined, "mionelo", now);
  assert.deepEqual(a, b);
  for (const c of a) {
    assert.ok(Number.isFinite(c.budgetPerDay) && c.budgetPerDay > 0, `${c.name} has a budget`);
  }
  // The brand Search winner is deliberately budget-limited: its budget sits at
  // its expected daily spend, so its pacing hovers around 1 while every other
  // campaign keeps the 1.15× headroom.
  const brand = a.find((c) => c.id === "1001");
  const days = CAMPAIGN_PERIOD_DAYS["30d"];
  const pacing = brand.cost / (days * brand.budgetPerDay);
  assert.ok(pacing > 0.8 && pacing < 1.25, `brand pacing ~1 (got ${pacing.toFixed(3)})`);
});
