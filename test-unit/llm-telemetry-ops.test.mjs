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
    unpricedCalls: 0,
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

test("status counts + percentiles are populated only when raw entries are passed", () => {
  const tools = [tool({ calls: 3 })];
  // Without entries: additive fields default, existing fields unchanged.
  const noEntries = summarizeAiOps(tools);
  assert.deepEqual(noEntries.statusCounts, { success: 0, repaired: 0, corrupt: 0, error: 0, demo: 0 });
  assert.equal(noEntries.successRate, 1);
  assert.equal(noEntries.problemCalls, 0);
  assert.equal(noEntries.p50TookMs, 0);
  assert.equal(noEntries.p95TookMs, 0);

  // With entries: real status counts, success rate over real calls, percentiles.
  const entries = [
    { status: "success", demo: false, tookMs: 100 },
    { status: "success", demo: false, tookMs: 300 },
    { status: "corrupt", demo: false, tookMs: 500 },
    { status: "error", demo: false, tookMs: 700 },
    { status: "demo", demo: true, tookMs: 1 },
  ];
  const withEntries = summarizeAiOps(tools, entries);
  assert.equal(withEntries.statusCounts.corrupt, 1);
  assert.equal(withEntries.statusCounts.error, 1);
  assert.equal(withEntries.problemCalls, 2);
  assert.equal(withEntries.successRate, 0.5); // 2 healthy of 4 real
  assert.equal(withEntries.p50TookMs, 300);
  assert.equal(withEntries.p95TookMs, 700);
});

test("status/latency line renders only with entries; problem line on corrupt/error", () => {
  const tools = [tool({ toolId: "brief", calls: 5, totalCostUsd: 0.4 })];
  // No entries → no extra status line (old callers render exactly as before).
  const plain = aiOpsLines(summarizeAiOps(tools));
  assert.equal(plain.length, 1);

  const entries = [
    { status: "success", demo: false, tookMs: 100 },
    { status: "success", demo: false, tookMs: 200 },
    { status: "corrupt", demo: false, tookMs: 400 },
  ];
  const lines = aiOpsLines(summarizeAiOps(tools, entries));
  assert.ok(lines.some((l) => /Úspěšnost/.test(l) && /p50/.test(l) && /p95/.test(l)));
  assert.ok(lines.some((l) => /poškozených/.test(l)));
  assert.ok(lines.some((l) => /skončilo chybou nebo poškozeným/.test(l)));
});

test("`nullable-cost-never-zero`: the cost line discloses unpriced calls", () => {
  // The dev/self-hosted CLI subscription reports no usage at all, so every call is
  // unpriced and the estimate is $0.00 — which must NOT read as "the week was free".
  const subscription = summarizeAiOps([
    tool({ toolId: "brief", calls: 6, totalCostUsd: 0, unpricedCalls: 6 }),
    tool({ toolId: "analysis", calls: 4, totalCostUsd: 0, unpricedCalls: 4 }),
  ]);
  assert.equal(subscription.unpricedCalls, 10);
  assert.match(aiOpsLines(subscription)[0], /\$0\.00[^·]*10 volání bez vyčíslení/);

  // A partly-priced window still discloses the gap next to the total.
  const mixed = summarizeAiOps([tool({ calls: 8, totalCostUsd: 1.25, unpricedCalls: 3 })]);
  assert.equal(mixed.unpricedCalls, 3);
  assert.match(aiOpsLines(mixed)[0], /\$1\.25[^·]*3 volání bez vyčíslení/);

  // Fully priced → no disclosure to make, so the line stays clean.
  const priced = summarizeAiOps([tool({ calls: 8, totalCostUsd: 1.25, unpricedCalls: 0 })]);
  assert.equal(priced.unpricedCalls, 0);
  assert.doesNotMatch(aiOpsLines(priced)[0], /bez vyčíslení/);
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
