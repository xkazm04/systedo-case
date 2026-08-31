/** The commit-subject contract, asserted against the log that broke it.
 *
 *  scripts/commit-subject.mjs is the only definition of what a subject owes a
 *  reader, and rubric A5 (scripts/agent-review.mjs) is what refuses a push over
 *  it. Until now nothing pinned the rules themselves — so a family that slipped
 *  through was invisible until somebody read `git log` and noticed the same shape
 *  again, which is how these landed on master in the first place:
 *
 *      fix: Done. Here's what landed and what I couldn't do
 *      fix: Agent session exceeded 20 min and was stopped
 *      fix: Read AGENTS.md (canonical), CLAUDE.md, docs/adr/0007
 *      fix: Done. Three of four items closed; two skipped with reasons
 *
 *  Every one of those is a real subject from this repository's history and every
 *  one of them fails here. The second half of the file is the other direction and
 *  matters just as much: these rules refuse a REPORT, never a change, so a subject
 *  that merely contains "read" or a "3 of 4" tally has to stay legal. A rule that
 *  starts refusing real work is a rule people learn to bypass with --no-verify.
 *
 *  `npm run test:unit` is inside check:ci, so weakening a rule turns the suite red
 *  on the weakener's own machine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GUIDANCE, NARRATION_RULES, checkSubject, subjectOf } from "../scripts/commit-subject.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

/** The problems as rule ids, so a test names the rule it is protecting. */
const idsFor = (subject) => {
  const problems = checkSubject(subject);
  return problems.flatMap((p) => [...p.matchAll(/\[([a-z-]+)\]/g)].map((m) => m[1]));
};

// --- the subjects that actually landed ---------------------------------------

test("every narrating subject in this repository's history is refused", () => {
  const history = [
    "fix: Done. Here's what landed and what I couldn't do",
    "fix: Done. Here's what I found and changed",
    "fix: Agent session exceeded 20 min and was stopped",
    "fix: Read AGENTS.md (canonical), CLAUDE.md, docs/adr/0007",
    "fix: Done. Three of four items closed; two skipped with reasons",
  ];
  for (const subject of history) {
    assert.ok(
      checkSubject(subject).length > 0,
      `"${subject}" is a real subject from this log and the rules let it through. ` +
        "A5 is the whole enforcement — a family the rules do not name is a family that lands."
    );
  }
});

test("a subject that lists what the run READ is refused", () => {
  // The escapee: well-formed, one clause, no first person, no "Done" — and it
  // names no artefact the commit touched, only three documents the agent opened.
  assert.ok(idsFor("fix: Read AGENTS.md (canonical), CLAUDE.md, docs/adr/0007").includes("consulted-documents"));
  assert.ok(idsFor("chore: reviewed the store seam, the ADRs and the runbooks").includes("consulted-documents"));
});

test("a subject that scores the run is refused", () => {
  assert.ok(idsFor("fix: closed three of four items, skipped the rest").includes("item-tally"));
  assert.ok(idsFor("chore: 2 of 6 findings fixed").includes("item-tally"));
});

test("a semicolon is the same second sentence as a full stop", () => {
  const problems = checkSubject("fix(ci): pin the workflow actions; raise the ratchet");
  assert.ok(
    problems.some((p) => p.includes("semicolon")),
    "a report line reaches for a semicolon exactly where a subject would have stopped, and the full-stop " +
      "rule never sees it."
  );
});

// --- the other direction: these rules must not refuse a change ----------------

test("a subject that names a change stays legal, including the near misses", () => {
  const good = [
    "feat(kampane): add portfolio budget-shift recommendation",
    "fix(llm): keep the demo fallback deterministic without a provider",
    "chore(ci): move the actions supply-chain policy into check:ci",
    // `read` as a verb of the CODE, not of the run — no list follows it.
    "fix(feed): read the merchant token from the path",
    // A tally about the code rather than about the run's own scoreboard.
    "perf(app): cut 3 of 4 duplicate Firestore reads per request",
    // "session" as a domain noun (auth sessions), not as loop mechanics.
    "fix(auth): keep the session cookie on the apex domain",
    "refactor(store): move the tenant key into one builder",
  ];
  for (const subject of good) {
    assert.deepEqual(
      checkSubject(subject),
      [],
      `"${subject}" describes a change and the rules refused it. A rule that fires on real work is a rule ` +
        "people learn to bypass."
    );
  }
});

test("git's own subjects are exempt — it writes those, not an agent", () => {
  for (const subject of [
    'Revert "feat(kampane): add portfolio budget-shift recommendation"',
    "Merge branch 'master' into feature",
    "fixup! feat(kampane): add portfolio budget-shift recommendation",
  ]) {
    assert.deepEqual(checkSubject(subject), [], `${subject} is written by git and must not be rewritten.`);
  }
});

// --- the shape of the contract itself ----------------------------------------

test("a message file's subject is its first non-comment line", () => {
  assert.equal(subjectOf("# comment\n\nfeat(x): add the thing\n\nbody\n"), "feat(x): add the thing");
  assert.equal(subjectOf(""), "");
});

test("every rule says what to do instead, and the guidance answers the stopped run", () => {
  for (const rule of NARRATION_RULES) {
    assert.match(rule.id, /^[a-z][a-z-]*$/, "a rule id is printed in the failure and read by a person.");
    assert.ok(rule.say.length > 40, `${rule.id} has to name the fix, not the rule.`);
  }
  // The question every one of these subjects is an answer to: what does a run
  // stopped by its wall clock owe the log? The repository's answer is a
  // checkpoint, and the failure message is where it gets read.
  assert.ok(
    GUIDANCE.some((l) => l.includes("checkpoint")),
    "the guidance under a failure must say where a stopped run's state goes instead — otherwise the next " +
      "agent reaches for `wip:` and the rule has only moved the problem."
  );
});

test("A5 is wired to these rules and nothing else re-implements them", () => {
  assert.match(
    read("scripts/agent-review.mjs"),
    /from "\.\/commit-subject\.mjs"/,
    "rubric A5 must import the rules rather than carry a second copy of them."
  );
  assert.match(read("scripts/commit-check.mjs"), /from "\.\/commit-subject\.mjs"/);
});
