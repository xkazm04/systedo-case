/** The checkpoint contract, asserted rather than described.
 *
 *  The gap this closes is a process one: a run killed by its wall clock left
 *  nothing behind, so the next run started cold and the log got a commit that
 *  narrated the session instead of naming a change. scripts/commit-subject.mjs
 *  refuses those subjects; scripts/agent-checkpoint.mjs is what a stopped run
 *  leaves instead.
 *
 *  Two halves are tested here, for the same reason delivery-contract.test.mjs
 *  tests two halves: the RULES (pure, in scripts/lib/agent-checkpoint-core.mjs)
 *  and the WIRING (package.json, check:ci, and the standing instruction in
 *  AGENTS.md, which is the only part every session actually reads). A rule with
 *  no wiring is a script nobody runs; wiring with no rules is a command that
 *  writes noise.
 *
 *  `npm run test:unit` is inside check:ci and inside the required check
 *  "Typecheck, lint & build", so removing either half turns the gate red on the
 *  remover's own machine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LIMITS,
  applyCommit,
  applyEnd,
  applyNote,
  applyStart,
  applyTouch,
  emptyCheckpoint,
  renderBriefing,
  shouldDiscardOnEnd,
  shouldPrune,
  statusOf,
  validate,
} from "../scripts/lib/agent-checkpoint-core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts ?? {};

const T0 = Date.parse("2026-08-30T10:00:00.000Z");
const MIN = 60_000;
const fresh = () => emptyCheckpoint({ session: "s1", cwd: null, now: T0 });

// --- the rules ---------------------------------------------------------------

test("a new checkpoint is valid, and a broken one says why", () => {
  assert.deepEqual(validate(fresh()), []);
  assert.deepEqual(validate(null), ["not a JSON object."]);
  assert.ok(validate({ ...fresh(), done: "not an array" }).some((p) => p.includes("`done`")));
  assert.ok(validate({ ...fresh(), updatedAt: "whenever" }).some((p) => p.includes("`updatedAt`")));
});

test("an edit is recorded without anyone having to remember to record it", () => {
  let cp = applyTouch(fresh(), { file: "src/lib/usage.ts", now: T0 + MIN });
  cp = applyTouch(cp, { file: "src/lib/plans.ts", now: T0 + 2 * MIN });
  cp = applyTouch(cp, { file: "src/lib/usage.ts", now: T0 + 3 * MIN });

  assert.equal(cp.edits, 3, "every edit counts, even a second edit to the same file.");
  assert.deepEqual(cp.touched, ["src/lib/plans.ts", "src/lib/usage.ts"], "a file appears once, most recent last.");
  assert.equal(cp.updatedAt, new Date(T0 + 3 * MIN).toISOString());
});

test("the touched list is bounded — a checkpoint is a briefing, not a transcript", () => {
  let cp = fresh();
  for (let i = 0; i < LIMITS.touched + 15; i++) cp = applyTouch(cp, { file: `src/f${i}.ts`, now: T0 });
  assert.equal(cp.touched.length, LIMITS.touched);
  assert.equal(cp.touched.at(-1), `src/f${LIMITS.touched + 14}.ts`, "the newest entry is the one kept.");
  assert.ok(!cp.touched.includes("src/f0.ts"), "the oldest entries are the ones dropped.");
});

test("the agent's half is what turns a file list into a handoff", () => {
  let cp = applyStart(fresh(), { task: "fold the envelope into the control plane", next: "port the store test", budgetMinutes: "20", now: T0 });
  assert.equal(cp.task, "fold the envelope into the control plane");
  assert.equal(cp.next, "port the store test");
  assert.equal(cp.budgetMinutes, 20);
  assert.equal(cp.explicit, true);

  cp = applyNote(cp, { done: "read the seam", gate: "typecheck, lint", next: "wire the ratchet", now: T0 + MIN });
  assert.deepEqual(cp.done, ["read the seam"]);
  assert.deepEqual(cp.gates, ["typecheck, lint"]);
  assert.equal(cp.next, "wire the ratchet", "`next` is replaced, not appended: only the NEXT step is next.");
});

test("a run that ended is distinguishable from a run that was stopped", () => {
  const auto = applyTouch(fresh(), { file: "src/a.ts", now: T0 });
  assert.match(statusOf(auto, T0 + MIN), /STOPPED/, "no endedAt means the run never got to end.");

  const ended = applyEnd(auto, { reason: "exit", now: T0 + MIN });
  assert.equal(ended.endReason, "exit");
  assert.doesNotMatch(statusOf(ended, T0 + 2 * MIN), /STOPPED/);

  // An auto-opened checkpoint whose session ended cleanly recorded no
  // interruption and no intent — filing it would be crying wolf at the next
  // session start.
  assert.equal(shouldDiscardOnEnd(ended), true);
  assert.equal(shouldDiscardOnEnd(applyEnd(applyStart(auto, { task: "a real task", now: T0 }), { reason: "exit", now: T0 })), false);
});

test("an interrupted checkpoint is never pruned; a cleanly ended one eventually is", () => {
  const stopped = applyTouch(fresh(), { file: "src/a.ts", now: T0 });
  assert.equal(shouldPrune(stopped, T0 + 400 * 24 * 60 * MIN), false, "the interrupted run is the whole point.");

  const ended = applyEnd(stopped, { reason: "exit", now: T0 });
  assert.equal(shouldPrune(ended, T0 + 60 * MIN), false);
  assert.equal(shouldPrune(ended, T0 + 4 * 24 * 60 * MIN), true);
});

test("a later edit reopens a checkpoint a previous end had stamped", () => {
  // Claude Code reuses a session id across `--continue`, so an `endedAt` from the
  // last turn must not make live work look finished.
  const ended = applyEnd(applyTouch(fresh(), { file: "src/a.ts", now: T0 }), { reason: "clear", now: T0 + MIN });
  const resumed = applyTouch(ended, { file: "src/b.ts", now: T0 + 2 * MIN });
  assert.equal(resumed.endedAt, null);
  assert.equal(resumed.endReason, null);
});

test("a commit is recorded as a step that landed, not as more edits", () => {
  const cp = applyCommit(applyStart(fresh(), { task: "t", now: T0 }), {
    files: ["src/lib/plans.ts", "test-unit/plans.test.mjs"],
    now: T0 + MIN,
  });
  assert.equal(cp.edits, 0, "committing is not editing; the edit count stays a count of edits.");
  assert.deepEqual(cp.touched, ["src/lib/plans.ts", "test-unit/plans.test.mjs"]);
  assert.match(cp.done.at(-1), /committed 2 path\(s\)/);
});

test("the briefing leads with the interrupted run and says nothing when there is nothing to say", () => {
  assert.equal(renderBriefing([], T0), "", "a hook that prints nothing costs the next run nothing.");

  const ended = applyEnd(applyStart(fresh(), { task: "the finished one", now: T0 }), { reason: "exit", now: T0 });
  const stopped = applyStart(
    { ...emptyCheckpoint({ session: "s2", cwd: null, now: T0 }) },
    { task: "the killed one", next: "port the store test", now: T0 }
  );

  const text = renderBriefing([ended, stopped], T0 + 5 * MIN);
  assert.ok(text.indexOf("the killed one") < text.indexOf("the finished one"), "STOPPED entries come first.");
  assert.match(text, /next: port the store test/);
  assert.match(text, /--close s2/, "the briefing says how to close what it reports, or it becomes permanent noise.");
});

// --- the wiring --------------------------------------------------------------

test("the checkpoint commands exist and are what package.json runs", () => {
  assert.ok(existsSync(join(ROOT, "scripts/agent-checkpoint.mjs")));
  assert.ok(existsSync(join(ROOT, "scripts/lib/agent-checkpoint-core.mjs")));
  assert.match(scripts["checkpoint"] ?? "", /scripts\/agent-checkpoint\.mjs/);
  assert.match(scripts["checkpoint:check"] ?? "", /scripts\/agent-checkpoint\.mjs --check/);
});

test("a checkpoint that stopped being readable fails the gate rather than the next run", () => {
  // The handoff is machine-written and machine-read. A file that no longer parses
  // does not announce itself — it just hands the next session nothing.
  assert.match(
    scripts["check:ci"] ?? "",
    /checkpoint:check/,
    "`check:ci` no longer validates the checkpoints, so a corrupted handoff would be discovered by the run " +
      "that needed it, which is exactly too late."
  );
});

test("the standing instruction is in the file every session actually loads", () => {
  // AGENTS.md is canonical guidance (.ai/manifest.yaml guidance.canonical) and is
  // imported by CLAUDE.md, so it is the one surface a fresh session always reads.
  // A checkpoint mechanism nobody is told about is a script, not a practice.
  const agents = read("AGENTS.md");
  assert.match(
    agents,
    /npm run checkpoint/,
    "AGENTS.md no longer tells an agent to read or write a checkpoint, so a stopped run goes back to leaving " +
      "nothing for the next one."
  );
  assert.match(agents, /\.agent\/README\.md/, "the instruction must point at the record that explains why it exists.");
  assert.ok(existsSync(join(ROOT, ".agent/README.md")));
});

test("the involuntary layers are written down verbatim, so wiring them is a paste", () => {
  // Neither .husky/pre-commit nor .claude/settings.json is generated, and both are
  // edited deliberately. What must not happen is the blocks being described in
  // prose and then reconstructed differently by whoever gets to them.
  const doc = read(".agent/README.md");
  assert.match(doc, /agent-checkpoint\.mjs --commit/, "the pre-commit line is missing from the paste block.");
  assert.match(doc, /"PostToolUse"/, "the per-edit hook block is missing from the paste block.");
  assert.match(doc, /agent-checkpoint\.mjs --show/, "the session-start hook is missing from the paste block.");
});
