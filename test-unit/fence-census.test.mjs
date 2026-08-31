/** Which fences have ever fired — the recording, and the inventory that keeps the
 *  census from quietly going incomplete.
 *
 *  Every rule in `.github/contract-ledger.json` blocks, and until this landed not
 *  one of them recorded ever having blocked anything: the ledger's own `$breaches`
 *  note says every `breaches` array is empty, because the only thing that could
 *  fill one was a `--record` pass somebody had to run by hand. So a fence that has
 *  caught eleven real problems and a fence that has never caught anything looked
 *  identical, and both were inherited rather than argued about.
 *
 *  Two rungs, the same split .github/workflows/agent-review-history.yml already
 *  uses for the rubric's Part A rules (docs/adr/0007-gate-rung-discipline.md):
 *
 *    REPORTING — `npm run fences` prints the table. It reads a rolling trail, so
 *      there is nothing in it a change can break and nothing it should fail a
 *      build over.
 *    BLOCKING  — this file. The INVENTORY has to stay complete, because a census
 *      that silently stops covering a fence is worse than none: it reads as
 *      evidence that the fence is quiet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCensus, exceptionFileFor } from "../scripts/fence-census.mjs";
import { readFirings, recordFiring, recordingEnabled, summarise } from "../scripts/fence-firings.mjs";
import { CHAIN, printRemedy } from "../scripts/gate-remedy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const LEDGER = JSON.parse(read(".github/contract-ledger.json"));

// --- the recording ------------------------------------------------------------

test("a firing is written as one parseable row, and reads back", () => {
  const path = join(mkdtempSync(join(tmpdir(), "fence-firings-")), "trail.jsonl");
  const env = { GITHUB_ACTIONS: "" };
  assert.equal(recordFiring("sast", { detail: "two findings" }, { path, env }), true);
  assert.equal(recordFiring("actions:check", {}, { path, env }), true);

  const rows = readFirings(path);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].fence, "sast");
  assert.equal(rows[0].detail, "two findings");
  assert.equal(rows[0].where, "local");
  assert.match(rows[0].at, /^\d{4}-\d{2}-\d{2}T/);
});

test("a torn line does not take the rest of the trail down with it", () => {
  // This is an append-only log written by processes that were already failing.
  const dir = mkdtempSync(join(tmpdir(), "fence-firings-"));
  const path = join(dir, "trail.jsonl");
  const env = { GITHUB_ACTIONS: "" };
  recordFiring("sast", {}, { path, env });
  // Simulate a half-written row by appending directly.
  appendFileSync(path, '{"fence":"tor\n');
  recordFiring("merge-gate", {}, { path, env });
  assert.deepEqual(
    readFirings(path).map((r) => r.fence),
    ["sast", "merge-gate"]
  );
});

test("a fixture run is not a firing", () => {
  // Several tests run a gate against a deliberately red fixture to prove it CAN go
  // red. Those must not land in the trail as evidence about this tree.
  assert.equal(recordingEnabled({ NODE_TEST_CONTEXT: "test" }), false);
  assert.equal(recordingEnabled({ FENCE_FIRINGS: "off" }), false);
  assert.equal(recordingEnabled({ FENCE_FIRINGS: "OFF" }), false);
  assert.equal(recordingEnabled({}), true);
  // …and this test file is itself running under node:test, so the real recorder is
  // a no-op here, which is the guard working rather than the test cheating.
  assert.equal(recordFiring("sast"), false);
});

test("summarising counts CI and local separately", () => {
  const rows = [
    { fence: "sast", at: "2026-08-01T00:00:00.000Z", where: "ci" },
    { fence: "sast", at: "2026-08-30T00:00:00.000Z", where: "local" },
    { fence: "merge-gate", at: "2026-08-02T00:00:00.000Z", where: "ci" },
  ];
  const by = summarise(rows);
  assert.equal(by.sast.count, 2);
  assert.equal(by.sast.ci, 1);
  assert.equal(by.sast.local, 1);
  assert.equal(by.sast.last, "2026-08-30T00:00:00.000Z", "`last` must be the newest, not the last written.");
});

// --- the wiring: every gate records on its way out ----------------------------

test("printRemedy is where a gate's firing is recorded, and a lookup is not a firing", () => {
  const source = read("scripts/gate-remedy.mjs");
  assert.match(
    source,
    /recordFiring\(entry\.stage\)/,
    "printRemedy no longer records the firing — every gate calls it on the way out when it goes red, and it " +
      "is the only place in the chain that knows a fence fired."
  );
  assert.match(source, /record = true/, "the `record` option is gone; `npm run gates -- --stage` would count as a firing.");
  // And it still prints: the recording must never displace the remedy.
  const printed = [];
  printRemedy(CHAIN[0].stage, (s = "") => printed.push(s), { record: false });
  assert.ok(printed.join("\n").includes("what to do next"), "printRemedy stopped printing its remedy.");
});

test("the SAST rules record which rule caught it, not just that the gate went red", () => {
  const source = read("scripts/sast.mjs");
  assert.match(source, /recordFiring\(/, "scripts/sast.mjs no longer records its firings.");
  assert.match(
    source,
    /new Set\(blocking\.map\(\(f\) => f\.rule\.id\)\)/,
    "SAST must record the RULE id — `sast went red` is not the question anybody has of ten rules."
  );
});

// --- the inventory, which is the half that blocks ------------------------------

test("the census covers every rule the contract ledger declares", () => {
  const rows = buildCensus({ ledger: LEDGER, chain: CHAIN, firings: [], touched: () => null });
  const ids = new Set(rows.map((r) => r.id));
  const missing = (LEDGER.rules ?? []).map((r) => r.id).filter((id) => !ids.has(id));
  assert.deepEqual(
    missing,
    [],
    `the census cannot see ${missing.join(", ")}. A fence outside the count reads as a fence that is quiet, ` +
      "which is the exact wrong conclusion."
  );
});

test("the census covers every stage of the check:ci chain", () => {
  const rows = buildCensus({ ledger: LEDGER, chain: CHAIN, firings: [], touched: () => null });
  const ids = new Set(rows.map((r) => r.id));
  const ledgerIds = new Set((LEDGER.rules ?? []).map((r) => r.id));
  for (const stage of CHAIN) {
    assert.ok(
      ids.has(stage.stage) || ledgerIds.has(stage.stage),
      `\`${stage.stage}\` is in check:ci but not in the fence census — every change pays for that stage and ` +
        "nothing would say whether it has ever caught anything."
    );
  }
});

test("a fence that recorded under a name nothing declares is surfaced, not dropped", () => {
  // A rename nobody propagated. Silently discarding the rows would make the census
  // quietly incomplete, which is the failure mode it exists to prevent.
  const rows = buildCensus({
    ledger: { rules: [] },
    chain: [],
    firings: [{ fence: "a-fence-that-was-renamed", at: "2026-08-30T00:00:00.000Z", where: "ci" }],
    touched: () => null,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "unknown");
  assert.equal(rows[0].recorded, 1);
});

test("a rule's exception list is located from the ledger's own `measure`, not from a second list", () => {
  assert.equal(exceptionFileFor({ measure: { kind: "allowlist", rule: "route-auth" } }), ".github/security/sast-allowlist.json");
  assert.equal(
    exceptionFileFor({ measure: { kind: "exemptions", file: "eslint.config.mjs", block: "adamant/seams" } }),
    "eslint.config.mjs"
  );
  assert.equal(exceptionFileFor({}), null, "a rule with no exception list has nothing to widen.");
});

test("a hand-folded ledger breach counts the same as a recorded firing", () => {
  const rows = buildCensus({
    ledger: { rules: [{ id: "route-auth", source: "sast", breaches: [{ at: "2026-07-01" }] }] },
    chain: [],
    firings: [{ fence: "route-auth", at: "2026-08-30T00:00:00.000Z", where: "ci" }],
    touched: () => null,
  });
  assert.equal(rows[0].recorded, 2, "both are evidence this rule caught something.");
});

// --- the report is reachable and published -------------------------------------

test("`npm run fences` exists and the weekly trail publishes it", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.fences, "node scripts/fence-census.mjs");
  assert.match(
    read(".github/workflows/agent-review-history.yml"),
    /fence-census\.mjs/,
    "the census is not published anywhere. A table only a maintainer can produce on demand is the state " +
      "this was meant to leave — the rubric's own history is published weekly for exactly that reason."
  );
});

test("the trail is git-ignored, for the reason the timings are", () => {
  assert.match(read(".gitignore"), /^\/\.fence-firings\.jsonl$/m);
});
