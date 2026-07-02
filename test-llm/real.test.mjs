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

const PER_TEST_TIMEOUT = 120_000;
const CAPTURE = process.env.LLM_CAPTURE === "1";
const SAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "samples");

for (const tool of LLM_TOOLS) {
  test(`LLM wrapper · ${tool.id} (${tool.label}) · real Claude`, { timeout: PER_TEST_TIMEOUT }, async () => {
    const res = await generateStructured({
      system: tool.system,
      prompt: tool.prompt,
      schema: tool.schema,
      tier: tool.tier,
      normalize: (parsed) => parsed,
      demo: () => ({ __demo: true }),
    });

    assert.equal(
      res.meta.demo,
      false,
      `[${tool.id}] got the demo fallback — is the Claude CLI installed and logged in?`
    );
    const expectedModel = tool.tier === "fast" ? CLAUDE_MODEL_FAST : CLAUDE_MODEL;
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
