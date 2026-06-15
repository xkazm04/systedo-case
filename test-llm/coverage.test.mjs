/** Static coverage gate (no model calls): every LLM wrapper call site must be
 *  tagged and registered, and provider access must stay confined to the wrapper.
 *  Fast — safe to run on every commit.
 *
 *  Run:  node --test test-llm/coverage.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findCallSites, checkChokepoint } from "./callsites.mjs";
import { LLM_TOOLS } from "./registry.mjs";

test("every generateStructured call site carries a // llm-tool tag", () => {
  const { callSites, tags } = findCallSites();
  assert.ok(callSites.length > 0, "expected at least one LLM wrapper call site");
  assert.equal(
    callSites.length,
    tags.length,
    `${callSites.length} generateStructured call site(s) but ${tags.length} // llm-tool tag(s) — tag each call site`
  );
});

test("every tagged call site has a registered test", () => {
  const { tags } = findCallSites();
  const registered = new Set(LLM_TOOLS.map((t) => t.id));
  for (const tag of tags) {
    assert.ok(
      registered.has(tag.id),
      `call site ${tag.file}:${tag.line} tagged "${tag.id}" has no registry entry (= no test)`
    );
  }
});

test("every registered tool maps to a real call site", () => {
  const { tags } = findCallSites();
  const tagged = new Set(tags.map((t) => t.id));
  for (const tool of LLM_TOOLS) {
    assert.ok(tagged.has(tool.id), `registry tool "${tool.id}" has no // llm-tool call site in src`);
  }
});

test("provider SDK / CLI access is confined to the wrapper (single chokepoint)", () => {
  const violations = checkChokepoint();
  assert.deepEqual(violations, [], `provider access leaked outside the wrapper:\n  ${violations.join("\n  ")}`);
});
