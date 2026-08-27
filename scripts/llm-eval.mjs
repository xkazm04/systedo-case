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
 *    node scripts/llm-eval.mjs --update --reason "why"   (re)write goldens
 *    node scripts/llm-eval.mjs --strict   exit 1 if any tool has drifted
 *
 *  --- Provenance -----------------------------------------------------------
 *  A golden that can be regenerated on demand answers "did this change?" but not
 *  "was the change intended?", and those are different questions. Re-baking a
 *  golden is exactly how a regression gets absorbed into the baseline: the diff
 *  in review is a hash and 200 lines of prompt, and the fact that a *behaviour*
 *  was traded away is nowhere on the page.
 *
 *  So --update refuses to run without a --reason, and every accepted change is
 *  appended to test-llm/golden/CHANGELOG.md as `tool | from | to | reason`. The
 *  check side then verifies that the ledger's newest entry for each tool matches
 *  the fingerprint actually committed. Editing a golden by hand, or accepting one
 *  without a reason, therefore fails the gate — the ledger is not documentation
 *  about the goldens, it is part of their contract.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LLM_TOOLS } from "../test-llm/registry.mjs";
import { fingerprint } from "./lib/fingerprint.mjs";
import { diffLines, formatDiff, sortKeysDeep } from "./lib/diff-lines.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN_DIR = join(ROOT, "test-llm", "golden");
const LEDGER = join(GOLDEN_DIR, "CHANGELOG.md");

const argv = process.argv.slice(2);
const args = new Set(argv);
const UPDATE = args.has("--update");
const STRICT = args.has("--strict");
const reasonIdx = argv.indexOf("--reason");
const REASON = reasonIdx !== -1 ? String(argv[reasonIdx + 1] ?? "").trim() : "";
/** A date the caller supplies, so the ledger entry is stamped by the person
 *  accepting the change rather than by whatever the runner's clock says. */
const dateIdx = argv.indexOf("--date");
const STAMP = dateIdx !== -1 ? String(argv[dateIdx + 1] ?? "").trim() : new Date().toISOString().slice(0, 10);

// A reason has to actually be one. "update", "fix", "wip" are the words people
// type to get past a prompt, and they carry no information into review.
const EMPTY_REASON = /^(update|updated|fix|fixed|wip|goldens?|refresh|rebake|n\/?a|-+)$/i;
if (UPDATE && (REASON.length < 15 || EMPTY_REASON.test(REASON))) {
  console.error(
    "\n✗ llm-eval --update needs a real --reason.\n\n" +
      '  node scripts/llm-eval.mjs --update --reason "chat: forbid inventing figures the grounding block does not contain"\n\n' +
      "  It is written into test-llm/golden/CHANGELOG.md next to the old and new\n" +
      "  fingerprints, and it is the only thing that distinguishes an intended\n" +
      "  behaviour change from a regression being absorbed into the baseline.\n"
  );
  process.exit(1);
}

/** The ledger's newest recorded fingerprint per tool. Rows are appended in
 *  chronological order, so the LAST row for a tool is the current claim. */
function readLedger() {
  const current = new Map();
  if (!existsSync(LEDGER)) return current;
  for (const line of readFileSync(LEDGER, "utf8").split(/\r?\n/)) {
    const m = /^\|\s*`?([a-z0-9-]+)`?\s*\|\s*`?([0-9a-f]{8,}|—)`?\s*\|\s*`?([0-9a-f]{8,})`?\s*\|/.exec(line);
    if (m) current.set(m[1], m[3]);
  }
  return current;
}

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
const drifted = [];
const accepted = [];
let drift = 0;

