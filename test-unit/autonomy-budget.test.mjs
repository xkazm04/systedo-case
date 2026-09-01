/** The autonomy budget describes the lanes that actually exist, and the switch is
 *  wired to the one lane that writes.
 *
 *  THE PROBLEM. Everything else in this repository judges a CHANGE. Nothing said how
 *  much may land between two human reads, and nothing could stop a lane RUNNING — the
 *  design rests on a weekly triage pass by one person, and that assumption was never
 *  written down, never measured and never rehearsed. `.github/autonomy-budget.json`
 *  is the assumption as an artefact; `scripts/autonomy.mjs` is the switch.
 *
 *  A declaration like that has exactly one failure mode worth a build: it stops
 *  describing the tree. A weekly workflow added with no lane row is a lane nobody
 *  budgeted for; a lane row for a workflow that is gone reads exactly like a current
 *  one; and a pause flag nothing reads is a document with a boolean in it.
 *
 *  Rung: blocking (ADR-0007 — it passes today). Runs inside `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`.
 *
 *  Pure — reads files, runs nothing, writes nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pauseState, readBudget, BUDGET_REL } from "../scripts/autonomy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const budget = JSON.parse(read(BUDGET_REL));
const lanes = budget.lanes ?? [];

/** The workflows that fire on a clock — the lanes that run with nobody watching. */
const scheduled = readdirSync(join(ROOT, ".github", "workflows"))
  .filter((f) => /\.ya?ml$/.test(f))
  .filter((f) => /^\s*-\s*cron:/m.test(read(`.github/workflows/${f}`)))
  .map((f) => `.github/workflows/${f}`);

test("the budget is well formed and says what it cannot see", () => {
  assert.equal(BUDGET_REL, ".github/autonomy-budget.json");
  assert.equal(typeof budget.pause?.paused, "boolean", "`pause.paused` must be a boolean.");
  assert.ok(
    Number.isInteger(budget.triage?.maxUnreadDays) && budget.triage.maxUnreadDays >= 1,
    "`triage.maxUnreadDays` must be a positive integer — the number the paragraph is worth arguing about."
  );
  assert.ok(budget.triage?.owner, "`triage.owner` — a pass that belongs to nobody is one that does not happen.");
  assert.ok(
    Array.isArray(budget.$cannotSee) && budget.$cannotSee.length >= 3,
    "the budget must state what it does NOT govern. A file that claims to bound autonomy and quietly does not " +
      "cover a local agent, or an already-merged change, is worse than no file."
  );
  assert.ok(
    Array.isArray(budget.waitsForAHuman) && budget.waitsForAHuman.length >= 3,
    "`waitsForAHuman` is the answer to 'should some change classes wait regardless of how green the gate is?'. " +
      "Empty, the answer reads as no."
  );
});

test("every clock-fired workflow has a lane row — a lane nobody budgeted for", () => {
  // The ratchet that keeps this alive: a weekly job added with no row here is a lane
  // running unattended that the budget does not know about.
  const declared = new Set(lanes.map((l) => l.workflow));
  const missing = scheduled.filter((w) => !declared.has(w));
  assert.deepEqual(
    missing,
    [],
    `${BUDGET_REL} does not name these scheduled workflow(s). Add a lane row saying what it can WRITE and ` +
      "whether the pause flag stops it — a job that fires on a clock is the definition of unattended."
  );
});

test("…and no lane row survives the workflow it describes", () => {
  const stale = lanes.filter((l) => !existsSync(join(ROOT, l.workflow))).map((l) => `${l.id} → ${l.workflow}`);
  assert.deepEqual(
    stale,
    [],
    `${BUDGET_REL} declares lane(s) whose workflow does not exist. A stale row reads exactly like a current one.`
  );
});

test("every lane says what it can write and whether the switch stops it", () => {
  const problems = [];
  const seen = new Set();
  for (const l of lanes) {
    if (!l.id) problems.push("a lane with no `id`");
    else if (seen.has(l.id)) problems.push(`two lanes called \`${l.id}\``);
    seen.add(l.id);
    if (!String(l.writes ?? "").trim()) problems.push(`${l.id}: no \`writes\` — the blast radius is the whole row.`);
    if (typeof l.pausable !== "boolean") problems.push(`${l.id}: \`pausable\` must be a boolean.`);
    if (!String(l.trigger ?? "").trim()) problems.push(`${l.id}: no \`trigger\``);
  }
  assert.deepEqual(problems, []);
});

test("the switch stops at least one lane, and it is the one that WRITES to the repository", () => {
  // A pause flag that stops nothing is a document with a boolean in it. The lane that
  // matters is issue-dispatch: it is the only one that turns text into a branch and a
  // pull request. The read-only drills are deliberately not pausable — silencing them
  // during an absence would delete the record of what happened while nobody looked.
  const pausable = lanes.filter((l) => l.pausable === true);
  assert.ok(pausable.length >= 1, `no lane in ${BUDGET_REL} is pausable, so the switch controls nothing.`);
  const dispatch = lanes.find((l) => l.id === "issue-dispatch");
  assert.ok(dispatch, "the issue-dispatch lane is not declared — it is the only lane that writes a branch here.");
  assert.equal(
    dispatch.pausable,
    true,
    "issue-dispatch must be pausable. It is the front of the loop: a labelled issue becomes a model call, a " +
      "branch and a pull request, and an absent maintainer is exactly the state where that should queue instead."
  );
});

test("the switch is WIRED — the dispatch lane reads it before it calls a model", () => {
  // The failure this exists for is the quiet one: the budget stays, the pause flag
  // stays, and the import is dropped in a refactor. Then setting `paused` changes
  // nothing and the file reads as a control.
  const src = read("scripts/issue-dispatch.mjs");
  assert.match(
    src,
    /from "\.\/autonomy\.mjs"/,
    "scripts/issue-dispatch.mjs no longer imports the pause. A flag nothing reads is a document."
  );
  assert.match(
    src,
    /pauseState\(\)/,
    "scripts/issue-dispatch.mjs no longer calls pauseState(), so the budget's switch stops nothing."
  );
  // …and it is consulted in the GATE, before the event is parsed — not somewhere
  // after the model has already been asked and paid for.
  const gateAt = src.indexOf("function gate()");
  const pauseAt = src.indexOf("pauseState()", gateAt);
  const eventAt = src.indexOf("GITHUB_EVENT_PATH", gateAt);
  assert.ok(gateAt !== -1, "scripts/issue-dispatch.mjs has no `gate()` — the dispatch decision moved.");
  assert.ok(
    pauseAt !== -1 && pauseAt < eventAt,
    "the pause is checked after the event is read. It is the first thing the lane should decide, so a paused " +
      "run costs nothing at all."
  );
});

test("it fails CLOSED — an unreadable budget pauses the lane rather than waving it through", () => {
  // Same discipline as src/lib/cron-auth.ts refusing everyone with no secret set. The
  // failure mode of a switch is the one thing about it worth deciding in advance.
  const live = pauseState();
  assert.equal(live.paused, budget.pause.paused === true, "pauseState() disagrees with the committed flag.");
  assert.ok(readBudget(), "readBudget() cannot parse the committed budget.");
});

test("the budget is reachable from a command", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(
    String(pkg.scripts?.autonomy ?? ""),
    /scripts\/autonomy\.mjs/,
    "`npm run autonomy` no longer prints the budget. A maintainer coming back after three weeks needs one " +
      "command that says what ran and whether the lane is on."
  );
});
