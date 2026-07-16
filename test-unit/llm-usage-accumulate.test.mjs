/** addUsage (src/lib/llm/cost.ts) — a repaired generation makes TWO real metered
 *  calls; the wrapper must report their COMBINED usage, not "latest wins" (which
 *  undercounted telemetry + on-screen cost by a whole paid call on every repair).
 *  Pure — no model. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { addUsage } = await import("@/lib/llm/cost");

const u = (i, o, cost) => ({
  inputTokens: i,
  outputTokens: o,
  totalTokens: i + o,
  ...(cost === undefined ? {} : { costUsd: cost }),
});

test("addUsage: undefined operands pass the other through unchanged", () => {
  const a = u(10, 5);
  assert.equal(addUsage(undefined, a), a);
  assert.equal(addUsage(a, undefined), a);
  assert.equal(addUsage(undefined, undefined), undefined);
});

test("addUsage: token counters sum across both calls", () => {
  const sum = addUsage(u(100, 40), u(60, 20));
  assert.equal(sum.inputTokens, 160);
  assert.equal(sum.outputTokens, 60);
  assert.equal(sum.totalTokens, 220);
});

test("addUsage: costUsd sums only when BOTH calls report one", () => {
  assert.equal(addUsage(u(1, 1, 0.01), u(1, 1, 0.02)).costUsd, 0.03);
  // one side missing a real cost → drop to undefined (let the estimate stand),
  // rather than presenting a half-real dollar figure as authoritative.
  assert.equal(addUsage(u(1, 1, 0.01), u(1, 1)).costUsd, undefined);
  assert.equal(addUsage(u(1, 1), u(1, 1, 0.02)).costUsd, undefined);
  assert.equal(addUsage(u(1, 1), u(1, 1)).costUsd, undefined);
});
