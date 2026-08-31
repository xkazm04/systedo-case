/** Every gate says what to do next — asserted, not hoped for.
 *
 *  `npm run check:ci` chains fifteen checks. Each states its finding; what a
 *  reader hitting one for the first time needs on top of that is the next
 *  command, and that used to be missing from most of them. scripts/gate-remedy.mjs
 *  is the one table that holds it, and these tests are what stop the table
 *  drifting away from the chain it describes:
 *
 *    • a stage added to check:ci with no entry is a gate that fails mutely again;
 *    • a remedy naming an npm script package.json does not define, or a file that
 *      no longer exists, is worse than no remedy — it sends a failing agent to a
 *      command that errors;
 *    • an entry whose script never calls printRemedy is a remedy nobody is shown;
 *    • and the cheapest-first ORDER is part of the contract: eleven
 *      zero-dependency checks run before `next build`, so a wrong change is
 *      refused in seconds instead of minutes.
 *
 *  This file runs inside `npm run test:unit`, which is inside `check:ci` — so
 *  breaking the table turns the gate red on the machine that broke it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAIN, remedyFor, printRemedy } from "../scripts/gate-remedy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts ?? {};

/** The stages `check:ci` actually runs, in order. */
const stages = [...(scripts["check:ci"] ?? "").matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);

test("every check:ci stage has a remedy entry", () => {
  assert.ok(stages.length >= 15, `check:ci runs ${stages.length} stages — did the chain get shortened?`);
  for (const stage of stages) {
    assert.ok(
      remedyFor(stage),
      `check:ci runs \`npm run ${stage}\`, and scripts/gate-remedy.mjs has no entry for it. A gate that ` +
        "fires without naming the next command is the failure mode this table exists to close — add the entry."
    );
  }
});

test("the table describes the chain that exists, in the order it runs", () => {
  assert.deepEqual(
    CHAIN.map((s) => s.stage),
    stages,
    "scripts/gate-remedy.mjs no longer lists the check:ci chain in order. `npm run gates` prints this table " +
      "as the chain's documentation, so an order it gets wrong is documentation that misleads."
  );
});

test("the cheap checks run before the build", () => {
  // The point of the ordering: a wrong change that trips a zero-dependency check
  // should cost seconds, not a `next build`.
  const firstSlow = CHAIN.findIndex((s) => s.cost !== "seconds");
  assert.ok(firstSlow > 0, "no zero-dependency check runs before the first slow one.");
  for (const entry of CHAIN.slice(firstSlow)) {
    assert.notEqual(
      entry.cost,
      "seconds",
      `\`${entry.stage}\` is a seconds-long check sitting after a minutes-long one. Move it up: the chain is ` +
        "ordered cheapest-first so a red arrives before the build does."
    );
  }
});

test("every remedy names commands that exist and files that exist", () => {
  for (const entry of CHAIN) {
    assert.ok(entry.next.length, `\`${entry.stage}\` has an empty \`next\` — that is the field that exists.`);
    for (const line of entry.next) {
      for (const m of line.matchAll(/npm run ([\w:-]+)/g)) {
        assert.ok(
          scripts[m[1]],
          `the remedy for \`${entry.stage}\` tells a failing reader to run \`npm run ${m[1]}\`, which ` +
            "package.json does not define."
        );
      }
    }
    if (entry.records) {
      assert.ok(
        existsSync(join(ROOT, entry.records)),
        `\`${entry.stage}\` says an exception is recorded in ${entry.records}, which does not exist.`
      );
    }
    if (entry.script) {
      assert.ok(existsSync(join(ROOT, entry.script)), `\`${entry.stage}\` names ${entry.script}, which does not exist.`);
    }
  }
});

test("the gate that owns a stage actually prints its remedy", () => {
  // A table nobody reads from is documentation, not a remedy. Each script with a
  // failure path of its own has to hand the stage back to printRemedy.
  for (const entry of CHAIN) {
    if (!entry.script) continue; // `check` and `test:unit` are composites, not one script
    const source = read(entry.script);
    assert.match(
      source,
      /printRemedy\(/,
      `${entry.script} does not call printRemedy(), so when \`${entry.stage}\` fails the reader still gets a ` +
        "finding with no next command."
    );
    assert.ok(
      source.includes(`printRemedy("${entry.stage}"`),
      `${entry.script} calls printRemedy() with a stage that is not \`${entry.stage}\` — a silent mismatch ` +
        "prints nothing at all (an unknown stage is a no-op by design)."
    );
  }
});

test("printRemedy is silent on an unknown stage rather than throwing", () => {
  // A gate must never fail to fail: a typo in the stage name costs the remedy,
  // not the exit code.
  assert.equal(remedyFor("no-such-gate"), null);
  assert.doesNotThrow(() => printRemedy("no-such-gate", () => {}));
});

test("printRemedy writes the command it promised", () => {
  const lines = [];
  printRemedy("contract:ledger:check", (s = "") => lines.push(s));
  const text = lines.join("\n");
  assert.match(text, /npm run contract:ledger/);
  assert.match(text, /\.github\/contract-ledger\.json/);
});
