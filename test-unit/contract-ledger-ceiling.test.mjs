/** The ceiling on an exception list, proven by running it.
 *
 *  This repository's fences are drawn narrow on purpose, and each one names its
 *  exceptions: `.github/security/sast-allowlist.json` lists the files a security
 *  rule fires on and is right about anyway, and eslint.config.mjs lists the names
 *  that cross the LLM chokepoint. That is the correct shape. What it lacked was a
 *  ceiling — an exception list that grows one entry per inconvenient diff erodes
 *  its fence without a build ever going red, and an agent under time pressure adds
 *  an entry as readily as it fixes the cause (AGENTS.md § amber).
 *
 *  `scripts/contract-ledger.mjs --check` is that ceiling, and this file is the
 *  proof it bites. Two of these tests SPAWN the real script, because a gate nobody
 *  has watched fail is a gate nobody knows is wired: one run over the real tree
 *  (must be green — the ceilings are today's counts, ADR-0007), one over a fixture
 *  whose ceiling has been lowered under the tree (must be red, and must say which
 *  list and by how much).
 *
 *  `npm run test:unit` is inside check:ci, so disarming the ceiling turns the suite
 *  red on the disarmer's own machine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const SCRIPT = join(ROOT, "scripts", "contract-ledger.mjs");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts ?? {};
const ledger = JSON.parse(read(".github/contract-ledger.json"));

/** Run the real script against a ledger of our choosing. */
const run = (ledgerPath) =>
  spawnSync(process.execPath, [SCRIPT, "--check", ...(ledgerPath ? ["--ledger", ledgerPath] : [])], {
    cwd: ROOT,
    encoding: "utf8",
  });

/** The real ledger, with one edit, written somewhere the tree does not see. */
function fixture(name, mutate) {
  const copy = JSON.parse(read(".github/contract-ledger.json"));
  mutate(copy);
  const dir = mkdtempSync(join(tmpdir(), "contract-ledger-"));
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify(copy, null, 2) + "\n");
  return path;
}

const rowOf = (obj, id) => (obj.rules ?? []).find((r) => r.id === id);

// --- the gate runs, and it is green on this tree ------------------------------

test("the ledger check passes on the tree as it stands", () => {
  const res = run(null);
  assert.equal(
    res.status,
    0,
    `\`npm run contract:ledger:check\` is red on this tree:\n\n${res.stdout}\n${res.stderr}\n\n` +
      "Every ceiling is set to what its list held on the day it landed, so a red run here means a list grew " +
      "(fix the cause, or raise the ceiling in this commit with the reason) or a rule was renamed without its row."
  );
});

// --- and it goes red when a list outgrows its ceiling -------------------------

test("a list over its ceiling fails the build, and the failure names it", () => {
  // The tree's route-auth allowlist holds five entries. Pretending the ceiling was
  // 0 is the same arithmetic as adding a sixth entry to a ceiling of 5.
  const path = fixture("grown", (l) => {
    rowOf(l, "route-auth").ceiling.max = 0;
  });
  const res = run(path);
  assert.equal(res.status, 1, "an exception list past its ceiling has to fail, or the ceiling is decoration.");
  const output = `${res.stdout}${res.stderr}`;
  assert.match(output, /route-auth/);
  assert.match(output, /over the ceiling/);
});

test("an exception list with no ceiling at all fails too", () => {
  // The case that matters for a NEW fence: it must not be possible to land one
  // whose exception list nothing caps.
  const path = fixture("uncapped", (l) => {
    delete rowOf(l, "sql-template-interpolation").ceiling;
  });
  const res = run(path);
  assert.equal(res.status, 1);
  assert.match(`${res.stdout}${res.stderr}`, /declares no `ceiling`/);
});

test("a ceiling that allows exceptions must say what would take them away", () => {
  const path = fixture("no-exit", (l) => {
    delete rowOf(l, "plaintext-key-in-route").ceiling.comesOffWhen;
  });
  const res = run(path);
  assert.equal(res.status, 1);
  assert.match(
    `${res.stdout}${res.stderr}`,
    /comesOffWhen/,
    "an exemption with no removal condition is permanent by default, which is how exception lists become " +
      "furniture."
  );
});

// --- every exception list in the ledger is actually capped --------------------

test("every row that measures an exception list carries a reasoned ceiling", () => {
  const capped = (ledger.rules ?? []).filter((r) => ["allowlist", "exemptions"].includes(r.measure?.kind));
  assert.ok(capped.length >= 14, `expected the sast allowlists and the lint fences to be measured, got ${capped.length}.`);
  for (const row of capped) {
    assert.ok(row.ceiling, `${row.id}: an exception list with no ceiling.`);
    assert.equal(typeof row.ceiling.max, "number", `${row.id}: the ceiling needs a number.`);
    assert.ok(String(row.ceiling.reason ?? "").length > 40, `${row.id}: the ceiling needs a reason, not a number.`);
    if (row.ceiling.max > 0) {
      assert.ok(
        String(row.ceiling.comesOffWhen ?? "").length > 20,
        `${row.id}: ${row.ceiling.max} exception(s) allowed and no condition under which they come off.`
      );
    }
  }
});

// --- the wiring, without which none of the above runs -------------------------

test("the ledger check is a stage of check:ci", () => {
  assert.ok(scripts["contract:ledger"], "package.json has no `contract:ledger` script.");
  assert.ok(scripts["contract:ledger:check"], "package.json has no `contract:ledger:check` script.");
  assert.ok(
    (scripts["check:ci"] ?? "").includes("npm run contract:ledger:check"),
    "`check:ci` no longer runs the ledger check. On this repo's landing path (direct push to master) check:ci " +
      "is what .husky/pre-push proves before the release act — a ceiling outside it caps nothing."
  );
});
