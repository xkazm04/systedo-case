/** Unit tests for the `llm:new` scaffold's pure core
 *  (scripts/lib/llm-new-tool-core.mjs). The transforms are proven on fixture
 *  strings — the REAL registry.mjs is read here only to assert the anchors the
 *  CLI depends on still exist (nothing in this suite writes to it). The
 *  HASHED_FILES insertion died with the gate's real-model re-prove
 *  (2026-08-05; the gate is static-only now). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WRAPPER_NAME,
  buildRegistryEntry,
  callSiteSnippet,
  insertRegistryEntry,
  validToolId,
} from "../scripts/lib/llm-new-tool-core.mjs";

const REGISTRY_FIXTURE = [
  'import { Type } from "@google/genai";',
  "",
  "const isStr = (v) => typeof v === \"string\" && v.trim().length > 0;",
  "",
  "export const LLM_TOOLS = [",
  "  {",
  '    id: "ads",',
  '    label: "PPC inzeráty",',
  '    system: "Jsi český PPC specialista.",',
  '    prompt: "Vytvoř sadu inzerátů.",',
  "    schema: { type: Type.OBJECT },",
  "    validate: (r) => r && isStr(r.rationale),",
  "  },",
  "];",
  "",
].join("\n");

test("validToolId accepts tag-grammar ids and rejects everything else", () => {
  for (const ok of ["ads", "lead-reply", "a1", "keyword-clusters"]) {
    assert.ok(validToolId(ok), ok);
  }
  for (const bad of ["", "Ads", "my_tool", "-lead", "a b", "č-tool", null]) {
    assert.ok(!validToolId(bad), String(bad));
  }
});

test("insertRegistryEntry appends a skeleton before the closing bracket", () => {
  const next = insertRegistryEntry(REGISTRY_FIXTURE, { id: "my-tool", label: "Můj nástroj" });
  assert.ok(next.includes('id: "my-tool"'), "entry present");
  assert.ok(next.includes('label: "Můj nástroj"'), "label present");
  // still inside the array: the entry sits before the final `];`
  assert.ok(next.lastIndexOf('id: "my-tool"') < next.lastIndexOf("\n];"), "inside LLM_TOOLS");
  // the existing entry is untouched and the skeleton follows house style
  assert.ok(next.includes('id: "ads"'), "existing entries preserved");
  assert.ok(next.includes("validate: (r) => r && isStr(r.summary)"), "lenient validator");
  // a duplicate id must fail loudly, not scaffold twice
  assert.throws(() => insertRegistryEntry(next, { id: "my-tool", label: "X" }), /already registered/);
});

test("the call-site snippet carries the tag next to the wrapper call + id arg", () => {
  const snippet = callSiteSnippet("my-tool");
  const lines = snippet.split("\n");
  const callLine = lines.findIndex((l) => l.includes(`${WRAPPER_NAME}(`));
  const tagLine = lines.findIndex((l) => l.includes("// llm-tool: my-tool"));
  assert.ok(callLine >= 0 && tagLine >= 0, "both present");
  // the gate pairs a tag to a call site within ±2 lines — the snippet must comply
  assert.ok(Math.abs(tagLine - callLine) <= 2, "tag within the pairing window");
  assert.ok(snippet.includes('id: "my-tool"'), "telemetry attribution arg");
});

test("the real registry still carries the anchors the CLI relies on", () => {
  const registry = readFileSync(new URL("../test-llm/registry.mjs", import.meta.url), "utf8");
  assert.ok(registry.includes("export const LLM_TOOLS = ["), "LLM_TOOLS array");
  assert.ok(registry.lastIndexOf("\n];") > 0, "closing bracket anchor");

  // the transform must apply cleanly to the real file (result discarded)
  assert.doesNotThrow(() => insertRegistryEntry(registry, { id: "zz-probe", label: "Probe" }));
});
