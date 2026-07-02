/** The pure "AI provoz" rollup behind the weekly digest's new section
 *  (src/lib/llm/telemetry-ops.ts): totals, demo-rate + warn threshold, drifted
 *  tool contracts and the Czech line rendering. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_DEMO_RATE_WARN,
  aiOpsLines,
  summarizeAiOps,
} from "@/lib/llm/telemetry-ops";

/** Minimal ToolTelemetry row (the shape aggregateTelemetry produces). */
function tool(overrides = {}) {
  return {
    toolId: "brief",
    promptHashes: ["a"],
    calls: 4,
    demoCalls: 0,
    avgTookMs: 1000,
    totalCostUsd: 0.5,
    totalTokens: 1000,
    repairs: 0,
    drifted: false,
    ...overrides,
  };
}

test("sums calls, cost and repairs across tools and collects drifted ids", () => {
  const s = summarizeAiOps([
    tool({ toolId: "brief", calls: 6, demoCalls: 1, totalCostUsd: 0.75, repairs: 2 }),
    tool({ toolId: "campaign-eval", calls: 4, demoCalls: 1, totalCostUsd: 0.25, drifted: true }),
  ]);
  assert.equal(s.calls, 10);
  assert.equal(s.demoCalls, 2);
  assert.equal(s.demoRate, 0.2);
  assert.equal(s.totalCostUsd, 1);
  assert.equal(s.repairs, 2);
  assert.deepEqual(s.driftedTools, ["campaign-eval"]);
  assert.equal(s.warn, false);
});

test("warn flips only when the demo-rate exceeds the threshold", () => {
  const at = summarizeAiOps([tool({ calls: 10, demoCalls: 10 * AI_DEMO_RATE_WARN })]);
  assert.equal(at.warn, false, "exactly at the threshold does not warn");

  const above = summarizeAiOps([tool({ calls: 10, demoCalls: 10 * AI_DEMO_RATE_WARN + 1 })]);
  assert.equal(above.warn, true, "above the threshold warns");

  const empty = summarizeAiOps([]);
  assert.equal(empty.calls, 0);
  assert.equal(empty.demoRate, 0);
  assert.equal(empty.warn, false, "an empty window never warns");
});

test("renders Czech lines — and none at all for a quiet week", () => {
  assert.deepEqual(aiOpsLines(summarizeAiOps([])), []);

  const lines = aiOpsLines(
    summarizeAiOps([
      tool({ toolId: "brief", calls: 8, demoCalls: 6, totalCostUsd: 1.25, repairs: 1 }),
      tool({ toolId: "analysis", calls: 2, demoCalls: 2, drifted: true, totalCostUsd: 0 }),
    ])
  );
  // headline: calls, cost, demo-rate, repairs
  assert.match(lines[0], /10 volání/);
  assert.match(lines[0], /\$1\.25/);
  assert.match(lines[0], /80\s?% v ukázkovém režimu/);
  assert.match(lines[0], /1 oprav výstupu/);
  // warn line (80 % > 50 %) + one drift line per drifted tool
  assert.ok(lines.some((l) => l.includes("zkontrolujte dostupnost")));
  assert.ok(lines.some((l) => l.includes("analysis") && l.includes("drift")));
});
