#!/usr/bin/env node
/**
 * LLM wrapper pre-commit gate.
 *
 * 1. Lists every place the app uses the LLM wrapper and verifies each is tagged
 *    (`// llm-tool: <id>`) and has a registered test, and that provider access is
 *    confined to the wrapper. (Fast — runs every time.)
 * 2. Runs the real Claude wrapper test suite — but ONLY when the LLM-related code
 *    has changed since the last proven pass, and only for the AFFECTED tools:
 *    .llm-gate-cache.json (committed) stores a per-file content hash plus a
 *    per-tool proof, so a change attributable to specific tools (one tool's
 *    source file, or one tool's registry entry) re-proves just those tools via
 *    --test-name-pattern (~25 s each) instead of the full ~340 s suite. Any
 *    change to shared LLM code conservatively re-runs everything.
 *
 * Exit non-zero blocks the commit.
 *
 * Usage:  node scripts/llm-gate.mjs [--list] [--force] [--check]
 *
 *   --check   key-free freshness verification (for CI): run coverage +
 *             goldens, then exit 1 if the committed cache does not prove the
 *             current LLM code — WITHOUT ever spawning the model. Closes the
 *             loop against --no-verify commits, GitHub-web edits and merges
 *             that land LLM changes under a stale "proven" badge.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findCallSites, checkChokepoint } from "../test-llm/callsites.mjs";
import { LLM_TOOLS } from "../test-llm/registry.mjs";
import { toolEntryFingerprint } from "./lib/fingerprint.mjs";
import { planGateRun } from "./lib/gate-plan.mjs";

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
  // Shared by twin-reply, social and repurpose — a change here rewrites three prompts.
  "src/lib/ai/tools/voice.ts",
  // The analyst persona shared by analysis + chat (chat's live system prompt is
  // built from it). Untagged on purpose ⇒ a change here forces a full re-run,
  // so editing the persona re-proves BOTH tools, not just "analysis".
  "src/lib/ai/tools/persona.ts",
  // refineLines() rewrites the re-run prompt of ~16 tools (analysis, brief, ads,
  // article-draft, local-review-reply, monthly-recap, repurpose, twin-reply,
  // twin-style, cohort-diagnosis, keyword-clusters, comparison-outline,
  // lp-variant-ideas, lead-source-diagnosis, channel-research, onboarding-scan).
  // Untagged ⇒ a change here forces a full re-run.
  "src/lib/ai/tools/refine.ts",
  // social.ts + its dedicated route were never hash-tracked, so prompt/schema edits
  // shipped without the gate re-proving the tool. They are now.
  "src/lib/ai/tools/social.ts",
  "src/app/api/social/draft/route.ts",
  "src/lib/ai/tools/ads.ts",
  "src/lib/ai/tools/brief.ts",
  "src/lib/ai/tools/analysis.ts",
  "src/lib/ai/tools/monthly-recap.ts",
  "src/lib/ai/tools/campaign-eval.ts",
  "src/lib/ai/tools/twin-reply.ts",
  "src/lib/ai/tools/twin-style.ts",
  "src/lib/ai/tools/repurpose.ts",
  "src/lib/ai/tools/local-review-reply.ts",
  "src/lib/ai/tools/article-draft.ts",
  "src/lib/ai/tools/cohort-diagnosis.ts",
  "src/lib/ai/tools/keyword-clusters.ts",
  "src/lib/ai/tools/comparison-outline.ts",
  "src/lib/ai/tools/lp-variant-ideas.ts",
  "src/lib/ai/tools/lead-source-diagnosis.ts",
  "src/lib/ai/tools/channel-research.ts",
  "src/lib/ai/tools/onboarding-scan.ts",
  "src/lib/ai/tools/chat.ts",
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

// --- 1b) Contract goldens (always; deterministic, no model) ------------------
// Every tool's (system + schema) fingerprint must match its committed golden, so
// a prompt/schema change is a visible diff a reviewer must accept (`llm:eval:update`)
// rather than something the hash-cached real run would silently re-prove.
const evalRes = spawnSync(process.execPath, ["scripts/llm-eval.mjs", "--strict"], { stdio: "inherit" });
if (evalRes.status !== 0) {
  fail("LLM contract goldens drifted — review the change, then run `npm run llm:eval:update` to accept.");
}
console.log("");

// --- 2) Hash-gated real run (incremental, per-file + per-tool) ---------------

const REGISTRY_FILE = "test-llm/registry.mjs";
const ALL_TOOL_IDS = LLM_TOOLS.map((t) => t.id);

/** Normalize CRLF → LF before hashing so a file's hash reflects its LOGICAL
 *  content, not the checkout platform's line-ending behavior. Windows'
 *  core.autocrlf=true checks the same LF-stored git blob out as CRLF locally,
 *  while Linux CI checks it out as LF — without this, every hashed file would
 *  show as "changed" the moment the cache is verified cross-platform, with no
 *  actual code change. */
