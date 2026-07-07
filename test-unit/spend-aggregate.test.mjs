/** telemetryToSpend (src/lib/spend/aggregate.ts): project filter + entry mapping
 *  + daysAgo from the ISO timestamp. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { telemetryToSpend } from "@/lib/spend/aggregate";

const NOW = Date.parse("2026-07-07T12:00:00.000Z");
const entry = (over = {}) => ({
  toolId: "analysis", promptHash: "h", provider: "gemini-2.0-flash", model: "gemini-2.0-flash",
  demo: false, tookMs: 900, attempts: 1, repaired: false, estCostUsd: 0.02,
  inputTokens: 1200, outputTokens: 300, at: "2026-07-05T12:00:00.000Z", ...over,
});

test("filters to the requested project", () => {
  const rows = telemetryToSpend(
    [entry({ projectId: "p1" }), entry({ projectId: "p2" }), entry({ projectId: "p1" })],
    "p1",
    NOW
  );
  assert.equal(rows.length, 2);
});

test("no projectId keeps every entry", () => {
  const rows = telemetryToSpend([entry({ projectId: "p1" }), entry({})], undefined, NOW);
  assert.equal(rows.length, 2);
});

test("maps tokens (in+out), cost and per-call count", () => {
  const [r] = telemetryToSpend([entry({ projectId: "p1", inputTokens: 1000, outputTokens: 250, estCostUsd: 0.05 })], "p1", NOW);
  assert.equal(r.calls, 1);
  assert.equal(r.tokens, 1250);
  assert.equal(r.costUsd, 0.05);
  assert.equal(r.toolId, "analysis");
});

test("daysAgo is whole days between `at` and now, floored at 0", () => {
  const [r] = telemetryToSpend([entry({ projectId: "p1", at: "2026-07-05T12:00:00.000Z" })], "p1", NOW);
  assert.equal(r.daysAgo, 2);
  // a future timestamp clamps to 0, never negative
  const [f] = telemetryToSpend([entry({ projectId: "p1", at: "2026-07-09T12:00:00.000Z" })], "p1", NOW);
  assert.equal(f.daysAgo, 0);
});
