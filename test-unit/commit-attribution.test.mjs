/** Machine-readable authorship on an agent's commit.
 *
 *  ~97% of the commits in this repository are agent-written and five of the last
 *  thirty said so, which makes "how much of this landed unattended, and by what?"
 *  a question nobody can answer without reading prose bodies and guessing. A
 *  trailer is the form `git log --format=%(trailers)` and
 *  `git shortlog --group=trailer:co-authored-by` can count.
 *
 *  Rung (docs/adr/0007-gate-rung-discipline.md): REPORTING. It does not pass over
 *  history, so `npm run commit:check -- --range` prints coverage and never decides
 *  the exit code, and scripts/agent-review.mjs puts the unattributed commits of a
 *  change in its report rather than blocking on them. What blocks is rubric A5,
 *  which is about what a subject SAYS — a different question with a different
 *  answer. The automatic half is a hook (see the one-liners at the top of
 *  scripts/commit-check.mjs); this file tests the rules the hook applies.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATTRIBUTION_TRAILERS,
  agentIdentity,
  hasAttribution,
  trailerFor,
  withAttribution,
} from "../scripts/commit-attribution.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

// --- what counts as attribution ----------------------------------------------

test("the trailers git and GitHub already understand are the ones that count", () => {
  assert.ok(ATTRIBUTION_TRAILERS.includes("Co-Authored-By"));
  for (const trailer of ATTRIBUTION_TRAILERS) {
    assert.ok(hasAttribution(`feat(x): a change\n\n${trailer}: Someone <a@b.c>`), `${trailer} is not recognised.`);
  }
});

test("a body that merely mentions an assistant is not attribution", () => {
  assert.equal(hasAttribution("fix(x): a change\n\nWritten with the help of an assistant."), false);
  assert.equal(hasAttribution("fix(x): a change"), false);
  assert.equal(hasAttribution(""), false);
});

test("a trailer with no value does not count", () => {
  assert.equal(hasAttribution("fix(x): a change\n\nCo-Authored-By:"), false);
});

// --- who is writing ----------------------------------------------------------

test("a person's environment produces no identity, so their commit claims nothing", () => {
  assert.equal(agentIdentity({}), null);
  assert.equal(agentIdentity({ PATH: "/usr/bin", HOME: "/home/someone" }), null);
  assert.equal(agentIdentity({ CLAUDECODE: "" }), null, "an empty variable is not a session.");
});

test("an agent session is recognised, and an explicit identity wins", () => {
  assert.deepEqual(agentIdentity({ CLAUDECODE: "1" }), { name: "Claude", email: "noreply@anthropic.com" });
  assert.deepEqual(agentIdentity({ CLAUDE_SESSION_ID: "abc" }), { name: "Claude", email: "noreply@anthropic.com" });
  assert.deepEqual(agentIdentity({ AI_AGENT: "1" }), { name: "AI agent", email: "noreply@anthropic.com" });
  assert.deepEqual(agentIdentity({ COMMIT_ATTRIBUTION: "Ascent lane <lane@example.invalid>" }), {
    name: "Ascent lane",
    email: "lane@example.invalid",
  });
});

// --- adding it ---------------------------------------------------------------

test("the trailer goes at the end, below a blank line, where git looks for one", () => {
  const identity = { name: "Claude", email: "noreply@anthropic.com" };
  const out = withAttribution("fix(llm): keep the demo fallback deterministic\n\nSome body.\n", identity);
  const lines = out.trimEnd().split("\n");
  assert.equal(lines.at(-1), trailerFor(identity));
  assert.equal(lines.at(-2), "", "a trailer glued to the body is not a trailer.");
  assert.equal(lines[0], "fix(llm): keep the demo fallback deterministic", "the subject must not move.");
});

test("adding it twice adds it once", () => {
  const identity = { name: "Claude", email: "noreply@anthropic.com" };
  const once = withAttribution("fix(x): a change\n", identity);
  assert.equal(withAttribution(once, identity), once);
});

test("a person's commit is left exactly as written", () => {
  const message = "fix(x): a change\n\nA body.\n";
  assert.equal(withAttribution(message, null), message);
});

test("git's comment block stays below the trailer, so the message keeps its shape", () => {
  const identity = { name: "Claude", email: "noreply@anthropic.com" };
  const out = withAttribution("fix(x): a change\n\n# Please enter the commit message…\n# On branch master\n", identity);
  const body = out.split("\n");
  const trailerAt = body.indexOf(trailerFor(identity));
  const firstComment = body.findIndex((l) => l.startsWith("#"));
  assert.ok(trailerAt !== -1 && trailerAt < firstComment, "the trailer landed inside git's comment block.");
});

test("an empty message is left alone — git aborts that commit on its own", () => {
  assert.equal(withAttribution("\n\n# a comment\n", { name: "X", email: "y@z" }), "\n\n# a comment\n");
});

// --- the wiring ---------------------------------------------------------------

test("the range audit reports attribution coverage, and the diff review reports it too", () => {
  assert.match(
    read("scripts/commit-check.mjs"),
    /authorship trailer/,
    "`npm run commit:check -- --range` no longer reports coverage, so the count nobody keeps is back."
  );
  assert.match(
    read("scripts/agent-review.mjs"),
    /machine-readable authorship trailer/,
    "Part A's report no longer lists the unattributed commits of a change."
  );
});

test("both hooks that would add it automatically are written down where an installer will find them", () => {
  const text = read("scripts/commit-check.mjs");
  assert.match(text, /\.husky\/commit-msg/);
  assert.match(text, /\.husky\/prepare-commit-msg/);
});