function readNormalized(p) {
  return existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n") : "[missing]";
}

function hashFile(f) {
  const p = join(ROOT, f);
  return createHash("sha256").update(readNormalized(p)).digest("hex");
}

/** Legacy (v1) aggregate digest — kept only so an existing proven cache written
 *  by the pre-incremental gate stays valid and migrates without a model run. */
function hashFilesAggregate(files) {
  const h = createHash("sha256");
  for (const f of files) {
    const p = join(ROOT, f);
    h.update(f + "\0");
    h.update(readNormalized(p));
    h.update("\0");
  }
  return h.digest("hex");
}

const currentFiles = Object.fromEntries(HASHED_FILES.map((f) => [f, hashFile(f)]));
const currentRegistry = Object.fromEntries(LLM_TOOLS.map((t) => [t.id, toolEntryFingerprint(t)]));

// Single-tool attribution: a hashed file whose only wrapper call sites are
// tagged `// llm-tool: <id>` re-proves exactly those ids when it changes.
const fileTools = {};
for (const t of tags) (fileTools[t.file] ??= []).push(t.id);

/** Normalize whatever is on disk to the v2 shape, or null when there is no
 *  usable proof. A v1 cache migrates for free iff its aggregate digest still
 *  matches the current code (the exact condition the old gate used to skip). */
function normalizeCache(raw) {
  if (!raw || raw.passed !== true) return null;
  if (raw.version === 2 && raw.files && raw.tools && raw.registry) return raw;
  if (raw.hash && raw.hash === hashFilesAggregate(HASHED_FILES)) {
    const provenTools = Array.isArray(raw.tools) ? raw.tools : ALL_TOOL_IDS;
    return {
      version: 2,
      passed: true,
      provenAt: raw.provenAt,
      files: { ...currentFiles },
      registry: { ...currentRegistry },
      tools: Object.fromEntries(provenTools.map((id) => [id, raw.provenAt])),
    };
  }
  return null;
}

function writeCache(next) {
  writeFileSync(CACHE, JSON.stringify(next, null, 2) + "\n");
}

/** Companion to the CI --check: a fresh proof must ship in the SAME commit as
 *  the code it proves. Pre-commit runs after `git add`, so without this the
 *  rewritten cache would land in the working tree, one commit behind.
 *  Best-effort — outside a git context it is a silent no-op. */
function stageCache() {
  try {
    const res = spawnSync("git", ["add", ".llm-gate-cache.json"], { cwd: ROOT, stdio: "ignore" });
    if (res.status === 0) console.log("  (.llm-gate-cache.json staged so the fresh proof ships with this commit.)");
  } catch {
    /* not a repo / git missing — the cache still updated on disk */
  }
}

const rawCache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : null;
const cache = normalizeCache(rawCache);

const changedFiles = cache ? HASHED_FILES.filter((f) => currentFiles[f] !== cache.files[f]) : HASHED_FILES;
const registryChangedTools = cache
  ? ALL_TOOL_IDS.filter((id) => cache.registry[id] !== undefined && cache.registry[id] !== currentRegistry[id])
  : [];
const unprovenTools = cache ? ALL_TOOL_IDS.filter((id) => !cache.tools[id]) : ALL_TOOL_IDS;
// A registry byte-change is "attributed" when at least one per-tool delta
// (changed fingerprint, new entry, removed entry) explains it; a change with no
// per-tool delta means shared helpers/comments moved → conservative full run.
const newRegistryTools = cache ? ALL_TOOL_IDS.filter((id) => cache.registry[id] === undefined) : [];
const removedRegistryTools = cache ? Object.keys(cache.registry).filter((id) => currentRegistry[id] === undefined) : [];
const registryUnattributed =
  changedFiles.includes(REGISTRY_FILE) &&
  registryChangedTools.length === 0 &&
  newRegistryTools.length === 0 &&
  removedRegistryTools.length === 0;

const plan = cache
  ? planGateRun({
      force: !args.has("--check") && args.has("--force"),
      changedFiles,
      fileTools,
      registryFile: REGISTRY_FILE,
      registryChangedTools,
      registryUnattributed,
      unprovenTools,
      allTools: ALL_TOOL_IDS,
    })
  : { mode: "full", tools: ALL_TOOL_IDS, reason: "no valid cached pass" };

