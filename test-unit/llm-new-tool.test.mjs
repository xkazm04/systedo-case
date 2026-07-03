/** Unit tests for the `llm:new` scaffold's pure core
 *  (scripts/lib/llm-new-tool-core.mjs). The transforms are proven on fixture
 *  strings — the REAL registry.mjs / llm-gate.mjs are read here only to assert
 *  the anchors the CLI depends on still exist (both are gate-hashed; nothing in
 *  this suite writes to them). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WRAPPER_NAME,
  buildRegistryEntry,
  callSiteSnippet,
  insertHashedFile,
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

const GATE_FIXTURE = [
  "const HASHED_FILES = [",
  '  "src/lib/llm/index.ts",',
  '  "src/lib/ai/tools/_shared.ts",',
  '  "src/lib/ai/tools/ads.ts",',
  '  "src/app/api/ai/route.ts",',
  '  "test-llm/registry.mjs",',
  "];",
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

test("insertHashedFile lands after the last tools file, preserving indentation", () => {
  const next = insertHashedFile(GATE_FIXTURE, "src/lib/ai/tools/my-tool.ts");
  const lines = next.split("\n");
  const idx = lines.findIndex((l) => l.includes("my-tool.ts"));
  assert.ok(idx > 0, "inserted");
  assert.equal(lines[idx], '  "src/lib/ai/tools/my-tool.ts",', "exact line shape");
  assert.ok(lines[idx - 1].includes("tools/ads.ts"), "after the last tools entry");
  assert.ok(lines[idx + 1].includes("api/ai/route.ts"), "before the route entries");
  assert.throws(() => insertHashedFile(next, "src/lib/ai/tools/my-tool.ts"), /already listed/);
  assert.throws(() => insertHashedFile("const X = [];", "src/lib/ai/tools/x.ts"), /could not find/);
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

test("the real registry and gate still carry the anchors the CLI relies on", () => {
  const registry = readFileSync(new URL("../test-llm/registry.mjs", import.meta.url), "utf8");
  assert.ok(registry.includes("export const LLM_TOOLS = ["), "LLM_TOOLS array");
  assert.ok(registry.lastIndexOf("\n];") > 0, "closing bracket anchor");

  const gate = readFileSync(new URL("../scripts/llm-gate.mjs", import.meta.url), "utf8");
  assert.ok(gate.includes("const HASHED_FILES = ["), "HASHED_FILES array");
  assert.ok(/^\s*"src\/lib\/ai\/tools\/.+\.ts",\s*$/m.test(gate), "tools block anchor");

  // both transforms must apply cleanly to the real files (result discarded)
  assert.doesNotThrow(() => insertRegistryEntry(registry, { id: "zz-probe", label: "Probe" }));
  assert.doesNotThrow(() => insertHashedFile(gate, "src/lib/ai/tools/zz-probe.ts"));
});
