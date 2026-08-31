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
  PROVENANCE_TRAILERS,
  UNKNOWN_HARNESS,
  agentIdentity,
  harnessOf,
  hasAttribution,
  hasProvenance,
  provenanceFor,
  trailerFor,
  trailerValue,
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

// --- provenance: WHICH LANE, not just "an agent" ------------------------------
//
// "Co-Authored-By: Claude" is true of nearly every commit in this repository, so
// it narrows nothing when a regression is traced back. What a reader needs is the
// harness, the model, the spec and the session — and several commits in this
// history say only that a loop's lane committed them, which is the same
// non-answer with more words.

test("a person's commit carries no provenance either", () => {
  assert.deepEqual(provenanceFor({}), []);
  assert.deepEqual(provenanceFor({ AGENT_HARNESS: "ascent-loop" }), [], "naming a harness is not being an agent.");
});

test("an agent's commit always names a harness, and says `unknown` rather than nothing", () => {
  assert.deepEqual(provenanceFor({ AI_AGENT: "1" }), [["Agent-Harness", UNKNOWN_HARNESS]]);
  assert.deepEqual(provenanceFor({ CLAUDECODE: "1" }), [["Agent-Harness", "claude-code"]]);
  assert.deepEqual(
    provenanceFor({ CLAUDECODE: "1", AGENT_HARNESS: "ascent-loop" }),
    [["Agent-Harness", "ascent-loop"]],
    "naming yourself must beat being guessed at, or a harness cannot correct a wrong guess."
  );
});

test("model, spec, session and lane are written when stated and omitted when not", () => {
  const rows = provenanceFor({
    CLAUDECODE: "1",
    AGENT_MODEL: "claude-opus-5",
    AGENT_SPEC: "Explore",
    CLAUDE_SESSION_ID: "0f3a1c",
  });
  assert.deepEqual(rows, [
    ["Agent-Harness", "claude-code"],
    ["Agent-Model", "claude-opus-5"],
    ["Agent-Spec", "Explore"],
    ["Agent-Session", "0f3a1c"],
  ]);
  // Nothing is invented: a field the environment never stated is absent, because a
  // wrong provenance reads as evidence and is worse than none.
  const keys = provenanceFor({ AI_AGENT: "1" }).map(([k]) => k);
  assert.deepEqual(keys, ["Agent-Harness"]);
  for (const k of PROVENANCE_TRAILERS) assert.ok(typeof k === "string" && k.startsWith("Agent-"));
});

test("a lane is a branch a harness owns, and the default branch is not one", () => {
  const lane = (branch, env = { CLAUDECODE: "1" }) =>
    provenanceFor(env, { branch }).find(([k]) => k === "Agent-Lane")?.[1] ?? null;
  assert.equal(lane("ascent/loop-20260831-xkazm04"), "ascent/loop-20260831-xkazm04");
  assert.equal(lane("agent/issue-42"), "agent/issue-42");
  assert.equal(lane("master"), null, "naming the branch everything lands on says nothing about who wrote it.");
  assert.equal(lane("main"), null);
  assert.equal(lane("wip"), null, "a local branch with no lane prefix is not a lane.");
  assert.equal(lane("master", { CLAUDECODE: "1", AGENT_LANE: "ascent/loop-x" }), "ascent/loop-x");
});

test("an environment value cannot break out of the trailer line it is written on", () => {
  // These values come from the environment of whatever process is committing, and
  // land in a message `git interpret-trailers` later parses.
  assert.equal(trailerValue("claude-opus-5\nAgent-Harness: forged"), "claude-opus-5 Agent-Harness: forged");
  assert.equal(trailerValue("x".repeat(400)).length, 120);
  const rows = provenanceFor({ AI_AGENT: "1", AGENT_HARNESS: "a\nb" });
  assert.equal(rows[0][1], "a b");
});

test("the trailers are added as a block, below the message, and only once", () => {
  const identity = { name: "Claude", email: "noreply@anthropic.com" };
  const prov = provenanceFor({ CLAUDECODE: "1", AGENT_MODEL: "claude-opus-5" });
  const out = withAttribution("fix(x): a change\n\nSome body.\n", identity, prov);
  const lines = out.trimEnd().split("\n");
  assert.equal(lines.at(-2), "Agent-Harness: claude-code");
  assert.equal(lines.at(-1), "Agent-Model: claude-opus-5");
  assert.equal(lines.at(-3), trailerFor(identity));
  assert.equal(withAttribution(out, identity, prov), out, "running it twice must add nothing.");
});

test("a lane that already wrote its own provenance is not overwritten with the environment's", () => {
  // scripts/issue-dispatch.mjs commits in a runner where no hook is installed and
  // writes its own trailers. If a hook ever did run there, attributing the commit
  // to two lanes would be worse than attributing it to none.
  const identity = { name: "Claude", email: "noreply@anthropic.com" };
  const message = "feat(x): a change\n\nGenerated-by: issue-dispatch (m)\nAgent-Harness: issue-dispatch\n";
  const out = withAttribution(message, identity, provenanceFor({ CLAUDECODE: "1" }));
  assert.equal(harnessOf(out), "issue-dispatch");
  assert.equal((out.match(/^Agent-Harness:/gm) ?? []).length, 1);
});

test("reading a harness back out of a message is what makes it countable", () => {
  assert.equal(harnessOf("fix(x): y\n\nAgent-Harness: ascent-loop"), "ascent-loop");
  assert.equal(harnessOf("fix(x): y\n\nCo-Authored-By: Claude <a@b.c>"), "");
  assert.equal(hasProvenance("fix(x): y\n\nAgent-Session: abc"), true);
  assert.equal(hasProvenance("fix(x): y\n\nAgent-Harness:"), false, "a trailer with no value says nothing.");
});

test("the lane that commits for itself writes its own provenance", () => {
  const dispatch = read("scripts/issue-dispatch.mjs");
  assert.match(
    dispatch,
    /Agent-Harness: issue-dispatch/,
    "scripts/issue-dispatch.mjs commits in a runner where no hook is installed — if it does not write the " +
      "trailer itself, its commits are the ones the log cannot trace."
  );
  assert.match(dispatch, /Agent-Model: /);
});

// --- the wiring ---------------------------------------------------------------

test("the range audit reports attribution coverage, and the diff review reports it too", () => {
  assert.match(
    read("scripts/commit-check.mjs"),
    /authorship trailer/,
    "`npm run commit:check -- --range` no longer reports coverage, so the count nobody keeps is back."
  );
  assert.match(
    read("scripts/commit-check.mjs"),
    /name the lane that wrote them/,
    "`npm run commit:check -- --range` no longer reports which harnesses the log names."
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
