/** Offline validator regression tests over the captured real-model corpus
 *  (llm-test-gate idea #5). Each tool's registry validate() is otherwise only
 *  executed minutes into a real gate run — a broken or over-strict validator is
 *  discovered at maximum cost (the article-draft `every()` flake). The gate's
 *  proving runs set LLM_CAPTURE=1, so test-llm/real.test.mjs writes each tool's
 *  validated output to test-llm/samples/<id>.json; replaying the committed
 *  corpus here costs milliseconds and zero model spend. A tool with no sample
 *  yet (new tool, corpus not seeded) is skipped visibly, never failed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { LLM_TOOLS } from "../test-llm/registry.mjs";

const samplePath = (id) => new URL(`../test-llm/samples/${id}.json`, import.meta.url);

for (const tool of LLM_TOOLS) {
  test(`llm sample · ${tool.id} — captured real output passes validate()`, (t) => {
    const p = samplePath(tool.id);
    if (!existsSync(p)) {
      t.skip("no captured sample yet — the next real gate run seeds it (LLM_CAPTURE=1)");
      return;
    }
    const sample = JSON.parse(readFileSync(p, "utf8"));
    assert.ok(
      tool.validate(sample),
      `[${tool.id}] the committed real-model sample no longer passes the registry validator — ` +
        "the validator got stricter than actual model output (fix it offline, not 340 s in)."
    );
  });
}