// --- key-free freshness check (CI): never spawns the model -------------------
if (args.has("--check")) {
  if (plan.mode === "skip") {
    console.log("✓ LLM gate --check: the committed cache proves the current LLM code.");
    console.log(`  (proven ${cache.provenAt}; ${ALL_TOOL_IDS.length} tool(s) covered.)`);
    process.exit(0);
  }
  console.error("✗ LLM gate --check: the cached proof does NOT cover the current LLM code:");
  if (!cache) console.error("  • no valid cached pass (.llm-gate-cache.json missing, failed, or stale)");
  for (const f of changedFiles) console.error(`  • changed since the proof: ${f}`);
  for (const id of registryChangedTools) console.error(`  • registry entry drifted: ${id}`);
  for (const id of unprovenTools) console.error(`  • tool never proven: ${id}`);
  fail(
    "commit the cache written by a real gate run (node scripts/llm-gate.mjs) alongside the LLM change — a stale badge means the code was never proven."
  );
}

if (plan.mode === "skip") {
  console.log("✓ LLM tests already proven for the current code — skipping the real Claude run.");
  console.log(`  (proven ${cache.provenAt}; pass --force or change LLM code to re-run.)`);
  // Persist the v1 → v2 migration so future runs diff per file/tool.
  if (rawCache?.version !== 2) writeCache(cache);
  process.exit(0);
}

function runRealTests(toolIds) {
  const partial = toolIds.length < ALL_TOOL_IDS.length;
  const patternArgs = partial
    ? toolIds.flatMap((id) => ["--test-name-pattern", `· ${id} \\(`])
    : [];
  const res = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      // The wrapper graph reaches server-only-poisoned modules (telemetry →
      // firebase). The real tests ARE a server context, so resolve the
      // react-server condition like Next's server graph does.
      "--conditions",
      "react-server",
      "--import",
      "./test-llm/setup.mjs",
      ...patternArgs,
      "--test",
      "test-llm/real.test.mjs",
    ],
    {
      stdio: "inherit",
      // LLM_CAPTURE: every proving run refreshes the committed corpus of real
      // model outputs (test-llm/samples/) that the fast offline validator tests
      // replay — the expensive run doubles as the fixture harvest.
      env: { ...process.env, NODE_ENV: "development", LLM_CAPTURE: "1" },
    }
  );
  if (res.status !== 0) fail("real LLM wrapper tests FAILED — commit blocked.");
}

const now = new Date().toISOString();

if (plan.mode === "partial") {
  console.log(
    `LLM code changed — re-proving ${plan.tools.length}/${ALL_TOOL_IDS.length} affected tool(s): ${plan.tools.join(", ")}`
  );
  for (const r of plan.reasons ?? []) console.log(`  changed: ${r}`);
  console.log("This calls the model once per affected tool.\n");

  runRealTests(plan.tools);

  // Merge the partial pass into the cache: only the attributed files/tools move
  // forward; everything else keeps its existing proof.
  const next = {
    version: 2,
    passed: true,
    provenAt: now,
    files: {
      ...cache.files,
      ...Object.fromEntries(changedFiles.map((f) => [f, currentFiles[f]])),
    },
    registry: Object.fromEntries(
      ALL_TOOL_IDS.map((id) => [id, plan.tools.includes(id) ? currentRegistry[id] : (cache.registry[id] ?? currentRegistry[id])])
    ),
    tools: Object.fromEntries(
      ALL_TOOL_IDS.map((id) => [id, plan.tools.includes(id) ? now : cache.tools[id]])
    ),
  };
  writeCache(next);
  console.log(
    `\n✓ LLM gate: ${plan.tools.length} tool(s) re-proven and cached (the other ${ALL_TOOL_IDS.length - plan.tools.length} keep their proof).`
  );
  stageCache();
} else {
  console.log(`LLM code changed (${plan.reason}) — running the FULL real wrapper suite against Claude Code…`);
  console.log("This calls the model for every tool and may take a few minutes.\n");

  runRealTests(ALL_TOOL_IDS);

  writeCache({
    version: 2,
    passed: true,
    provenAt: now,
    files: currentFiles,
    registry: currentRegistry,
    tools: Object.fromEntries(ALL_TOOL_IDS.map((id) => [id, now])),
  });
  console.log("\n✓ LLM gate: passed and cached. Won't re-run until the LLM code changes.");
  stageCache();
}
