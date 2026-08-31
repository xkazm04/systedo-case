#!/usr/bin/env node
/** Would the suite NOTICE? — mutation drill over the seams that cost money
 *  (zero-dependency).
 *
 *  WHY THIS EXISTS. There are 479 test files here and a healthy test-to-source
 *  ratio, and both numbers answer a question nobody was asking: how much code the
 *  suite EXECUTES. The question that matters on a repository where master ships on
 *  push and almost every commit is agent-written is whether a subtly WRONG change
 *  would be caught — and a test that runs, asserts something vacuous and passes
 *  forever scores exactly the same on coverage as one that pins the behaviour.
 *
 *  `scripts/revert-drill.mjs` answers a NEIGHBOURING question — how long does one
 *  seeded fault survive the gate layers, and does taking it back out restore the
 *  tree — with three seeds on one file, one of them per week. This one answers the
 *  sensitivity question directly: every mutant in `scripts/mutation-catalogue.mjs`
 *  is applied, ONLY the tests that claim that seam are run, and the score is how
 *  many of them the suite killed. A survivor is the finding — a wrong answer the
 *  suite calls green.
 *
 *  HONEST LIMITS. A killed mutant proves the suite notices THAT wrong answer, not
 *  every one; the catalogue's CANNOT_SEE list is printed with every run and is
 *  part of the result, not a footnote.
 *
 *  RUNG: reporting (docs/adr/0007-gate-rung-discipline.md). It runs test files
 *  repeatedly, so it never sits in `check:ci` or the pre-push hook, and it is
 *  deliberately absent from .github/required-checks.json. It runs weekly next to
 *  the revert drill (.github/workflows/revert-drill.yml). What DOES block, on
 *  every build, is the catalogue's shape: test-unit/mutation-census.test.mjs fails
 *  when a mutant's anchor no longer matches its file exactly once, or names a test
 *  that is gone — because a catalogue that no longer applies is a drill that
 *  measures nothing while still printing a score.
 *
 *  RESTORE is the same contract as the revert drill: every mutant is taken back
 *  out in a `finally` and the file compared byte-for-byte with what was read
 *  before it was applied. A drill that dies with a mutant on disk has left the
 *  tree worse than it found it.
 *
 *  Usage:
 *    npm run mutation:drill                 # apply every mutant, print the score
 *    npm run mutation:drill -- --list       # the catalogue
 *    npm run mutation:drill -- --mutant ceiling-off-by-one
 *    npm run mutation:drill -- --out m.json --report m.md --summary "$GITHUB_STEP_SUMMARY"
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CANNOT_SEE, MUTANTS, unitTestFlags } from "./mutation-catalogue.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const OUT = arg("--out");
const REPORT = arg("--report");
const SUMMARY = arg("--summary");

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

if (argv.includes("--list")) {
  console.log("Mutation-drill catalogue (scripts/mutation-catalogue.mjs):\n");
  for (const m of MUTANTS) {
    console.log(`  ${m.id}`);
    console.log(`    seam:      ${m.seam}`);
    console.log(`    file:      ${m.file}`);
    console.log(`    tests:     ${m.tests.join(", ")}`);
    console.log(`    why:       ${m.why}`);
    console.log(`    killed by: ${m.killedBy}`);
    console.log("");
  }
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const FLAGS = unitTestFlags(pkg.scripts?.["test:unit"]);
if (!FLAGS) {
  console.error("✗ mutation-drill: could not read the node flags out of the `test:unit` script in package.json.");
  console.error("  The drill runs the same suite the repository runs; it will not invent a command.");
  process.exit(1);
}

/** 64 MB for the same reason revert-drill uses it: a truncated child exits
 *  non-zero, and a buffer limit must never be able to look like a kill. */
const runOpts = { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };

function runTests(tests) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [...FLAGS, "--test", ...tests], runOpts);
  const seconds = (Date.now() - started) / 1000;
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  if (res.error) return { broken: res.error.message, red: false, seconds, output };
  return { broken: null, red: res.status !== 0, seconds, output };
}

const selected = (() => {
  const named = arg("--mutant");
  if (!named) return MUTANTS;
  const found = MUTANTS.find((m) => m.id === named);
  if (!found) {
    console.error(`mutation-drill: no mutant called "${named}". Known: ${MUTANTS.map((m) => m.id).join(", ")}`);
    process.exit(1);
  }
  return [found];
})();

say(`Mutation drill — ${selected.length} mutant(s) over ${new Set(selected.map((m) => m.file)).size} seam file(s)`);
say("");

// The baseline, before anything is mutated. A test file that is ALREADY red would
// be reported below as having killed the mutant — the one way this drill could lie,
// and it would lie in the reassuring direction. Each distinct test set is proven
// green once.
const baselines = new Set();
for (const m of selected) {
  const key = m.tests.join(" ");
  if (baselines.has(key)) continue;
  const { broken, red, seconds, output } = runTests(m.tests);
  if (broken) {
    console.error(`✗ mutation-drill: could not run ${key} — ${broken}`);
    process.exit(1);
  }
  baselines.add(key);
  say(`  ${red ? "RED " : "green"}  ${key}  ${seconds.toFixed(1)}s  (baseline, unmutated)`);
  if (!red) continue;
  console.error("");
  console.error(`✗ mutation-drill: ${key} is already red on the unmutated tree.`);
  console.error("  Every mutant would score as killed. Fix the tree, then run the drill. Its last lines:");
  console.error("");
  for (const line of output.trim().split(/\r?\n/).slice(-12)) console.error(`    ${line}`);
  process.exit(1);
}
say("");

