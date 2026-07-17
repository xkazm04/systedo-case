/** Unit tests for the profit/POAS math. Runs the TS source directly via the
 *  shared resolve hook (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProfit, reallocateBudget } from "@/lib/profit/compute";

const row = (channel, revenue, cost, roas) => ({ channel, color: "#000", revenue, cost, roas });

test("computeProfit derives gross/net profit, POAS and break-even ROAS", () => {
  const { rows, summary } = computeProfit(
    [row("A", 1000, 200, 5), row("B", 1000, 800, 1.25)],
    [
      { channel: "A", marginPct: 0.5 },
      { channel: "B", marginPct: 0.3 },
    ]
  );
  const a = rows.find((r) => r.channel === "A");
  const b = rows.find((r) => r.channel === "B");

  // A: margin 0.5 → break-even ROAS 2; ROAS 5 ≥ 2 → profitable
  assert.equal(a.breakEvenRoas, 2);
  assert.equal(a.profitable, true);
  assert.equal(a.grossProfit, 500);
  assert.equal(a.netProfit, 300);

  // B: margin 0.3 → break-even ~3.33; ROAS 1.25 → loses money after margin
  assert.equal(b.profitable, false);
  assert.equal(b.netProfit, -500); // 300 gross − 800 cost

  assert.equal(summary.unprofitableCount, 1);
  assert.equal(summary.netProfit, -200);
});

test("computeProfit falls back to a default margin for unknown channels", () => {
  const { rows } = computeProfit([row("X", 100, 50, 2)], []);
  assert.equal(rows[0].marginPct, 0.45);
});

// Helper: a sample where moving budget from a loser to a winner clearly helps.
//   GOOD: roas 6 × margin 0.5 = 3.0 → marginal +2.0/Kč
//   BAD:  roas 1 × margin 0.3 = 0.3 → marginal −0.7/Kč (drained)
function sampleRows() {
  const { rows } = computeProfit(
    [row("GOOD", 6000, 1000, 6), row("BAD", 1000, 1000, 1)],
    [
      { channel: "GOOD", marginPct: 0.5 },
      { channel: "BAD", marginPct: 0.3 },
    ]
  );
  return rows;
}

test("reallocateBudget never exceeds the budget or the per-channel cap", () => {
  const rows = sampleRows();
  const plan = reallocateBudget(rows, { totalBudget: 5000, maxSpendMultiple: 3 });
  // Total allocation stays within the budget (allow tiny FP slack).
  assert.ok(plan.allocatedSpend <= 5000 + 1e-9);
  // No channel exceeds 3× its current spend, and none goes negative.
  for (const r of plan.rows) {
    const cap = r.currentSpend * 3;
    assert.ok(r.suggestedSpend <= cap + 1e-9, `${r.channel} over cap`);
    assert.ok(r.suggestedSpend >= 0, `${r.channel} negative`);
  }
});

test("reallocateBudget max-profit never lowers net profit and drains a loser", () => {
  const rows = sampleRows();
  const plan = reallocateBudget(rows, { strategy: "max-profit" }); // budget defaults to total cost (2000)

  // Default budget = current total cost → pure reallocation.
  assert.equal(plan.totalBudget, 2000);
  // Max-profit must not do worse than today.
  assert.ok(
    plan.projectedNetProfit >= plan.currentNetProfit - 1e-9,
    `projected ${plan.projectedNetProfit} < current ${plan.currentNetProfit}`
  );
  // And on this sample it strictly improves.
  assert.ok(plan.profitDelta > 0);

  // The loss-making channel (roas × margin = 0.3 < 1) is drained to zero spend.
  const bad = plan.rows.find((r) => r.channel === "BAD");
  assert.equal(bad.suggestedSpend, 0);
  // Its whole budget moved to the winner, capped at 3× its 1000 current spend.
  const good = plan.rows.find((r) => r.channel === "GOOD");
  assert.equal(good.suggestedSpend, 2000);
});

// A sample where max-profit lets revenue fall: the profitable channel has a small
// cap, so draining the (revenue-heavy) loss-maker drops total revenue and leaves
// budget unused. hold-revenue must redeploy that budget to hold revenue.
function revenueFallRows() {
  const { rows } = computeProfit(
    [row("WIN", 500, 100, 5), row("LOSS", 1200, 1000, 1.2)],
    [
      { channel: "WIN", marginPct: 0.5 }, // marginal 5*0.5-1 = +1.5
      { channel: "LOSS", marginPct: 0.3 }, // marginal 1.2*0.3-1 = -0.64 (loss-maker)
    ]
  );
  return rows;
}

test("max-profit can let revenue fall and flags revenueHeld=false", () => {
  const rows = revenueFallRows();
  const plan = reallocateBudget(rows, { strategy: "max-profit" }); // budget = 1100
  // Current revenue 1700; WIN capped at 3×100 = 300 → max projected 300*5 = 1500.
  assert.equal(plan.currentRevenue, 1700);
  assert.ok(plan.projectedRevenue < plan.currentRevenue);
  assert.equal(plan.revenueHeld, false);
  // Loss-maker drained, budget left unspent.
  assert.equal(plan.rows.find((r) => r.channel === "LOSS").suggestedSpend, 0);
});

test("hold-revenue actually holds revenue by funding a loss-maker minimally", () => {
  const rows = revenueFallRows();
  const plan = reallocateBudget(rows, { strategy: "hold-revenue" }); // budget = 1100
  // Revenue is protected: projection meets or beats today.
  assert.ok(
    plan.projectedRevenue >= plan.currentRevenue - 1e-6,
    `projected ${plan.projectedRevenue} < current ${plan.currentRevenue}`
  );
  assert.equal(plan.revenueHeld, true);
  // It does so by giving the revenue-heavy loss-maker the MINIMUM spend to close the
  // 200 revenue gap (200 / roas 1.2 ≈ 166.7), not its full cap.
  const loss = plan.rows.find((r) => r.channel === "LOSS");
  assert.ok(Math.abs(loss.suggestedSpend - 200 / 1.2) < 1e-6);
  // Holding revenue costs some profit vs max-profit — the honest trade-off.
  const maxProfit = reallocateBudget(rows, { strategy: "max-profit" });
  assert.ok(plan.projectedNetProfit <= maxProfit.projectedNetProfit + 1e-9);
});

test("hold-revenue reports revenueHeld=false when the budget can't hold revenue", () => {
  const rows = revenueFallRows();
  // Only enough budget for the profitable channel's cap; nothing left to recover revenue.
  const plan = reallocateBudget(rows, { strategy: "hold-revenue", totalBudget: 300 });
  assert.ok(plan.projectedRevenue < plan.currentRevenue);
  assert.equal(plan.revenueHeld, false);
});
