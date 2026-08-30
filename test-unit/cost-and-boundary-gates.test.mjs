/** The two newest gates, asserted rather than described.
 *
 *  `npm run llm:budget:check` records what every LLM operation costs on the input
 *  side and fails when one gets materially more expensive; `npm run
 *  context:decay:check` fails when a change makes a feature group reach into
 *  another one that context-map.json does not declare. Both are only worth
 *  anything while they are wired into the gate that runs before a push — master
 *  ships on push here (docs/deploy.md § Delivery contract), so a stage quietly
 *  dropped from `check:ci` is a gate that stops existing without anything going
 *  red.
 *
 *  These tests are that consequence, in the same shape as
 *  test-unit/delivery-contract.test.mjs: they read package.json and fail when the
 *  teeth come out. `npm run test:unit` is itself inside check:ci, so disarming
 *  either gate turns the suite red on the disarmer's own machine.
 *
 *  The budget parity test is the second half: a new AI operation lands with a
 *  golden (shape) and is measured on the next bake (quality). Without a recorded
 *  ceiling it would land with no statement of what it costs, and the first place
 *  that shows up is a bill.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LLM_TOOLS } from "../test-llm/registry.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts ?? {};

test("the cost budget and the boundary check are stages of check:ci", () => {
  for (const stage of ["llm:budget:check", "context:decay:check"]) {
    assert.ok(scripts[stage], `package.json has no \`${stage}\` script.`);
    assert.ok(
      (scripts["check:ci"] ?? "").includes(`npm run ${stage}`),
      `\`check:ci\` no longer runs \`${stage}\`. On this repo's landing path (direct push to master) ` +
        "check:ci is what .husky/pre-push proves before the release act — a gate outside it cannot stop anything."
    );
  }
});

test("both gates point at scripts that exist", () => {
  assert.ok(existsSync(join(ROOT, "scripts/llm-budget.mjs")));
  assert.ok(existsSync(join(ROOT, "scripts/context-decay.mjs")));
  assert.match(scripts["llm:budget:check"], /scripts\/llm-budget\.mjs/);
  assert.match(scripts["context:decay:check"], /scripts\/context-decay\.mjs/);
});

test("context:decay:check pins an explicit base, so it cannot silently check nothing", () => {
  // Same reasoning as review:agent:gate: without a named base the script falls
  // back through origin/master → master → HEAD~1 and exits 0 when none resolve.
  // Naming it keeps the no-op case to the one we mean (CI's shallow checkout).
  assert.match(scripts["context:decay:check"], /--base\s+origin\/master/);
});

test("every registered LLM tool has a recorded cost ceiling, and none is recorded for a retired one", () => {
  const budget = JSON.parse(read("test-llm/budget.json"));
  const recorded = Object.keys(budget.tools ?? {});
  for (const tool of LLM_TOOLS) {
    const entry = (budget.tools ?? {})[tool.id];
    assert.ok(
      entry && Number.isFinite(Number(entry.maxInputChars)),
      `LLM tool "${tool.id}" has no maxInputChars in test-llm/budget.json. A new operation records what it ` +
        'costs: `npm run llm:budget -- --accept --reason "..."`.'
    );
  }
  const ids = new Set(LLM_TOOLS.map((t) => t.id));
  for (const id of recorded) {
    assert.ok(ids.has(id), `test-llm/budget.json budgets "${id}", which is not in the registry any more.`);
  }
  assert.ok(
    Number.isFinite(Number(budget.run?.maxInputChars)),
    "test-llm/budget.json has no run ceiling — the per-operation ceilings cannot see uniform drift."
  );
});
