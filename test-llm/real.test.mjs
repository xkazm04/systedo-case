/** Real LLM wrapper tests — one per registered tool, run against the actual
 *  Claude Code CLI (development provider). Proves every place the app uses the
 *  wrapper produces valid, schema-shaped output through the real model, on the
 *  model tier the tool actually runs (registry `tier: "fast"` → haiku-class).
 *
 *  Slow on purpose (each test calls the model). The pre-commit gate caches a pass
 *  and won't re-run until the LLM code changes — see scripts/llm-gate.mjs.
 *
 *  When LLM_CAPTURE=1 (set by the gate's proving runs), each passing test writes
 *  the validated model output to test-llm/samples/<id>.json — the committed
 *  corpus behind the fast offline validator tests (test-unit/llm-samples).
 *
 *  Run:  node --import ./test-llm/setup.mjs --test test-llm/real.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateStructured, CLAUDE_MODEL, CLAUDE_MODEL_FAST } from "../src/lib/llm/index.ts";
import { LLM_TOOLS } from "./registry.mjs";

// Three attempts because the Claude CLI occasionally returns a truncated /
// invalid-JSON response, which the wrapper absorbs by falling back to the demo
// stub (meta.demo=true). That is a transient CLI flake, not a contract break, so
// we retry it; a genuinely broken tool fails all attempts. Timeout covers the
// worst case of MAX_ATTEMPTS slow real calls back to back.
const MAX_ATTEMPTS = 3;
const PER_TEST_TIMEOUT = 300_000;
const CAPTURE = process.env.LLM_CAPTURE === "1";
const SAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "samples");

/** The model a tool must run on: registry `tier: "fast"` → haiku-class. */
const expectedModelFor = (tool) => (tool.tier === "fast" ? CLAUDE_MODEL_FAST : CLAUDE_MODEL);

/** True when a call produced a real, provider-backed, schema-valid result on
 *  the tool's own tier. */
function passed(tool, res) {
  return res.meta.demo === false && res.meta.model === expectedModelFor(tool) && tool.validate(res.result);
}

for (const tool of LLM_TOOLS) {
  test(`LLM wrapper · ${tool.id} (${tool.label}) · real Claude`, { timeout: PER_TEST_TIMEOUT }, async () => {
    let res;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      res = await generateStructured({
        system: tool.system,
        prompt: tool.prompt,
        schema: tool.schema,
        tier: tool.tier,
        normalize: (parsed) => parsed,
        demo: () => ({ __demo: true }),
      });
      if (passed(tool, res)) break;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `[${tool.id}] attempt ${attempt}/${MAX_ATTEMPTS} flaked (demo=${res.meta.demo}, model=${res.meta.model}) — retrying`
        );
      }
    }

    // Assert on the final attempt so a persistent failure still reports a
    // meaningful message; a transient flake will have broken out above.
    assert.equal(
      res.meta.demo,
      false,
      `[${tool.id}] got the demo fallback after ${MAX_ATTEMPTS} attempts — is the Claude CLI installed and logged in?`
    );
    const expectedModel = expectedModelFor(tool);
    assert.equal(
      res.meta.model,
      expectedModel,
      `[${tool.id}] expected the Claude provider in dev on the "${tool.tier ?? "quality"}" tier`
    );
    assert.ok(
      tool.validate(res.result),
      `[${tool.id}] result failed validation: ${JSON.stringify(res.result).slice(0, 400)}`
    );

    // Corpus capture: a passing real run persists its validated output, so the
    // offline validator tests replay genuine model shapes with zero model spend.
    if (CAPTURE) {
      mkdirSync(SAMPLES_DIR, { recursive: true });
      writeFileSync(join(SAMPLES_DIR, `${tool.id}.json`), JSON.stringify(res.result, null, 2) + "\n");
    }
  });
}
