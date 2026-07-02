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

// Three attempts because the Claude CLI occasionally returns a truncated /
// invalid-JSON response, which the wrapper absorbs by falling back to the demo
// stub (meta.demo=true). That is a transient CLI flake, not a contract break, so
// we retry it; a genuinely broken tool fails all attempts. Timeout covers the
// worst case of MAX_ATTEMPTS slow real calls back to back.
const MAX_ATTEMPTS = 3;
const PER_TEST_TIMEOUT = 300_000;

/** True when a call produced a real, provider-backed, schema-valid result. */
function passed(tool, res) {
  return res.meta.demo === false && res.meta.model === CLAUDE_MODEL && tool.validate(res.result);
}

for (const tool of LLM_TOOLS) {
  test(`LLM wrapper · ${tool.id} (${tool.label}) · real Claude`, { timeout: PER_TEST_TIMEOUT }, async () => {
    let res;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      res = await generateStructured({
        system: tool.system,
        prompt: tool.prompt,
        schema: tool.schema,
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
    assert.equal(res.meta.model, CLAUDE_MODEL, `[${tool.id}] expected the Claude provider in dev`);
    assert.ok(
      tool.validate(res.result),
      `[${tool.id}] result failed validation: ${JSON.stringify(res.result).slice(0, 400)}`
    );
  });
}
