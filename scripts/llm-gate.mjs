#!/usr/bin/env node
/**
 * LLM wrapper pre-commit gate.
 *
 * 1. Lists every place the app uses the LLM wrapper and verifies each is tagged
 *    (`// llm-tool: <id>`) and has a registered test, and that provider access is
 *    confined to the wrapper. (Fast — runs every time.)
 * 2. Runs the real Claude wrapper test suite — but ONLY when the LLM-related code
 *    has changed since the last proven pass. A pass is recorded in
 *    .llm-gate-cache.json (committed), keyed by a content hash, so once green the
 *    slow model calls are NOT repeated until something relevant changes.
 *
 * Exit non-zero blocks the commit.
 *
 * Usage:  node scripts/llm-gate.mjs [--list] [--force]
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findCallSites, checkChokepoint } from "../test-llm/callsites.mjs";
import { LLM_TOOLS } from "../test-llm/registry.mjs";

const ROOT = process.cwd();
const CACHE = join(ROOT, ".llm-gate-cache.json");
const args = new Set(process.argv.slice(2));

// Files whose change should force a re-prove of the real tests.
const HASHED_FILES = [
  "src/lib/llm/index.ts",
  "src/lib/llm/claude.ts",
  "src/lib/llm/gemini.ts",
  "src/lib/llm/models.ts",
  "src/lib/ai/tools/_shared.ts",
  "src/lib/ai/tools/ads.ts",
  "src/lib/ai/tools/brief.ts",
  "src/lib/ai/tools/analysis.ts",
  "src/lib/ai/tools/campaign-eval.ts",
  "src/lib/ai/tools/lead-reply.ts",
  "src/lib/ai/tools/repurpose.ts",
  "src/lib/ai/tools/local-review-reply.ts",
  "src/lib/ai/tools/article-draft.ts",
  "src/lib/ai/tools/cohort-diagnosis.ts",
  "src/lib/ai/tools/keyword-clusters.ts",
  "src/lib/ai/tools/comparison-outline.ts",
  "src/lib/ai/tools/lp-variant-ideas.ts",
  "src/app/api/ai/route.ts",
  "src/app/api/campaigns/analyze/route.ts",
  "test-llm/registry.mjs",
  "test-llm/real.test.mjs",
  "test-llm/setup.mjs",
  "test-llm/resolve-hooks.mjs",
];

function fail(msg) {
  console.error(`\n✗ LLM gate: ${msg}`);
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

if (!coverageOk) fail("coverage check failed — every wrapper call site needs a tag + registered test.");
console.log(`✓ coverage: ${callSites.length} call site(s), all tagged & registered; chokepoint clean.\n`);

// --- 2) Hash-gated real run -------------------------------------------------

function hashFiles(files) {
  const h = createHash("sha256");
  for (const f of files) {
    const p = join(ROOT, f);
    h.update(f + "\0");
    h.update(existsSync(p) ? readFileSync(p) : Buffer.from("[missing]"));
    h.update("\0");
  }
  return h.digest("hex");
}

const hash = hashFiles(HASHED_FILES);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : null;

if (!args.has("--force") && cache?.passed && cache.hash === hash) {
  console.log("✓ LLM tests already proven for the current code — skipping the real Claude run.");
  console.log(`  (proven ${cache.provenAt}; pass --force or change LLM code to re-run.)`);
  process.exit(0);
}

console.log("LLM code changed (or no cached pass) — running real wrapper tests against Claude Code…");
console.log("This calls the model and may take a minute.\n");

const res = spawnSync(
  process.execPath,
  [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--import",
    "./test-llm/setup.mjs",
    "--test",
    "test-llm/real.test.mjs",
  ],
  { stdio: "inherit", env: { ...process.env, NODE_ENV: "development" } }
);

if (res.status !== 0) fail("real LLM wrapper tests FAILED — commit blocked.");

writeFileSync(
  CACHE,
  JSON.stringify(
    { hash, passed: true, provenAt: new Date().toISOString(), tools: LLM_TOOLS.map((t) => t.id) },
    null,
    2
  ) + "\n"
);
console.log("\n✓ LLM gate: passed and cached. Won't re-run until the LLM code changes.");
