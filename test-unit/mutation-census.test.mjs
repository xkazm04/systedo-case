/** The mutation catalogue still describes the tree — the blocking half of the
 *  sensitivity measure.
 *
 *  THE PROBLEM. `npm run mutation:drill` applies a wrong answer to a seam and
 *  reports whether the tests that claim it go red. It runs weekly, off the landing
 *  path, and it is the only thing in this repository that asks whether the suite
 *  would NOTICE. Which makes its quiet failure the expensive one: an anchor that
 *  no longer matches means a mutant that is never applied, and a mutant that is
 *  never applied cannot survive — so the drill keeps printing a score while
 *  measuring less and less of the tree. The census is the same shape as
 *  `npm run fences`: the inventory blocks on every build, the measurement itself
 *  runs on a schedule.
 *
 *  WHAT IS ASSERTED HERE. Only what committed data can decide: the catalogue's
 *  files exist, each anchor matches exactly once, each mutant actually changes
 *  something, the named tests exist and import the module they claim, and the
 *  drill is wired to a command and to the weekly job. Whether a mutant is KILLED
 *  is a measurement and belongs in the run the maintainer (or the schedule) paid
 *  for — this file never applies a mutant and never writes to the tree.
 *
 *  Rung: blocking (ADR-0007 — it passes today). Runs inside `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CANNOT_SEE, MUTANTS, unitTestFlags } from "../scripts/mutation-catalogue.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
/** Anchors are single-line and the checkout's line endings are not the catalogue's
 *  business, so both sides are normalised before anything is counted. */
const lf = (s) => s.replace(/\r\n/g, "\n");

test("every mutant is complete, and its id is its own", () => {
  assert.ok(MUTANTS.length >= 5, `the catalogue holds ${MUTANTS.length} mutant(s) — too few to be a measure.`);
  const files = new Set(MUTANTS.map((m) => m.file));
  assert.ok(
    files.size >= 3,
    `the catalogue covers ${files.size} file(s). A sensitivity measure over one module says something about ` +
      "that module, not about the suite."
  );
  const seen = new Set();
  for (const m of MUTANTS) {
    for (const key of ["id", "seam", "file", "find", "replace", "why", "killedBy"]) {
      assert.ok(m[key], `a mutant is missing \`${key}\` (${m.id ?? "unnamed"})`);
    }
    assert.ok(!seen.has(m.id), `two mutants are called \`${m.id}\``);
    seen.add(m.id);
    assert.ok(Array.isArray(m.tests) && m.tests.length, `${m.id}: names no test, so nothing could kill it.`);
    assert.notEqual(m.find, m.replace, `${m.id}: the mutant changes nothing — it would always be reported killed.`);
  }
});

test("every anchor still matches its file EXACTLY once", () => {
  // The failure this exists for: a seam moves, the anchor stops matching, and the
  // drill quietly stops applying that mutant. It cannot then survive, so the score
  // stays perfect while the measure shrinks.
  const problems = [];
  for (const m of MUTANTS) {
    if (!existsSync(join(ROOT, m.file))) {
      problems.push(`${m.id}: ${m.file} does not exist`);
      continue;
    }
    const src = lf(read(m.file));
    const hits = src.split(lf(m.find)).length - 1;
    if (hits !== 1) problems.push(`${m.id}: its anchor occurs ${hits} time(s) in ${m.file} (must be exactly 1)`);
    if (src.includes(lf(m.replace))) {
      problems.push(`${m.id}: the MUTATED line is already in ${m.file} — the drill would report a kill for the tree's own behaviour`);
    }
  }
  assert.deepEqual(
    problems,
    [],
    "the mutation catalogue no longer applies to the tree. Re-anchor it in scripts/mutation-catalogue.mjs, or " +
      "drop the mutant and say in the commit which seam is now unmeasured — never leave it pointing at nothing."
  );
});

test("every mutant's tests exist and actually import the module they claim", () => {
  // A mutant whose named tests never touch the seam is a mutant that survives for
  // an uninteresting reason. `src/lib/a/b.ts` is imported as `@/lib/a/b`.
  const problems = [];
  for (const m of MUTANTS) {
    const specifier = `@/${m.file.replace(/^src\//, "").replace(/\.tsx?$/, "")}`;
    for (const t of m.tests) {
      if (!t.startsWith("test-unit/")) problems.push(`${m.id}: ${t} is not a unit test`);
      if (!existsSync(join(ROOT, t))) {
        problems.push(`${m.id}: ${t} does not exist`);
        continue;
      }
      if (!read(t).includes(specifier)) {
        problems.push(`${m.id}: ${t} never imports ${specifier}, so it cannot be what kills this mutant`);
      }
    }
  }
  assert.deepEqual(problems, [], "a mutant names tests that cannot see it.");
});

test("the drill can still build the command that runs the suite", () => {
  // The drill runs the SAME node flags `test:unit` runs, parsed out of package.json
  // so a new loader flag arrives here for free. If that parse ever returns null the
  // drill refuses to run at all, which is a red weekly job and a mystery; this
  // turns it into a sentence on the build that broke it.
  const pkg = JSON.parse(read("package.json"));
  const flags = unitTestFlags(pkg.scripts?.["test:unit"]);
  assert.ok(
    flags && flags.length,
    "`test:unit` no longer starts with `node <flags> --test <glob>`, so scripts/mutation-drill.mjs can no " +
      "longer reproduce the suite's own command. Teach unitTestFlags the new shape."
  );
  assert.ok(
    flags.includes("--import") || flags.some((f) => f.startsWith("--import")),
    `the parsed flags (${flags.join(" ")}) do not load the module hooks, so the tests would not resolve \`@/\`.`
  );
});

test("the drill is wired to a command and to the weekly job", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(
    String(pkg.scripts?.["mutation:drill"] ?? ""),
    /scripts\/mutation-drill\.mjs/,
    "`npm run mutation:drill` no longer runs the drill. A measure nobody can invoke is not a measure."
  );
  const workflow = read(".github/workflows/revert-drill.yml");
  assert.match(
    workflow,
    /mutation-drill\.mjs/,
    "the weekly drill workflow no longer runs the mutation drill. It is the only thing that asks whether the " +
      "suite would notice a wrong answer, and on this repository's landing path nobody runs it by hand."
  );
});

test("the catalogue states what a green score does NOT cover", () => {
  // A sensitivity score with no honest limit next to it reads as a guarantee, and
  // the first person to quote it will quote the number, not the caveat.
  assert.ok(CANNOT_SEE.length >= 3, "CANNOT_SEE has been emptied — the score is now printed as a guarantee.");
});
