/** The gate chain is ordered cheapest-first — now against a clock, not a label.
 *
 *  `npm run check:ci` runs fifteen stages serially with `next build` among them,
 *  and the order is the reason a wrong change is refused in seconds instead of
 *  after a build. That order was justified by the hand-written `cost:` field in
 *  scripts/gate-remedy.mjs, which nothing ever compared against a measurement — so
 *  a gate that quietly became expensive kept its place at the front of the queue,
 *  and "how long is this gate, and which stage dominates it?" had no answer in the
 *  repository at all.
 *
 *  scripts/gate-timings.mjs runs the same chain (parsed out of the same package.json
 *  entry, so the chain is still declared once), times every stage, records the
 *  durations, and fails when the measurement contradicts the order. These tests
 *  cover the rule itself — the run is CI's job, not the unit suite's — plus the
 *  wiring, without which none of it executes.
 *
 *  Runs in `npm run test:unit` → `npm run check:ci`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAIN } from "../scripts/gate-remedy.mjs";
import {
  MINUTE_MAX_MS,
  SECONDS_MAX_MS,
  bucketFor,
  mediansFrom,
  orderingProblems,
  stagesFrom,
} from "../scripts/gate-timings.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts ?? {};

// --- the chain is still declared exactly once ---------------------------------

test("the timed runner runs the chain check:ci declares, in check:ci's order", () => {
  const stages = stagesFrom(scripts["check:ci"]);
  assert.ok(stages.length >= 15, `check:ci runs ${stages.length} stages — did the chain get shortened?`);
  assert.deepEqual(
    stages,
    CHAIN.map((c) => c.stage),
    "scripts/gate-timings.mjs derives the chain from package.json's `check:ci`, and scripts/gate-remedy.mjs " +
      "describes it. They have drifted apart, so the timings would be attributed to the wrong gates."
  );
});

// --- the rule ----------------------------------------------------------------

test("a gate is `seconds` only while it measures like one", () => {
  assert.equal(bucketFor(200), "seconds");
  assert.equal(bucketFor(SECONDS_MAX_MS - 1), "seconds");
  assert.equal(bucketFor(SECONDS_MAX_MS), "a minute");
  assert.equal(bucketFor(MINUTE_MAX_MS), "minutes");
});

test("the measured chain, in the shape it has today, is clean", () => {
  // The real order: thirteen zero-dependency checks, then `next build`, then the
  // unit suite. Representative durations, not a fixture of real numbers — the
  // property under test is the rule, and CI measures the numbers.
  const rows = [
    { stage: "adr:check", ms: 300, label: "seconds" },
    { stage: "actions:check", ms: 900, label: "seconds" },
    { stage: "seed:check", ms: 1200, label: "seconds" },
    { stage: "check", ms: 180_000, label: "minutes" },
    { stage: "test:unit", ms: 45_000, label: "a minute" },
  ];
  assert.deepEqual(orderingProblems(rows), []);
});

test("a cheap gate placed behind an expensive one is a finding", () => {
  const problems = orderingProblems([
    { stage: "check", ms: 180_000, label: "minutes" },
    { stage: "adr:check", ms: 300, label: "seconds" },
  ]);
  assert.equal(problems.length, 1, "a seconds-long check after `next build` costs a build to say so.");
  assert.match(problems[0], /adr:check/);
  assert.match(problems[0], /AFTER/);
});

test("a gate that stopped being cheap loses its place, even where it stands", () => {
  // The failure mode the labels could not catch: the stage did not move, its cost
  // did. Nothing was ever going to notice that by reading package.json.
  const problems = orderingProblems([
    { stage: "llm:gate:check", ms: 120_000, label: "seconds" },
    { stage: "check", ms: 180_000, label: "minutes" },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /llm:gate:check/);
  assert.match(problems[0], /listed as a "seconds" gate/);
});

test("the verdict is a median over runs, so one slow laptop does not block a push", () => {
  const medians = mediansFrom({
    runs: [
      { stages: { "adr:check": 300, check: 100_000 } },
      { stages: { "adr:check": 40_000, check: 120_000 } }, // the blip
      { stages: { "adr:check": 400, check: 110_000 } },
    ],
  });
  assert.equal(medians["adr:check"].medianMs, 400);
  assert.equal(medians["adr:check"].samples, 3);
  assert.equal(bucketFor(medians["adr:check"].medianMs), "seconds");
  assert.equal(medians["check"].medianMs, 110_000);
});

// --- the wiring ---------------------------------------------------------------

test("the timed runner is what CI actually runs", () => {
  assert.match(scripts["check:ci:timed"] ?? "", /scripts\/gate-timings\.mjs/);
  assert.match(scripts["gates:timings"] ?? "", /scripts\/gate-timings\.mjs --report/);
  assert.match(scripts["gates:timings:check"] ?? "", /scripts\/gate-timings\.mjs --check/);

  const ci = read(".github/workflows/ci.yml");
  assert.match(
    ci,
    /npm run check:ci:timed/,
    "CI is back to running the chain untimed, so nothing measures the loop every contributor and agent lives in."
  );
  assert.match(
    ci,
    /--summary "\$GITHUB_STEP_SUMMARY"/,
    "the per-gate table no longer reaches the job summary, so the timings exist only in a log nobody scrolls."
  );
  assert.match(
    ci,
    /name: gate-timings/,
    "the timings are no longer kept as an artifact — a job summary expires with its run, and the question they " +
      "answer ('is the gate getting slower?') is about a trend."
  );
});

test("the rolling measurement stays out of the tree, and the baseline stays in it", () => {
  assert.match(
    read(".gitignore"),
    /^\/\.gate-timings\.json\s*$/m,
    "the rolling per-run measurement is machine- and load-specific and is written by a RUN rather than by a " +
      "change; tracking it would dirty the tree on every gate."
  );
  if (!existsSync(join(ROOT, ".github/gate-timings.json"))) return; // not recorded yet
  const baseline = JSON.parse(read(".github/gate-timings.json"));
  const stages = new Set(stagesFrom(scripts["check:ci"]));
  for (const stage of Object.keys(baseline.stages ?? {})) {
    assert.ok(stages.has(stage), `.github/gate-timings.json records \`${stage}\`, which check:ci no longer runs.`);
  }
  for (const entry of baseline.history ?? []) {
    assert.ok(
      String(entry.reason ?? "").length >= 20,
      "a recorded baseline needs the sentence, not just the number: what the gate costs now and why that is right."
    );
  }
});