for (const tool of LLM_TOOLS) {
  const promptHash = fingerprint(tool.system, tool.schema);
  const golden = readGolden(tool.id);
  // The snapshot stores the full system text + key-sorted schema (not just
  // their fingerprint), so a drift failure can SHOW the reviewable change and
  // the golden file itself reads as a meaningful diff in code review.
  const snapshot = {
    id: tool.id,
    label: tool.label,
    promptHash,
    schemaKeys: schemaKeys(tool.schema),
    system: tool.system,
    schema: sortKeysDeep(tool.schema),
  };

  let status;
  if (!golden) status = UPDATE ? "written" : "NEW";
  else if (golden.promptHash !== promptHash) status = UPDATE ? "updated" : "DRIFT";
  else status = "ok";

  if (status === "NEW" || status === "DRIFT") drift++;
  if (status === "DRIFT") drifted.push({ tool, golden, snapshot });
  if (status === "written" || status === "updated") {
    accepted.push({ id: tool.id, from: golden?.promptHash ?? "—", to: promptHash });
  }
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

// --- drift detail: show WHAT changed, not just that fingerprints differ ------
for (const { tool, golden, snapshot } of drifted) {
  console.log(`\n── drift detail: ${tool.id} ${"─".repeat(Math.max(3, 40 - tool.id.length))}`);
  if (golden.system === undefined) {
    console.log("  (golden predates content snapshots — no stored text to diff; the change");
    console.log("   below is current-only. `npm run llm:eval:update` captures content.)");
    continue;
  }
  if (golden.system !== tool.system) {
    console.log("  system prompt:");
    console.log(formatDiff(diffLines(golden.system, tool.system)));
  }
  const oldKeys = golden.schemaKeys ?? [];
  const newKeys = snapshot.schemaKeys;
  const addedKeys = newKeys.filter((k) => !oldKeys.includes(k));
  const removedKeys = oldKeys.filter((k) => !newKeys.includes(k));
  if (addedKeys.length || removedKeys.length) {
    console.log(
      `  schema keys: ${[...addedKeys.map((k) => `+${k}`), ...removedKeys.map((k) => `-${k}`)].join(" ")}`
    );
  }
  const oldSchema = JSON.stringify(sortKeysDeep(golden.schema ?? null), null, 2);
  const newSchema = JSON.stringify(snapshot.schema, null, 2);
  if (golden.schema !== undefined && oldSchema !== newSchema) {
    console.log("  schema:");
    console.log(formatDiff(diffLines(oldSchema, newSchema)));
  }
}

// --- provenance ledger ------------------------------------------------------

if (UPDATE) {
  if (accepted.length === 0) {
    console.log("\n(no contract changed — nothing appended to the ledger)");
  } else {
    const entry =
      `\n## ${STAMP} — ${accepted.map((a) => a.id).join(", ")}\n\n` +
      `${REASON}\n\n` +
      "| tool | from | to |\n|---|---|---|\n" +
      accepted.map((a) => `| ${a.id} | ${a.from} | ${a.to} |`).join("\n") +
      "\n";
    appendFileSync(LEDGER, entry);
    console.log(`\n✓ ledger: ${accepted.length} entr(y/ies) appended to test-llm/golden/CHANGELOG.md — commit it with the goldens.`);
  }
}

if (!UPDATE) {
  // The ledger is checked even when nothing drifted: a golden edited by hand
  // matches the registry (that is how it was edited) and would otherwise pass.
  const ledger = readLedger();
  const unrecorded = [];
  for (const tool of LLM_TOOLS) {
    const golden = readGolden(tool.id);
    if (!golden) continue; // already reported as NEW above
    if (ledger.get(tool.id) !== golden.promptHash) {
      unrecorded.push(`${tool.id}: golden is ${golden.promptHash}, ledger says ${ledger.get(tool.id) ?? "(nothing)"}`);
    }
  }
  if (unrecorded.length) {
    console.log(`\n⚠ ${unrecorded.length} golden(s) with no matching ledger entry:`);
    for (const u of unrecorded) console.log(`  • ${u}`);
    console.log(
      "\n  A golden's current fingerprint must be the newest row for that tool in\n" +
        "  test-llm/golden/CHANGELOG.md. Re-accept it the supported way so the\n" +
        "  reason is recorded:\n" +
        '    npm run llm:eval:update -- --reason "what behaviour changed and why"'
    );
    if (STRICT) process.exit(1);
  }
}

if (!UPDATE && drift > 0) {
  console.log(`\n⚠ ${drift} tool(s) drifted from golden. Review the diff above, then run --update to accept.`);
  if (STRICT) process.exit(1);
} else if (!UPDATE) {
  console.log(`\n✓ all tool contracts match their golden snapshots, and every one is recorded in the ledger.`);
}
