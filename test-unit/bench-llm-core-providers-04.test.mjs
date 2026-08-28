/** Bench regression (llm-core-providers-04): the weekly digest's "AI provoz" cost
 *  line must honor the `nullable-cost-never-zero` doctrine (src/lib/llm/cost.ts):
 *  every aggregate over telemetry entries discloses how many calls were unpriced.
 *  ToolTelemetry already carries `unpricedCalls`, but AiOpsSummary drops it and
 *  aiOpsLines renders a flat "$X.XX" — in dev/self-hosted (100 % unpriced) the
 *  digest reads "odhad nákladů $0.00", exactly the "reads as free" claim the
 *  doctrine exists to prevent. Correct behaviour: summarizeAiOps sums
 *  t.unpricedCalls into the summary and aiOpsLines discloses the count when > 0. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { aiOpsLines, summarizeAiOps } from "@/lib/llm/telemetry-ops";

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
    unpricedCalls: 0,
    drifted: false,
    ...overrides,
  };
}

test("summarizeAiOps carries the unpriced-call count across tools", () => {
  const s = summarizeAiOps([
    tool({ toolId: "brief", calls: 5, unpricedCalls: 2, totalCostUsd: 0.5 }),
    tool({ toolId: "analysis", calls: 4, unpricedCalls: 1, totalCostUsd: 0 }),
  ]);
  assert.equal(
    s.unpricedCalls,
    3,
    "AiOpsSummary must disclose how many calls were unpriced (nullable-cost-never-zero doctrine)"
  );
  const priced = summarizeAiOps([tool({ calls: 4, unpricedCalls: 0 })]);
  assert.equal(priced.unpricedCalls, 0, "a fully-priced window discloses zero");
});

test("the digest lines disclose the unpriced count when > 0", () => {
  const s = summarizeAiOps([
    tool({ toolId: "brief", calls: 5, unpricedCalls: 2, totalCostUsd: 0.5 }),
    tool({ toolId: "analysis", calls: 4, unpricedCalls: 1, totalCostUsd: 0 }),
  ]);
  const rendered = aiOpsLines(s).join("\n");
  // 3 of the 9 calls are unpriced; no other figure in this fixture renders as "3",
  // so the digit only appears if the cost estimate carries its disclosure.
  assert.ok(
    /3/.test(rendered),
    `the cost line must disclose the 3 unpriced calls, got:\n${rendered}`
  );
});
