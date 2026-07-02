/** Unit tests for the incremental LLM-gate planner (scripts/lib/gate-plan.mjs)
 *  — the pure "what must the real-model run re-prove?" decision. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planGateRun } from "../scripts/lib/gate-plan.mjs";

const ALL = ["ads", "brief", "analysis", "social"];
const FILE_TOOLS = {
  "src/lib/ai/tools/ads.ts": ["ads"],
  "src/lib/ai/tools/brief.ts": ["brief"],
  "src/lib/ai/tools/analysis.ts": ["analysis"],
  "src/lib/ai/tools/social.ts": ["social"],
};
const base = { fileTools: FILE_TOOLS, allTools: ALL, registryFile: "test-llm/registry.mjs" };

test("no changes → skip", () => {
  const plan = planGateRun({ ...base, changedFiles: [] });
  assert.equal(plan.mode, "skip");
  assert.deepEqual(plan.tools, []);
});

test("--force → full even with no changes", () => {
  const plan = planGateRun({ ...base, changedFiles: [], force: true });
  assert.equal(plan.mode, "full");
  assert.deepEqual(plan.tools, ALL);
});

test("a single tool file → partial with exactly that tool", () => {
  const plan = planGateRun({ ...base, changedFiles: ["src/lib/ai/tools/ads.ts"] });
  assert.equal(plan.mode, "partial");
  assert.deepEqual(plan.tools, ["ads"]);
});

test("two tool files → partial with both, sorted", () => {
  const plan = planGateRun({
    ...base,
    changedFiles: ["src/lib/ai/tools/social.ts", "src/lib/ai/tools/ads.ts"],
  });
  assert.equal(plan.mode, "partial");
  assert.deepEqual(plan.tools, ["ads", "social"]);
});

test("a shared file (wrapper/provider/route) → full", () => {
  for (const shared of ["src/lib/llm/index.ts", "src/lib/ai/tools/_shared.ts", "src/app/api/ai/route.ts", "test-llm/real.test.mjs"]) {
    const plan = planGateRun({ ...base, changedFiles: [shared] });
    assert.equal(plan.mode, "full", `${shared} must force a full run`);
    assert.match(plan.reason, /shared/);
  }
});

test("shared file wins even when tool files changed too", () => {
  const plan = planGateRun({
    ...base,
    changedFiles: ["src/lib/ai/tools/ads.ts", "src/lib/llm/claude.ts"],
  });
  assert.equal(plan.mode, "full");
});

test("registry change attributed to one tool → partial", () => {
  const plan = planGateRun({
    ...base,
    changedFiles: ["test-llm/registry.mjs"],
    registryChangedTools: ["brief"],
  });
  assert.equal(plan.mode, "partial");
  assert.deepEqual(plan.tools, ["brief"]);
});

test("registry change with no per-tool delta (shared helpers) → full", () => {
  const plan = planGateRun({
    ...base,
    changedFiles: ["test-llm/registry.mjs"],
    registryUnattributed: true,
  });
  assert.equal(plan.mode, "full");
});

test("a never-proven tool is re-proven even with no file changes", () => {
  const plan = planGateRun({ ...base, changedFiles: [], unprovenTools: ["social"] });
  assert.equal(plan.mode, "partial");
  assert.deepEqual(plan.tools, ["social"]);
});

test("tool file + registry entry + unproven tool union without duplicates", () => {
  const plan = planGateRun({
    ...base,
    changedFiles: ["src/lib/ai/tools/ads.ts", "test-llm/registry.mjs"],
    registryChangedTools: ["ads", "brief"],
    unprovenTools: ["brief"],
  });
  assert.equal(plan.mode, "partial");
  assert.deepEqual(plan.tools, ["ads", "brief"]);
});

test("when every tool is affected, collapse to a full run", () => {
  const plan = planGateRun({
    ...base,
    changedFiles: Object.keys(FILE_TOOLS),
  });
  assert.equal(plan.mode, "full");
  assert.deepEqual(plan.tools, ALL);
});