const verdict = {
  ranAt: new Date().toISOString(),
  total: selected.length,
  killed: 0,
  survived: 0,
  restored: true,
  mutants: [],
};

for (const m of selected) {
  const target = join(ROOT, m.file);
  let original;
  try {
    original = readFileSync(target, "utf8");
  } catch (err) {
    console.error(`✗ mutation-drill: cannot read ${m.file} — ${err.message}`);
    console.error("  The catalogue names a file that has moved (test-unit/mutation-census.test.mjs says so too).");
    process.exit(1);
  }

  const occurrences = original.split(m.find).length - 1;
  if (occurrences !== 1) {
    console.error("");
    console.error(`✗ mutation-drill: the "${m.id}" mutant no longer applies to ${m.file}.`);
    console.error(`  Its anchor occurs ${occurrences} time(s); a mutant must match exactly once or it would edit`);
    console.error("  something nobody chose. Re-anchor it in scripts/mutation-catalogue.mjs, or drop it and say");
    console.error("  in the commit which seam is now unmeasured.");
    console.error("");
    console.error(`  anchor: ${m.find}`);
    process.exit(1);
  }

  let row = { id: m.id, seam: m.seam, file: m.file, killed: false, seconds: 0 };
  try {
    writeFileSync(target, original.split(m.find).join(m.replace));
    const { broken, red, seconds, output } = runTests(m.tests);
    if (broken) {
      console.error(`✗ mutation-drill: could not run ${m.tests.join(" ")} — ${broken}`);
      process.exit(1);
    }
    row = { ...row, killed: red, seconds: Number(seconds.toFixed(1)) };
    if (!red) row.output = output.trim().split(/\r?\n/).slice(-6).join("\n");
  } finally {
    // A drill that dies with a mutant on disk has left the tree worse than it
    // found it — the one thing a rehearsal must never do.
    try {
      writeFileSync(target, original);
      if (readFileSync(target, "utf8") !== original) verdict.restored = false;
    } catch (err) {
      verdict.restored = false;
      console.error(`mutation-drill: could not restore ${m.file} — ${err.message}`);
    }
  }

  verdict.mutants.push(row);
  if (row.killed) verdict.killed++;
  else verdict.survived++;
  say(`  ${row.killed ? "killed  " : "SURVIVED"}  ${m.id.padEnd(30)} ${row.seconds.toFixed(1)}s  ${m.file}`);
}

say("");
say(`  score: ${verdict.killed} of ${verdict.total} mutants killed`);
say(`  tree:  ${verdict.restored ? "restored byte-for-byte" : "**NOT RESTORED — check the files above**"}`);
say("");
say("| Date | Mutants | Killed | Survived | Restored |");
say("| --- | --- | --- | --- | --- |");
say(
  `| ${verdict.ranAt.slice(0, 10)} | ${verdict.total} | ${verdict.killed} | ` +
    `${verdict.survived ? `**${verdict.survived}**` : "0"} | ${verdict.restored ? "yes" : "**no**"} |`
);
say("");
for (const line of CANNOT_SEE) say(`  · a green score does not cover: ${line}`);

if (OUT) {
  try {
    writeFileSync(OUT, `${JSON.stringify(verdict, null, 2)}\n`);
  } catch (err) {
    console.error(`(mutation-drill: could not write ${OUT} — ${err.message})`);
  }
}
if (REPORT) {
  // The dated record, in the form the trail issue publishes. Not committed: master
  // ships on push, so a commit from a scheduled job would be a release.
  try {
    writeFileSync(
      REPORT,
      ["## Mutation drill — would the suite notice?", "", `_Run ${verdict.ranAt}._`, "", ...out, ""].join("\n")
    );
  } catch (err) {
    console.error(`(mutation-drill: could not write ${REPORT} — ${err.message})`);
  }
}
if (SUMMARY) {
  try {
    appendFileSync(SUMMARY, `### Mutation drill\n\n${out.join("\n")}\n`);
  } catch (err) {
    console.error(`(mutation-drill: could not write the summary — ${err.message})`);
  }
}

if (verdict.survived) {
  const survivors = verdict.mutants.filter((m) => !m.killed);
  console.error("");
  console.error(`✗ mutation-drill: ${survivors.length} mutant(s) survived — the suite calls a wrong answer green.`);
  for (const s of survivors) console.error(`  • ${s.id} on ${s.file} (${s.seam})`);
  console.error("");
  console.error("  That is the drill's FINDING, not its bug. Write the missing assertion — and do NOT weaken the");
  console.error("  mutant or delete it to go green: the mutant is the behaviour, the missing test is the gap.");
  console.error("");
  process.exit(1);
}
if (!verdict.restored) process.exit(2);
say("");
say(`✓ mutation drill: every one of the ${verdict.total} wrong answers was caught by the tests that claim its seam.`);
process.exit(0);
