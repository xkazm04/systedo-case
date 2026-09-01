/** The flake register still describes the suite — the blocking half of the
 *  nondeterminism measure.
 *
 *  THE PROBLEM. `npm run test:unit` is a blocking stage of `check:ci`, which
 *  `.husky/pre-push` runs before the push that ships master, and nothing in this
 *  repository has ever asked whether those 482 test files agree with themselves. A
 *  gate that fails one run in twenty is not a gate for long: the person waiting on
 *  it learns to press the button again, and after that a real red is
 *  indistinguishable from the noise. Nothing goes red for that, nothing gets
 *  softened, and the fence simply stops being read.
 *
 *  `npm run flake:drill` is the measurement and it runs weekly, off the landing
 *  path, because it runs the whole suite several times over. Which makes its quiet
 *  failure the expensive one — the same shape as the mutation catalogue's: a drill
 *  that can no longer build the suite's command, or a register naming tests that
 *  are gone, keeps printing a clean verdict while measuring nothing.
 *
 *  WHAT IS ASSERTED HERE. Only what committed data can decide: the register parses
 *  and every entry is complete, the tests it names exist, the drill can still
 *  reproduce the suite's own command out of package.json, and the drill is wired to
 *  a command and to the weekly job. Whether a test IS flaky is a measurement and
 *  belongs to the run that paid for it — this file never runs the suite.
 *
 *  Rung: blocking (ADR-0007 — it passes today). Runs inside `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { unitTestFlags } from "../scripts/mutation-catalogue.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const REGISTER_REL = ".github/flaky-tests.json";
const pkg = JSON.parse(read("package.json"));

test("the register exists and parses — an unreadable one hands the next run nothing", () => {
  assert.ok(existsSync(join(ROOT, REGISTER_REL)), `${REGISTER_REL} is missing; the drill refuses to run without it.`);
  const register = JSON.parse(read(REGISTER_REL));
  assert.ok(Array.isArray(register.quarantined), "`quarantined` must be an array, even when it is empty.");
});

test("every quarantined test is named, explained, and has a decision behind it", () => {
  // The whole point of the register is that a flake becomes a sentence somebody
  // wrote. An entry with a test name and nothing else is a skip list with a longer
  // filename.
  const register = JSON.parse(read(REGISTER_REL));
  const seen = new Set();
  for (const q of register.quarantined) {
    for (const key of ["test", "file", "why", "firstSeen", "plan"]) {
      assert.ok(
        typeof q[key] === "string" && q[key].trim(),
        `${q.test ?? "(unnamed)"}: a quarantine entry needs \`${key}\`. Without it, nobody in six months can ` +
          "tell an accepted flake from a test somebody gave up on."
      );
    }
    assert.ok(!seen.has(q.test), `two entries quarantine \`${q.test}\``);
    seen.add(q.test);
    assert.match(
      q.firstSeen,
      /^\d{4}-\d{2}-\d{2}$/,
      `${q.test}: \`firstSeen\` must be a date — an entry with no age cannot be asked how long it has sat here.`
    );
    assert.ok(
      q.why.length > 30,
      `${q.test}: "${q.why}" does not say what is nondeterministic about it. The cause is nearly always a ` +
        "shared temp file, the clock, or an assumption about the order node ran the files in — name it."
    );
  }
});

test("a quarantined test is a test that still exists", () => {
  // The failure this catches: a test is renamed or deleted and its quarantine
  // survives, so the register describes a suite that is no longer there and the
  // ceiling paying for it is buying nothing.
  const register = JSON.parse(read(REGISTER_REL));
  for (const q of register.quarantined) {
    assert.ok(
      q.file.startsWith("test-unit/") || q.file.startsWith("tests/"),
      `${q.test}: \`${q.file}\` is not a test file in this repository.`
    );
    assert.ok(
      existsSync(join(ROOT, q.file)),
      `${q.test}: ${q.file} does not exist. Take the entry off the register (and lower its ceiling in ` +
        ".github/contract-ledger.json in the same diff)."
    );
  }
});

test("the register's length is capped by the contract ledger, like every other exception list", () => {
  // A list of tests nobody trusts is the most expensive exception list in the
  // repository, because test:unit is what stands between a change and master.
  const ledger = JSON.parse(read(".github/contract-ledger.json"));
  const row = (ledger.rules ?? []).find((r) => r.measure?.file === REGISTER_REL);
  assert.ok(
    row,
    `no rule in .github/contract-ledger.json measures ${REGISTER_REL}. An uncapped quarantine register grows ` +
      "one line per inconvenient week and never turns a build red."
  );
  assert.equal(typeof row.ceiling?.max, "number", `${row.id}: the register's ceiling needs a number.`);
  const register = JSON.parse(read(REGISTER_REL));
  assert.ok(
    register.quarantined.length <= row.ceiling.max,
    `${register.quarantined.length} quarantined test(s) against a ceiling of ${row.ceiling.max}. ` +
      "`npm run contract:ledger:check` fails on the same build — raise the ceiling in the diff that adds the " +
      "entry, with the reason."
  );
});

test("the drill can still build the command that runs the suite", () => {
  // The drill runs the SAME node flags and the SAME target `test:unit` runs, parsed
  // out of package.json so a new loader flag arrives there for free. If that parse
  // ever returns nothing the drill refuses to run at all, which is a red weekly job
  // and a mystery; this turns it into a sentence on the build that broke it.
  const script = String(pkg.scripts?.["test:unit"] ?? "");
  const flags = unitTestFlags(script);
  assert.ok(
    flags && flags.length,
    "`test:unit` no longer starts with `node <flags> --test <glob>`, so scripts/flake-drill.mjs can no longer " +
      "reproduce the suite's own command. Teach unitTestFlags the new shape."
  );
  const target = (script.split(/\s--test\s/)[1] ?? "").trim();
  assert.ok(
    target,
    "`test:unit` names no target after `--test`, so the drill would run an empty suite and report it clean."
  );
});

test("the drill is wired to a command and to the weekly job", () => {
  assert.match(
    String(pkg.scripts?.["flake:drill"] ?? ""),
    /scripts\/flake-drill\.mjs/,
    "`npm run flake:drill` no longer runs the drill. A measure nobody can invoke is not a measure."
  );
  const workflow = ".github/workflows/flake-watch.yml";
  assert.ok(existsSync(join(ROOT, workflow)), `${workflow} is gone, so nothing measures flakiness on a schedule.`);
  assert.match(
    read(workflow),
    /flake-drill\.mjs/,
    "the weekly workflow no longer runs the drill. On this repository's landing path nobody runs it by hand, " +
      "which is how the suite went 482 files without anyone asking whether it agrees with itself."
  );
});

test("the drill is NOT in check:ci — it runs the suite several times over", () => {
  // Rung discipline (ADR-0007), asserted rather than trusted: a measure this
  // expensive on the pre-push path would be a gate people learn to skip, which is
  // the same failure the drill exists to prevent, one level up.
  assert.doesNotMatch(
    String(pkg.scripts?.["check:ci"] ?? ""),
    /flake:drill/,
    "the flake drill has been added to check:ci. It runs the whole unit suite several times — putting it on " +
      "the pre-push path trades a rare flaky red for a certain slow one."
  );
});
