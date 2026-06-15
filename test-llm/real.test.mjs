/** Real LLM wrapper tests — one per registered tool, run against the actual
 *  Claude Code CLI (development provider). Proves every place the app uses the
 *  wrapper produces valid, schema-shaped output through the real model.
 *
 *  Slow on purpose (each test calls the model). The pre-commit gate caches a pass
 *  and won't re-run until the LLM code changes — see scripts/llm-gate.mjs.
 *
 *  Run:  node --import ./test-llm/setup.mjs --test test-llm/real.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateStructured, CLAUDE_MODEL } from "../src/lib/llm/index.ts";
import { LLM_TOOLS } from "./registry.mjs";

const PER_TEST_TIMEOUT = 120_000;

for (const tool of LLM_TOOLS) {
  test(`LLM wrapper · ${tool.id} (${tool.label}) · real Claude`, { timeout: PER_TEST_TIMEOUT }, async () => {
    const res = await generateStructured({
      system: tool.system,
      prompt: tool.prompt,
      schema: tool.schema,
      normalize: (parsed) => parsed,
      demo: () => ({ __demo: true }),
    });

    assert.equal(
      res.meta.demo,
      false,
      `[${tool.id}] got the demo fallback — is the Claude CLI installed and logged in?`
    );
    assert.equal(res.meta.model, CLAUDE_MODEL, `[${tool.id}] expected the Claude provider in dev`);
    assert.ok(
      tool.validate(res.result),
      `[${tool.id}] result failed validation: ${JSON.stringify(res.result).slice(0, 400)}`
    );
  });
}
