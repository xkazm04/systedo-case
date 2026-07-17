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
  activeBudgetDays,
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

test("activeBudgetDays counts days that actually spent, clamped to [1, period days]", () => {
  const pt = (cost) => ({ cost });
  // 6 spending days in a 30-day window → 6.
  const series6 = [...Array(6)].map(() => pt(50)).concat([...Array(4)].map(() => pt(0)));
  assert.equal(activeBudgetDays(series6, "30d"), 6);
  // Never exceeds the period day count even if the series is longer / overdelivers.
  const series40 = [...Array(40)].map(() => pt(10));
  assert.equal(activeBudgetDays(series40, "30d"), CAMPAIGN_PERIOD_DAYS["30d"]);
  // Empty / all-zero / missing series → null (fall back to the full-period baseline).
  assert.equal(activeBudgetDays([], "30d"), null);
  assert.equal(activeBudgetDays([pt(0), pt(0)], "30d"), null);
  assert.equal(activeBudgetDays(undefined, "30d"), null);
});

test("a partial-window winner is paced against active days, tightening never loosening", () => {
  // Spent 100/day for only 6 days of a 30-day window at a 100/day budget: full-period
  // pacing badly under-reads (0.2); active-days pacing sees the budget-capped winner.
  const dailySpend = 100;
  const r = row({ dailySpend: (dailySpend * 6) / CAMPAIGN_PERIOD_DAYS["30d"], budgetPerDay: 100 });
  const full = budgetPacing(r, "30d");
  const active = budgetPacing(r, "30d", 6);
  assert.ok(active.pacing > full.pacing, "active-days pacing must be higher (tighter)");
  assert.ok(Math.abs(active.pacing - 1) < 1e-9, "6 days × 100 spend / (6 × 100 budget) == 1");
  assert.equal(active.capped, true);
  assert.equal(full.capped, false); // the bug: the starved winner was missed
  // A bogus activeDays above the period can only fall back to the full baseline (clamp).
  assert.equal(budgetPacing(r, "30d", 999).pacing, full.pacing);
  // Non-positive activeDays is ignored (full-period baseline).
  assert.equal(budgetPacing(r, "30d", 0).pacing, full.pacing);
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
