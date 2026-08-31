#!/usr/bin/env node
/**
 * LLM wrapper pre-commit gate — STATIC checks only (fast, key-free, every time):
 *
 * 1. Lists every place the app uses the LLM wrapper and verifies each is tagged
 *    (`// llm-tool: <id>`) and has a registered test, provider access is confined
 *    to the wrapper, and every call site has a BYOM-matrix row.
 * 2. Contract goldens: every tool's (system + schema) fingerprint must match its
 *    committed golden (`npm run llm:eval:update` to accept a deliberate change).
 *
 * The real-model proving run that used to hash-gate commits was retired
 * 2026-08-05 — at ~25 s × tool per touched shared file it was too expensive to
 * keep on the commit path long-term. Proving is now on-demand only:
 *
 *   npm run test:llm        # one real Claude call per tool (LLM_CAPTURE=1
 *                           # refreshes test-llm/samples/ for the offline tests)
 *   npm run llm:quality     # the judged model-comparison benchmark
 *
 * Exit non-zero blocks the commit.
 *
 * Usage:  node scripts/llm-gate.mjs [--list] [--check]
 *   --check is kept for CI compatibility and runs the same static checks.
 */
import { spawnSync } from "node:child_process";
import { findCallSites, checkChokepoint, checkByomOperations } from "../test-llm/callsites.mjs";
import { LLM_TOOLS } from "../test-llm/registry.mjs";
import { printRemedy } from "./gate-remedy.mjs";

const args = new Set(process.argv.slice(2));

function fail(msg) {
  console.error(`\n✗ LLM gate: ${msg}`);
  printRemedy("llm:gate:check");
  process.exit(1);
}

// --- 1) Coverage (always) ---------------------------------------------------

const { callSites, tags } = findCallSites();

console.log("LLM wrapper call sites (generateStructured):");
for (const c of callSites) {
  const tag = tags.find((t) => t.file === c.file && Math.abs(t.line - c.line) <= 2);
  console.log(`  • ${c.file}:${c.line}  →  ${tag ? `llm-tool: ${tag.id}` : "UNTAGGED"}`);
}
console.log("");

if (args.has("--list")) process.exit(0);

let coverageOk = true;
if (callSites.length !== tags.length) {
  console.error(`  ✗ ${callSites.length} call site(s) but ${tags.length} // llm-tool tag(s)`);
  coverageOk = false;
}
const registered = new Set(LLM_TOOLS.map((t) => t.id));
for (const tag of tags) {
  if (!registered.has(tag.id)) {
    console.error(`  ✗ ${tag.file}:${tag.line} tagged "${tag.id}" has no registry entry (= no test)`);
    coverageOk = false;
  }
}
const taggedIds = new Set(tags.map((t) => t.id));
for (const tool of LLM_TOOLS) {
  if (!taggedIds.has(tool.id)) {
    console.error(`  ✗ registry tool "${tool.id}" has no call site in src`);
    coverageOk = false;
  }
}
const violations = checkChokepoint();
for (const v of violations) console.error(`  ✗ chokepoint: ${v}`);
if (violations.length) coverageOk = false;

// Every wrapper call site must also be assignable in the BYOM matrix — an operation
// with no row can't be pinned by a paying subscriber and silently rides the global
// active vendor. Documented exclusions live in test-llm/callsites.mjs.
const byomDrift = checkByomOperations();
for (const v of byomDrift) console.error(`  ✗ byom matrix: ${v}`);
if (byomDrift.length) coverageOk = false;

if (!coverageOk) fail("coverage check failed — every wrapper call site needs a tag + registered test.");
console.log(`✓ coverage: ${callSites.length} call site(s), all tagged & registered; chokepoint clean.\n`);

// --- 2) Contract goldens (always; deterministic, no model) -------------------
// Every tool's (system + schema) fingerprint must match its committed golden, so
// a prompt/schema change is a visible diff a reviewer must accept (`llm:eval:update`).
const evalRes = spawnSync(process.execPath, ["scripts/llm-eval.mjs", "--strict"], { stdio: "inherit" });
if (evalRes.status !== 0) {
  fail("LLM contract goldens drifted — review the change, then run `npm run llm:eval:update` to accept.");
}

console.log("\n✓ LLM gate: static checks passed (real-model proving is on-demand: npm run test:llm).");
