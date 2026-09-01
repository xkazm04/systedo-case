#!/usr/bin/env node
/** The autonomy budget, and the switch that stops the writing lane
 *  (zero-dependency, reads committed data only).
 *
 *  WHY THIS EXISTS. Every other control here is about a CHANGE — fifteen gates, a
 *  rubric review, three drills, a post-deploy probe — and all of them rest on one
 *  unstated assumption: that a maintainer reads the trail every week. On a repository
 *  where ~97% of commits are agent-written and a push to master IS the release, that
 *  assumption is load-bearing, and it was the only thing in the design that had never
 *  been written down, never measured, and never rehearsed. The drills cover a failing
 *  dependency and a bad change; nothing covered the maintainer being away.
 *
 *  `.github/autonomy-budget.json` is that assumption as an artefact: who the pass
 *  belongs to, how long the loop may run without one, every lane that runs unattended
 *  and what each can actually WRITE, the change classes that wait for a human read no
 *  matter how green the gate is — and the pause switch.
 *
 *  THE SWITCH IS REAL, not documentation. `pauseState()` is imported by
 *  `scripts/issue-dispatch.mjs`, whose `--gate` mode decides whether a labelled issue
 *  becomes a draft pull request. With `pause.paused` set, the gate emits
 *  `dispatch=no` with the reason and the model is never called — so during an absence
 *  a labelled issue queues instead of turning into a branch. Nothing else is stopped
 *  on purpose: the weekly drills write nothing to this repository, and silencing them
 *  during an absence would remove the only record of what happened while nobody was
 *  looking. The file's own `lanes[].pausable` says which is which, and
 *  test-unit/autonomy-budget.test.mjs holds that list to the workflows that exist.
 *
 *  Usage:
 *    npm run autonomy              # the budget, and whether the lane is paused
 *    npm run autonomy -- --check   # the declaration is well formed (exit 1 if not)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BUDGET_REL = ".github/autonomy-budget.json";

/** The declaration, or null when it is missing or unparseable. Never throws: a lane
 *  asking "may I run?" must get an answer even from a broken tree, and the answer to
 *  a broken declaration is the SAFE one (see `pauseState`). */
export function readBudget() {
  const path = join(ROOT, BUDGET_REL);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** `{ paused, reason }` for a lane that is about to do something unattended.
 *
 *  FAILS CLOSED. A declaration that is missing or unparseable pauses the lane, for
 *  the same reason `src/lib/cron-auth.ts` refuses everyone when no secret is
 *  configured: the failure mode of a switch is the one thing about it worth deciding
 *  in advance, and "the file that says whether to stop is broken" is not evidence
 *  that it is safe to continue. */
export function pauseState() {
  const budget = readBudget();
  if (!budget) {
    return {
      paused: true,
      reason: `${BUDGET_REL} is missing or unparseable — refusing to run unattended until it can be read.`,
    };
  }
  const pause = budget.pause ?? {};
  if (pause.paused !== true) return { paused: false, reason: null };
  const who = pause.pausedBy ? ` by ${pause.pausedBy}` : "";
  const when = pause.pausedOn ? ` on ${pause.pausedOn}` : "";
  return {
    paused: true,
    reason: `autonomy is paused${when}${who}: ${pause.reason || "no reason recorded"}`,
  };
}

// --- CLI ---------------------------------------------------------------------

// Guarded the same way scripts/issue-dispatch.mjs guards its own CLI, so importing
// `pauseState` from a lane — or from test-unit/autonomy-budget.test.mjs — never
// prints a report or exits a process.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const CHECK = process.argv.slice(2).includes("--check");
  const budget = readBudget();
  if (!budget) {
    console.error(`✗ autonomy: ${BUDGET_REL} is missing or unparseable.`);
    console.error("  Every unattended lane fails CLOSED while that is true — fix the file, or restore it from git.");
    process.exit(1);
  }

  const state = pauseState();
  const lanes = budget.lanes ?? [];
  const pausable = lanes.filter((l) => l.pausable === true);

  console.log(`Autonomy budget — declared ${budget.declaredOn ?? "(no date)"}`);
  console.log("");
  console.log(`  state:        ${state.paused ? `PAUSED — ${state.reason}` : "running"}`);
  console.log(`  triage:       ${budget.triage?.cadence ?? "?"}, ${budget.triage?.owner ?? "(nobody)"}`);
  console.log(`  may run for:  ${budget.triage?.maxUnreadDays ?? "?"} day(s) with no pass before that is the finding`);
  console.log("");
  console.log(`  ${lanes.length} unattended lane(s), ${pausable.length} of them stopped by the flag:`);
  for (const lane of lanes) {
    console.log(`    ${lane.pausable ? "[pausable]" : "[always  ]"} ${lane.id} — ${lane.writes}`);
  }
  console.log("");
  console.log(`  ${(budget.waitsForAHuman ?? []).length} change class(es) wait for a human whatever the gate says:`);
  for (const c of budget.waitsForAHuman ?? []) console.log(`    · ${c.class}`);
  console.log("");
  for (const line of budget.$cannotSee ?? []) console.log(`  · this cannot see: ${line}`);

  if (CHECK) {
    const problems = [];
    if (typeof budget.pause?.paused !== "boolean") problems.push("`pause.paused` must be a boolean.");
    if (budget.pause?.paused === true && !String(budget.pause?.reason ?? "").trim()) {
      problems.push("`pause.paused` is true with no `pause.reason` — a stop nobody explained is un-done by guesswork.");
    }
    if (!Number.isInteger(budget.triage?.maxUnreadDays) || budget.triage.maxUnreadDays < 1) {
      problems.push("`triage.maxUnreadDays` must be a positive integer.");
    }
    if (!lanes.length) problems.push("`lanes` is empty — a budget that names no lane governs nothing.");
    if (!pausable.length) {
      problems.push("no lane is `pausable` — the switch would then stop nothing, which is a document, not a control.");
    }
    if (problems.length) {
      console.error("");
      console.error(`✗ ${problems.length} problem(s) in ${BUDGET_REL}:`);
      for (const p of problems) console.error(`  • ${p}`);
      process.exit(1);
    }
    console.log("");
    console.log(`✓ autonomy budget: well formed, ${lanes.length} lane(s) declared, the switch stops ${pausable.length}.`);
  }
}
