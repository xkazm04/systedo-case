/** The decision trailer, held to the records it cites.
 *
 *  The log is filterable by SHAPE (conventional prefixes) and by ORIGIN (the
 *  authorship and provenance trailers). Twelve ADRs and a twelve-rule rubric govern
 *  the seams and nothing recorded the third fact — which of them a commit was acting
 *  on — so "which changes were actually made under ADR-0001?" and "which commits
 *  fixed a finding rubric A6 raised?" were answered by reading prose bodies.
 *
 *  Two rungs (docs/adr/0007-gate-rung-discipline.md), and the split is the design:
 *
 *    BLOCKING   a `Decision:` that does not RESOLVE. A citation to a record this
 *               repository does not have is read with confidence, which makes it
 *               worse than no citation. Refused by .husky/commit-msg while the
 *               message can still be edited, and by `commit:check -- --range` on
 *               history. It passes today by construction, which is the rung a new
 *               check earns.
 *    REPORTING  coverage. Most commits act on no recorded decision and should carry
 *               nothing — a log where every commit cites ADR-0007 says less than one
 *               where none does.
 *
 *  Pure — reads files, runs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADR_DIR,
  RUBRIC,
  citesDecision,
  decisionProblems,
  decisionsOf,
  knownDecisions,
  normalizeDecision,
} from "../scripts/commit-decision.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const known = knownDecisions();

test("what may be cited is read out of the tree, not listed in a file that rots", () => {
  assert.ok(existsSync(join(ROOT, ADR_DIR)), `${ADR_DIR} is gone, so nothing can be cited.`);
  assert.ok(
    known.adrs.size >= 10,
    `only ${known.adrs.size} decision record(s) were found in ${ADR_DIR}. The reader derives them from the ` +
      "filenames, so a naming change here silently empties the set of things a commit may cite."
  );
  assert.ok(known.adrs.has("ADR-0001"), "ADR-0001 (the dual-store seam) is not citable — the derivation broke.");
  assert.ok(known.adrs.has("ADR-0007"), "ADR-0007 (gate rung discipline) is not citable — the derivation broke.");
  assert.ok(
    known.rules.size >= 6,
    `only ${known.rules.size} rubric rule(s) were found in ${RUBRIC}. The headings are the source; a reformat ` +
      "that changes them takes the whole set with it."
  );
  assert.ok(known.rules.has("rubric-A5"), "rubric-A5 (the commit-subject rule) is not citable.");
});

test("the trailer is parsed the way git writes it — repeated, or comma-separated", () => {
  const message = [
    "fix(store): dedupe the tenant read",
    "",
    "Body text mentioning ADR-0001 in prose, which is not a citation.",
    "",
    "Co-Authored-By: Claude <noreply@anthropic.com>",
    "Decision: ADR-0001",
    "Decision: rubric-A6, ADR-0007",
  ].join("\n");
  assert.deepEqual(decisionsOf(message), ["ADR-0001", "rubric-A6", "ADR-0007"]);
  assert.deepEqual(decisionsOf("fix: no trailer here\n\nADR-0001 in the body only."), []);
  assert.ok(citesDecision(message, "adr-1"), "the reverse query does not recognise a record written another way.");
  assert.ok(!citesDecision(message, "ADR-0002"), "the reverse query matched a decision the commit does not cite.");
});

test("a citation that does not resolve is a finding — this is the half that blocks", () => {
  assert.deepEqual(decisionProblems(["ADR-0001", "rubric-A6"], known), []);
  assert.equal(decisionProblems(["ADR-0013"], known).length, 1, "a record this repository does not have resolved.");
  assert.equal(decisionProblems(["rubric-A9"], known).length, 1, "a rubric rule that does not exist resolved.");
  assert.equal(decisionProblems(["because the tests were slow"], known).length, 1, "free prose passed as a citation.");
  assert.deepEqual(decisionProblems([], known), [], "a commit citing nothing is the common and correct case.");
  assert.match(
    decisionProblems(["ADR-0013"], known)[0],
    /ADR-0001/,
    "the failure does not say what may be cited instead, which is the only thing the author needs."
  );
});

test("the same reference written three ways is one reference", () => {
  assert.equal(normalizeDecision("adr-1"), "ADR-0001");
  assert.equal(normalizeDecision("ADR 0007"), "ADR-0007");
  assert.equal(normalizeDecision("ADR-0012"), "ADR-0012");
  assert.equal(normalizeDecision("rubric-a6"), "rubric-A6");
  // Anything it cannot place comes back unchanged, so it fails loudly rather than
  // being coerced into a citation nobody made.
  assert.equal(normalizeDecision("whatever"), "whatever");
});

test("the checker is wired where a commit actually meets it", () => {
  const check = read("scripts/commit-check.mjs");
  assert.match(
    check,
    /commit-decision\.mjs/,
    "scripts/commit-check.mjs no longer reads the decision rules, so `.husky/commit-msg` — which runs it — stops " +
      "refusing a citation that does not resolve."
  );
  assert.match(
    check,
    /--decisions/,
    "there is no way to ask what may be cited. A convention with no reader is one nobody follows."
  );
  const hooks = read("scripts/install-commit-hooks.mjs");
  assert.match(
    hooks,
    /node scripts\/commit-check\.mjs "\$1"/,
    "the commit-msg hook no longer runs commit-check.mjs, so nothing validates a citation at the moment it is " +
      "still free to change."
  );
  assert.match(
    read("AGENTS.md"),
    /Decision:/,
    "AGENTS.md no longer describes the `Decision:` trailer. A trailer nobody is told to write is one nobody writes."
  );
});
