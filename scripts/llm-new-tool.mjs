#!/usr/bin/env node
/** llm:new — scaffold a new LLM tool in one shot.
 *
 *  Adding a tool used to be a multi-part manual ritual (call-site tag, registry
 *  fixture, golden), fumbled at least once. This generator makes the safe path
 *  the lazy path:
 *
 *    npm run llm:new -- --id my-tool --label "Můj nástroj" [--file src/lib/ai/tools/my-tool.ts] [--dry-run]
 *
 *  It appends a registry entry skeleton, writes the contract golden
 *  (llm-eval --update), prints the call-site snippet to paste, and finishes
 *  with `llm-gate --list` so you see the new site reported UNTAGGED until the
 *  snippet lands. (The gate is static-only since 2026-08-05 — prove the new
 *  tool on demand with `npm run test:llm` once it exists.)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { callSiteSnippet, insertRegistryEntry, validToolId } from "./lib/llm-new-tool-core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(ROOT, "test-llm", "registry.mjs");

function arg(name) {
  const argv = process.argv.slice(2);
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}

function fail(msg) {
  console.error(`✗ llm:new: ${msg}`);
  process.exit(1);
}

const id = arg("id");
const label = arg("label");
const file = arg("file") ?? (id ? `src/lib/ai/tools/${id}.ts` : null);
const dryRun = process.argv.includes("--dry-run");

if (!id || !label) {
  fail('usage: npm run llm:new -- --id <a-z0-9-> --label "Popisek" [--file src/lib/ai/tools/<x>.ts] [--dry-run]');
}
if (!validToolId(id)) fail(`invalid id "${id}" — must match the tag grammar [a-z0-9-]`);
if (!/^src\/lib\/ai\/tools\/[\w-]+\.ts$/.test(file)) {
  fail(`--file must point into src/lib/ai/tools/ (got "${file}")`);
}

let registry;
try {
  registry = insertRegistryEntry(readFileSync(REGISTRY, "utf8"), { id, label });
} catch (e) {
  fail(e.message);
}

if (dryRun) {
  console.log(`— dry run: would register "${id}" (${label}) —\n`);
  console.log(`test-llm/registry.mjs   → new entry skeleton appended (edit the TODOs)`);
  console.log(`test-llm/golden/${id}.json → written by llm-eval --update`);
  console.log(`\nCall-site snippet for ${file}:\n\n${callSiteSnippet(id)}\n`);
  process.exit(0);
}

writeFileSync(REGISTRY, registry);
console.log(`✓ registry entry skeleton appended to test-llm/registry.mjs (edit the TODOs)`);

// Contract golden for the new entry — deterministic, no model call.
const evalRes = spawnSync(process.execPath, ["scripts/llm-eval.mjs", "--update"], {
  cwd: ROOT,
  stdio: "inherit",
});
if (evalRes.status !== 0) fail("llm-eval --update failed — golden not written");

console.log(`\nPaste into ${file} (the tag must sit within 2 lines of the wrapper call):\n`);
console.log(callSiteSnippet(id));
console.log(
  "\nNext steps:\n" +
    `  1. create ${file} with the snippet above (prompt builder, schema, demo fallback)\n` +
    "  2. edit the registry TODOs so the fixture mirrors the tool's real contract\n" +
    "  3. re-run `npm run llm:eval:update` if you touched system/schema after step 2\n" +
    "  4. record what it costs: `npm run llm:budget -- --accept --reason \"<new operation …>\"`\n" +
    "     (check:ci fails while a registered operation has no ceiling in test-llm/budget.json)\n" +
    "  5. prove it on demand: `npm run test:llm` (the pre-commit gate is static-only)\n"
);

// Show the coverage report: the new call site reads UNTAGGED until the snippet
// lands, which is exactly the reminder the fumbled manual ritual was missing.
spawnSync(process.execPath, ["scripts/llm-gate.mjs", "--list"], { cwd: ROOT, stdio: "inherit" });
