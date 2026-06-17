/** Unit tests for the profit/POAS math. Runs the TS source directly via the
 *  shared resolve hook (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProfit } from "@/lib/profit/compute";

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
