/** A red test names the CONTRACT that broke, not only the value that differed.
 *
 *  The suite here is large, behavioural and mutation-tested, so WHAT it verifies is
 *  not in doubt. What a failure SAYS is the next rung. An agent reading
 *
 *      AssertionError: Expected values to be strictly equal: true !== false
 *
 *  has to reconstruct the intent from the test's name and the file's header, and a
 *  reader who reconstructs a contract is a reader who can talk themselves into
 *  weakening the assertion instead of fixing the seam. `eslint.config.mjs` already
 *  makes the opposite move for lint refusals — it names the seam, the reason and the
 *  way out — and `scripts/gate-remedy.mjs` makes it for every gate. This is the same
 *  move for the assertions that protect a money or breach seam.
 *
 *  WHAT BLOCKS HERE (blocking rung, ADR-0007 — it passes today):
 *
 *    • every rule id a failure message cites is one .github/constraint-map.json
 *      really carries, so a citation cannot rot into a rule nobody wrote;
 *    • every seam the mutation catalogue calls a money-or-breach seam either cites
 *      its rule or is named below with the reason it cannot yet — an exception list
 *      with a ceiling, the same shape as every other one here;
 *    • the message a reader actually sees carries the rule, its rung, where it is
 *      stated and the route to the record that decided it, and every path in it
 *      exists;
 *    • and the helper REFUSES an unknown id, so the check that keeps the citations
 *      honest is itself proved to still detect.
 *
 *  Pure — reads files, runs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MUTANTS } from "../scripts/mutation-catalogue.mjs";
import { CONSTRAINT_MAP_REL, ROUTE_REL, constraintIds, contract, contractBlock } from "./contract.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SUITE_DIR = join(ROOT, "test-unit");

/** Every rule id passed to the helper anywhere in the suite. Derived from the
 *  text rather than from a list, so it cannot go stale as suites adopt it. */
function citedIds() {
  const ids = new Set();
  for (const name of readdirSync(SUITE_DIR)) {
    if (!name.endsWith(".test.mjs")) continue;
    const text = readFileSync(join(SUITE_DIR, name), "utf8");
    for (const m of text.matchAll(/\bcontract\(\s*"([^"]+)"\s*\)/g)) ids.add(m[1]);
  }
  return [...ids];
}

/** Money-or-breach seams that do NOT cite a rule yet, with the reason. This is an
 *  exception list, so it has a ceiling (below) and it may only shrink: the way off
 *  it is a row in the constraint map, not a deletion from this object. */
const NO_RULE_YET = {
  "test-unit/durable-limit-core.test.mjs":
    "the global daily spend ceiling and the per-IP durable window are stated in AGENTS.md § Architecture " +
    "(rail 7) and have no row in .github/constraint-map.json, so there is no rule id to cite. Citing an " +
    "adjacent rule would be worse than citing none — a wrong citation reads as evidence. The way off this " +
    "list is a `spend-ceiling` row in the map and its line in the AGENTS.md table, in one diff.",
};

/** What the list holds today. Raising it is the two-line diff every pin here is:
 *  the entry, and the number that pays for it. */
const NO_RULE_YET_CEILING = 1;

test("every rule id a failure message cites is one the constraint map carries", () => {
  const cited = citedIds();
  assert.ok(
    cited.length > 0,
    "no suite cites a rule id any more. The helper is still here and nothing uses it, which means a failure " +
      "has gone back to reporting that a value differed. test-unit/contract.mjs"
  );
  const known = new Set(constraintIds());
  for (const id of cited) {
    assert.ok(
      known.has(id),
      `a failure message cites the rule "${id}", which ${CONSTRAINT_MAP_REL} does not carry. Either the rule ` +
        "was renamed and the citation should follow it, or a test is telling a reader about a contract that " +
        "does not exist."
    );
  }
});

test("every money-or-breach seam the mutation catalogue names says which rule broke", () => {
  const seamFiles = [...new Set(MUTANTS.flatMap((m) => m.tests ?? []))];
  assert.ok(seamFiles.length > 0, "the mutation catalogue names no seam suites — MUTANTS has lost its `tests`.");

  const excused = [];
  for (const rel of seamFiles) {
    const abs = join(ROOT, rel);
    assert.ok(existsSync(abs), `the mutation catalogue names ${rel}, which does not exist.`);
    if (readFileSync(abs, "utf8").includes('from "./contract.mjs"')) continue;
    excused.push(rel);
    assert.ok(
      NO_RULE_YET[rel],
      `${rel} guards a seam where a wrong answer is a bill or a breach, and its failures name only the values ` +
        "that differed. Import `contract` from ./contract.mjs and cite the rule, or record here why it cannot " +
        "be cited yet."
    );
  }

  for (const rel of Object.keys(NO_RULE_YET)) {
    assert.ok(
      seamFiles.includes(rel),
      `${rel} is excused here and the mutation catalogue no longer names it. An excuse for a file nobody is ` +
        "measuring is an exception that outlived its reason."
    );
  }
  assert.ok(
    excused.length <= NO_RULE_YET_CEILING,
    `${excused.length} money-or-breach suites cite no rule, ceiling ${NO_RULE_YET_CEILING}. This list may only ` +
      "shrink — fix the finding (a row in the constraint map) rather than widening what is allowed through."
  );
});

test("the message a reader sees carries the rule, its rung, where it is stated and the route", () => {
  for (const id of citedIds()) {
    const block = contractBlock(id);
    assert.ok(block.includes(id), `the message for "${id}" does not name the rule id.`);
    assert.ok(block.includes(ROUTE_REL), `the message for "${id}" does not route to ${ROUTE_REL}.`);
    assert.ok(block.includes(CONSTRAINT_MAP_REL), `the message for "${id}" does not name ${CONSTRAINT_MAP_REL}.`);

    const stated = /\n {2}stated: +(\S+)/.exec(block);
    assert.ok(stated, `the message for "${id}" does not say where the rule is stated.`);
    assert.ok(
      existsSync(join(ROOT, stated[1])),
      `the message for "${id}" sends a reader to ${stated[1]}, which does not exist. A citation to a moved ` +
        "document costs the reader the minutes the message was supposed to save."
    );
  }
});

test("an unknown rule id is refused rather than rendered as a plausible citation", () => {
  // Assembled rather than written out: a literal call-with-a-string-argument in
  // this file would be picked up as a real citation by the scan above.
  const nobodysRule = ["a", "rule", "nobody", "wrote"].join("-");
  assert.throws(
    () => contract(nobodysRule),
    /has no rule with that id/,
    "the helper accepted a rule id the constraint map does not carry. A message that cites a rule nobody " +
      "wrote is worse than a bare equality failure: it is confidently wrong, and it survives review."
  );
});
