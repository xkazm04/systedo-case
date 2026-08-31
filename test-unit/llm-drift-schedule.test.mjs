/** The scheduled real-model prove, asserted rather than described.
 *
 *  `check:ci` is static and key-free by decision, which leaves exactly one thing
 *  unwatched: the provider on the other side of the chokepoint changing what it
 *  returns. .github/workflows/llm-drift.yml is the compensation — the same
 *  registry, proved weekly against the configured provider, with the verdicts
 *  published where a trend is readable.
 *
 *  A schedule is easy to delete and impossible to miss the absence of: nothing
 *  goes red when a cron stops running. These tests are what notices. They also
 *  pin the two properties that keep it honest — that it stays on the reporting
 *  rung (money and a key can never be a condition of a release, ADR-0007), and
 *  that the prove step is allowed to fail the job, because the run's own
 *  conclusion is the row next week's report reads back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const pkg = JSON.parse(read("package.json"));
const workflow = read(".github/workflows/llm-drift.yml");

test("the prove runs on a schedule, not only when somebody remembers", () => {
  assert.match(
    workflow,
    /^\s*schedule:/m,
    "llm-drift.yml no longer runs on a schedule. On-demand proving is what this replaced: the first thing to " +
      "notice a provider change was whoever next ran the command, which in practice meant an incident."
  );
  assert.match(workflow, /cron:/, "the schedule declares no cron expression.");
});

test("the prove exists and walks the registry through the chokepoint", () => {
  assert.ok(existsSync(join(ROOT, "scripts/llm-drift.mjs")));
  assert.match(pkg.scripts?.["llm:drift"] ?? "", /scripts\/llm-drift\.mjs/);
  const source = read("scripts/llm-drift.mjs");
  assert.match(source, /LLM_TOOLS/, "the prove no longer walks the registry, so a new operation would go unproved.");
  assert.match(
    source,
    /generateStructured/,
    "the prove no longer goes through generateStructured — proving anything else proves the wrong thing."
  );
});

test("it stays on the reporting rung: never in check:ci, never a required check", () => {
  assert.doesNotMatch(
    pkg.scripts?.["check:ci"] ?? "",
    /llm:drift/,
    "`check:ci` now runs the real-model prove. It needs a key, the network and money — three things a release " +
      "must never wait on (docs/adr/0007-gate-rung-discipline.md). Keep it on the schedule."
  );
  const required = JSON.parse(read(".github/required-checks.json")).required ?? [];
  assert.ok(
    !required.some((r) => String(r.workflow).includes("llm-drift")),
    "the drift prove is enumerated as a check that may stop a change. It cannot be proven offline, so it must " +
      "not be able to block one."
  );
});

test("a drifted run goes red, so next week's table has a row to read", () => {
  // The report is rebuilt from this workflow's own run conclusions. If the prove
  // step swallowed its failure, every week would read `success` and the trail
  // would say the opposite of what happened.
  const proveStep = workflow.slice(workflow.indexOf("Prove every registered operation"));
  const nextStep = proveStep.indexOf("- name: Render the trail");
  assert.ok(nextStep > 0, "the prove step is no longer followed by the report step.");
  assert.doesNotMatch(
    proveStep.slice(0, nextStep),
    /continue-on-error/,
    "the prove step now swallows its own failure, so every run would be recorded green and the history the " +
      "report reads back would be a fiction."
  );
});

test("the verdict is published somewhere that outlives the run", () => {
  assert.match(
    workflow,
    /gh issue (edit|create)/,
    "nothing publishes the drift verdict any more. A job summary expires with its retention window, which is " +
      "the state that made the review's own trail unreadable from outside the Actions tab."
  );
  assert.ok(existsSync(join(ROOT, "scripts/llm-drift-history.mjs")));
});
