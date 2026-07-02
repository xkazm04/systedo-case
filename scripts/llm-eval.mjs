#!/usr/bin/env node
/** llm-eval — golden-snapshot contract eval for the LLM tool registry.
 *
 *  Sibling to the prove-once gate (scripts/llm-gate.mjs): where the gate proves a
 *  tool's *output* against a real model, this proves a tool's *contract* (system
 *  prompt + schema) against a committed golden snapshot — deterministically, with
 *  no model calls. A changed fingerprint = the prompt/schema drifted since the
 *  golden, which the gate's hash-cache would silently re-prove without flagging.
 *
 *    node scripts/llm-eval.mjs            report drift (advisory, exit 0)
 *    node scripts/llm-eval.mjs --update   (re)write goldens from the registry
 *    node scripts/llm-eval.mjs --strict   exit 1 if any tool has drifted
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LLM_TOOLS } from "../test-llm/registry.mjs";
import { fingerprint } from "./lib/fingerprint.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN_DIR = join(ROOT, "test-llm", "golden");

const args = new Set(process.argv.slice(2));
const UPDATE = args.has("--update");
const STRICT = args.has("--strict");

function goldenPath(id) {
  return join(GOLDEN_DIR, `${id}.json`);
}

function readGolden(id) {
  const p = goldenPath(id);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

function schemaKeys(schema) {
  const props = schema && schema.properties ? Object.keys(schema.properties).sort() : [];
  return props;
}

if (UPDATE) mkdirSync(GOLDEN_DIR, { recursive: true });

const rows = [];
let drift = 0;

for (const tool of LLM_TOOLS) {
  const promptHash = fingerprint(tool.system, tool.schema);
  const golden = readGolden(tool.id);
  const snapshot = { id: tool.id, label: tool.label, promptHash, schemaKeys: schemaKeys(tool.schema) };

  let status;
  if (!golden) status = UPDATE ? "written" : "NEW";
  else if (golden.promptHash !== promptHash) status = UPDATE ? "updated" : "DRIFT";
  else status = "ok";

  if (status === "NEW" || status === "DRIFT") drift++;
  if (UPDATE) writeFileSync(goldenPath(tool.id), JSON.stringify(snapshot, null, 2) + "\n");

  rows.push({ id: tool.id, status, promptHash, was: golden?.promptHash ?? "—" });
}

// Goldens with no matching registry entry (a removed tool) — surface as stale.
const known = new Set(LLM_TOOLS.map((t) => t.id));
if (existsSync(GOLDEN_DIR)) {
  for (const f of readdirSync(GOLDEN_DIR)) {
    const id = f.replace(/\.json$/, "");
    if (f.endsWith(".json") && !known.has(id)) rows.push({ id, status: "STALE", promptHash: "—", was: "—" });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nLLM contract eval — ${LLM_TOOLS.length} tool(s)${UPDATE ? " · goldens updated" : ""}\n`);
console.log(`  ${pad("tool", 16)}${pad("status", 10)}${pad("fingerprint", 18)}was`);
for (const r of rows) {
  console.log(`  ${pad(r.id, 16)}${pad(r.status, 10)}${pad(r.promptHash, 18)}${r.was}`);
}

if (!UPDATE && drift > 0) {
  console.log(`\n⚠ ${drift} tool(s) drifted from golden. Review, then run --update to accept.`);
  if (STRICT) process.exit(1);
} else if (!UPDATE) {
  console.log(`\n✓ all tool contracts match their golden snapshots.`);
}
