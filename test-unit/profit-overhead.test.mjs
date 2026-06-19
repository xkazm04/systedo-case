/** Unit tests for overhead-adjusted POAS (#5). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOverhead } from "@/lib/profit/overhead";

// ChannelRow needs revenue/cost/conversions/roas/channel/color.
const row = (channel, revenue, cost, conversions) => ({
  channel,
  color: "#000",
  visits: 0,
  cost,
  conversions,
  revenue,
  pno: 0,
  aov: 0,
  cr: 0,
  roas: cost > 0 ? revenue / cost : 0,
  revenueShare: 0,
});

const margins = [
  { channel: "A", marginPct: 0.5 },
  { channel: "B", marginPct: 0.5 },
];

test("disabled overhead leaves the gross-margin view unchanged", () => {
  const rows = [row("A", 1000, 200, 10), row("B", 1000, 200, 10)];
  const { rows: out, summary } = applyOverhead(rows, margins, {
    enabled: false,
    monthlyOverhead: 999_999,
    perOrderCost: 999,
    months: 3,
  });
  for (const r of out) {
    assert.equal(r.allocatedOverhead, 0);
    assert.equal(r.fulfilmentCost, 0);
    assert.equal(r.contributionProfit, r.grossProfit - 0); // == grossProfit
    assert.equal(r.contributionPoas, r.poas);
  }
  assert.equal(summary.totalOverhead, 0);
});

test("overhead is allocated by revenue share and fulfilment per order", () => {
  // A: revenue 3000 (75 %), B: revenue 1000 (25 %). Overhead 1000 × 1 month.
  const rows = [row("A", 3000, 500, 10), row("B", 1000, 500, 20)];
  const { rows: out } = applyOverhead(rows, margins, {
    enabled: true,
    monthlyOverhead: 1000,
    perOrderCost: 5,
    months: 1,
  });
  const a = out.find((r) => r.channel === "A");
  const b = out.find((r) => r.channel === "B");

  // Revenue-share allocation of the 1000 overhead.
  assert.equal(a.allocatedOverhead, 750); // 75 %
  assert.equal(b.allocatedOverhead, 250); // 25 %
  // Fulfilment = perOrder × conversions.
  assert.equal(a.fulfilmentCost, 50); // 5 × 10
  assert.equal(b.fulfilmentCost, 100); // 5 × 20

  // Contribution = gross − overhead − fulfilment.
  // A: gross 1500 − 750 − 50 = 700.
  assert.equal(a.contributionProfit, 700);
  // B: gross 500 − 250 − 100 = 150.
  assert.equal(b.contributionProfit, 150);

  // Contribution POAS = contribution / cost (mirrors the gross POAS definition).
  assert.equal(a.contributionPoas, 700 / 500);
});

test("overhead scales by the number of months in the window", () => {
  const rows = [row("A", 1000, 100, 1)];
  const one = applyOverhead(rows, [{ channel: "A", marginPct: 0.5 }], {
    enabled: true,
    monthlyOverhead: 300,
    perOrderCost: 0,
    months: 1,
  });
  const three = applyOverhead(rows, [{ channel: "A", marginPct: 0.5 }], {
    enabled: true,
    monthlyOverhead: 300,
    perOrderCost: 0,
    months: 3,
  });
  assert.equal(one.rows[0].allocatedOverhead, 300);
  assert.equal(three.rows[0].allocatedOverhead, 900);
});

test("adjusted break-even ROAS rises once overhead is loaded in", () => {
  const rows = [row("A", 1000, 200, 10)];
  const { rows: out } = applyOverhead(rows, [{ channel: "A", marginPct: 0.5 }], {
    enabled: true,
    monthlyOverhead: 100,
    perOrderCost: 5,
    months: 1,
  });
  const r = out[0];
  // Plain break-even = 1/0.5 = 2. With overhead+fulfilment, loadedCost > cost so
  // the adjusted break-even ROAS must be strictly higher.
  assert.equal(r.breakEvenRoas, 2);
  assert.ok(r.adjustedBreakEvenRoas > 2, "adjusted break-even must exceed plain");
  // loadedCost = 200 + 100 + 50 = 350; adjusted = 350 / (200 × 0.5) = 3.5.
  assert.equal(r.adjustedBreakEvenRoas, 3.5);
});

test("a channel profitable on gross margin can flip negative after overhead", () => {
  // Gross profit positive (500), but heavy overhead + fulfilment drown it.
  const rows = [row("A", 1000, 300, 50)];
  const { rows: out, summary } = applyOverhead(rows, [{ channel: "A", marginPct: 0.5 }], {
    enabled: true,
    monthlyOverhead: 200,
    perOrderCost: 10, // 10 × 50 = 500 fulfilment
    months: 1,
  });
  // gross 500 − overhead 200 − fulfilment 500 = −200.
  assert.equal(out[0].contributionProfit, -200);
  assert.equal(summary.unprofitableCount, 1);
});
