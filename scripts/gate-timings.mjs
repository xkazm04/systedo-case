#!/usr/bin/env node
/** `check:ci`, timed — and the cheapest-first ordering held to the measurement.
 *
 *  WHY. `npm run check:ci` is the loop every contributor and every agent on this
 *  repository lives in: fifteen gates, serially, with `next build` inside them,
 *  and `.husky/pre-push` runs the whole thing before any push to master. It is
 *  ordered cheapest-first on purpose (scripts/gate-remedy.mjs), and until now that
 *  order rested on a HAND-WRITTEN label — `cost: "seconds"` — that nothing ever
 *  compared against a clock. Nobody could answer "how long does the gate take?" or
 *  "which single stage dominates it?" without sitting and watching, so the honest
 *  answer to "can we afford another gate?" was a shrug. A guardrail nobody has
 *  measured is one that gets skipped under time pressure, which is the one moment
 *  it is load-bearing.
 *
 *  WHAT THIS DOES. It runs the SAME chain — parsed out of package.json's
 *  `check:ci` so there is still exactly one place the chain is declared — times
 *  each stage, and:
 *
 *    • stops at the first red stage, as `&&` did, and reports how long the run
 *      had already cost when it stopped;
 *    • appends every stage's duration to `.gate-timings.json` (git-ignored,
 *      rolling, last 20 runs) so the numbers accumulate without anyone
 *      remembering to collect them, and prints the table — with each stage's share
 *      of the total — to stdout and to `--summary` (the CI job summary);
 *    • ASSERTS THE ORDERING it just measured, at every rung rather than only at the
 *      top. No stage may run after one that measures in a SLOWER bucket than it
 *      does, and a stage the remedy table calls "seconds" may not measure slower
 *      than that. Both are red. That is the same invariant
 *      test-unit/gate-remedy.test.mjs states over the labels — this one states it
 *      over the clock, so the label cannot quietly stop being true.
 *
 *      The rule used to stop at the seconds boundary, and the step below it was
 *      where the cost actually was: the 517-file unit suite ran AFTER `npm run
 *      check`, so a broken test was reported only once `next build` had finished,
 *      and both stages measured "not seconds" so nothing could go red for it.
 *
 *  RUNG (docs/adr/0007-gate-rung-discipline.md): blocking, and it passes today —
 *  the chain is already in the right order, so a red here is a change that put an
 *  expensive gate in front of a cheap one, or made a cheap gate expensive. It costs
 *  nothing: the measurement is a clock around work the gate was already doing.
 *
 *  WHERE THE NUMBERS LIVE. `.gate-timings.json` is the rolling measurement and is
 *  git-ignored — it is machine- and load-specific, and a tracked file written by a
 *  pre-push hook would dirty the tree on every push. What is COMMITTED is a
 *  baseline the maintainer accepts on purpose, `.github/gate-timings.json`, which
 *  is how "the gate takes 4 minutes and `next build` is 70% of it" becomes a fact
 *  the repository states rather than a thing someone once noticed:
 *
 *      npm run check:ci:timed                                   # measure
 *      npm run gates:timings -- --accept --reason "..."         # record it
 *
 *  Usage:
 *    node scripts/gate-timings.mjs [--summary FILE]   # run the chain, timed
 *    node scripts/gate-timings.mjs --report           # what has been measured
 *    node scripts/gate-timings.mjs --failures         # which gate goes red FIRST, and where it sits
 *    node scripts/gate-timings.mjs --check            # ordering, against the baseline
 *    node scripts/gate-timings.mjs --accept --reason "…"
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { CHAIN } from "./gate-remedy.mjs";
import { stagesFrom } from "./lib/chain.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG = join(ROOT, ".gate-timings.json");
const BASELINE = join(ROOT, ".github", "gate-timings.json");
const KEEP_RUNS = 20;

/** A gate that finishes inside this is "seconds" — zero-dependency, reads files,
 *  cheap enough to run before anything expensive. Deliberately generous (a cold
 *  checkout on a loaded laptop is not a regression); `next build` and the unit
 *  suite are an order of magnitude past it, which is the distinction that matters. */
export const SECONDS_MAX_MS = 15_000;
export const MINUTE_MAX_MS = 90_000;

export const bucketFor = (ms) => (ms < SECONDS_MAX_MS ? "seconds" : ms < MINUTE_MAX_MS ? "a minute" : "minutes");

/** Cheap → expensive. The ordering rule is monotonicity over THIS, so it holds at
 *  every step of the chain rather than only at the seconds boundary. */
export const BUCKETS = ["seconds", "a minute", "minutes"];
const rankOf = (ms) => BUCKETS.indexOf(bucketFor(ms));

export const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);

/** The chain, from the one place it is declared, through the one parser
 *  (scripts/lib/chain.mjs). Re-exported because the tests and every other reader
 *  already ask this module for it. */
export { stagesFrom };

/** The cheapest-first rule, over measurements rather than labels.
 *
 *  Monotonic over the whole chain, not only over the seconds boundary. The
 *  narrower rule — "no seconds-long gate after a slow one" — was the one that
 *  mattered while the cheap half was the whole question, and it could not see the
 *  step below it: the unit suite sat behind `npm run check`, so a broken test cost
 *  a `next build` before anything said so, and both stages measured "not seconds"
 *  so nothing was ever going to go red for it. A stage may now not run after one
 *  that measures in a SLOWER bucket than it does, at any rung.
 *
 *  rows: [{ stage, ms, label }]. `label` is the `cost` the remedy table claims for
 *  that stage, or null for a stage the table does not know. */
export function orderingProblems(rows) {
  const problems = [];
  // The slowest stage seen so far. A row that is already a finding does not become
  // the new blocker: it is the one out of place, not the chain's new floor.
  let blocker = null;
  for (const row of rows) {
    if (blocker && rankOf(row.ms) < rankOf(blocker.ms)) {
      problems.push(
        `\`${row.stage}\` measures ${fmt(row.ms)} ("${bucketFor(row.ms)}") and runs AFTER \`${blocker.stage}\`, ` +
          `which measures ${fmt(blocker.ms)} ("${bucketFor(blocker.ms)}"). A change that trips it therefore pays ` +
          `for ${blocker.stage} first. Move it up the chain in package.json's \`check:ci\`, and move its entry in ` +
          "scripts/gate-remedy.mjs with it."
      );
      continue;
    }
    if (!blocker || rankOf(row.ms) > rankOf(blocker.ms)) blocker = row;
  }
  for (const row of rows) {
    if (!row.label) continue;
    const measured = bucketFor(row.ms);
    if (row.label === "seconds" && measured !== "seconds") {
      problems.push(
        `\`${row.stage}\` is listed as a "seconds" gate in scripts/gate-remedy.mjs and measured ${fmt(row.ms)}. ` +
          "The chain's order is justified by those labels, so a label that is no longer true has moved a slow " +
          "gate to the front of the queue. Make it cheap again, or relabel it and move it down."
      );
    }
  }
  return problems;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/** Per-stage median over every run in the log. One slow run on a loaded machine
 *  should not fail somebody's push; a gate that got slow and stayed slow should. */
export function mediansFrom(log) {
  const byStage = new Map();
  for (const run of log?.runs ?? []) {
    for (const [stage, ms] of Object.entries(run.stages ?? {})) {
      if (!byStage.has(stage)) byStage.set(stage, []);
      byStage.get(stage).push(ms);
    }
  }
  const out = {};
  for (const [stage, samples] of byStage) out[stage] = { medianMs: median(samples), samples: samples.length };
  return out;
}

/** How often each stage was the FIRST one to go red, over the runs in the log.
 *
 *  The chain is ordered by what a stage COSTS, which is the right primary key: a
 *  wrong change should be refused before `next build`. Cost does not settle the
 *  order INSIDE the cheap half, and there the useful key is different — a
 *  contributor's first red build is whichever gate they trip first, and thirteen
 *  seconds-long gates all claim that slot equally. `failedAt` is already recorded
 *  on every timed run; nothing had ever read it back. This is that read.
 *
 *  Reporting only, and deliberately: with a handful of local runs the ranking is
 *  noise, and a gate that reorders the chain from noise would be worse than the
 *  hand-written order it replaced. Run it, look at the ranking, move a gate on
 *  purpose. */
export function failureCountsFrom(log) {
  const counts = new Map();
  let total = 0;
  for (const run of log?.runs ?? []) {
    if (!run.failedAt) continue;
    counts.set(run.failedAt, (counts.get(run.failedAt) ?? 0) + 1);
    total++;
  }
  return { counts: Object.fromEntries(counts), red: total, runs: (log?.runs ?? []).length };
}

const readJson = (path) => {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  } catch {
    return null;
  }
};

const write = (path, doc) => {
  try {
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  } catch (err) {
    console.error(`(could not write ${path}: ${err.message})`);
  }
};

// --- argv --------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
};
const REPORT = argv.includes("--report");
const FAILURES = argv.includes("--failures");
const CHECK = argv.includes("--check");
const ACCEPT = argv.includes("--accept");
const SUMMARY = flag("--summary");
const REASON = flag("--reason");

const pkg = readJson(join(ROOT, "package.json")) ?? {};
const STAGES = stagesFrom(pkg.scripts?.["check:ci"]);
const labelOf = (stage) => CHAIN.find((c) => c.stage === stage)?.cost ?? null;

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};
const flushSummary = () => {
  if (!SUMMARY) return;
  try {
    appendFileSync(SUMMARY, `\n### Gate timings\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`);
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
};

// --- the table ---------------------------------------------------------------

function table(rows, totalMs) {
  const width = Math.max(...rows.map((r) => r.stage.length), 12);
  for (const row of rows) {
    const share = totalMs ? Math.round((row.ms / totalMs) * 100) : 0;
    const bar = "█".repeat(Math.max(1, Math.round(share / 4)));
    say(
      `  ${row.stage.padEnd(width)}  ${fmt(row.ms).padStart(8)}  ${String(share).padStart(3)}%  ${bar}` +
        (row.label && row.label !== bucketFor(row.ms) ? `   (listed as "${row.label}", measured "${bucketFor(row.ms)}")` : "")
    );
  }
  say("");
  say(`  ${"total".padEnd(width)}  ${fmt(totalMs).padStart(8)}`);
}

// --- run: the chain, timed ---------------------------------------------------

function runChain() {
  if (!STAGES.length) {
    console.error("✗ gate timings: package.json declares no `check:ci` chain to run.");
    return 1;
  }

  say(`npm run check:ci — ${STAGES.length} stages, timed. Cheapest first; the first red stops the run.`);
  say("");

  const measured = {};
  const rows = [];
  let failed = null;
  const startedAt = Date.now();

  for (const stage of STAGES) {
    const t0 = Date.now();
    const res = spawnSync("npm", ["run", stage], { cwd: ROOT, stdio: "inherit", shell: true });
    const ms = Date.now() - t0;
    measured[stage] = ms;
    rows.push({ stage, ms, label: labelOf(stage) });
    if (res.status !== 0) {
      failed = { stage, ms, status: res.status ?? 1 };
      break;
    }
  }

  const totalMs = Date.now() - startedAt;

  // Record before judging: a red run's timings are the ones that answer "why did
  // that take so long before it told me?"
  const log = readJson(LOG) ?? { schema: 1, runs: [] };
  log.runs = [
    ...(Array.isArray(log.runs) ? log.runs : []),
    {
      at: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      ci: Boolean(process.env.CI),
      complete: !failed,
      failedAt: failed?.stage ?? null,
      totalMs,
      stages: measured,
    },
  ].slice(-KEEP_RUNS);
  write(LOG, log);

  say("");
  say(failed ? `✗ check:ci stopped at \`${failed.stage}\` after ${fmt(totalMs)}.` : `✓ check:ci green in ${fmt(totalMs)}.`);
  say("");
  table(rows, totalMs);

  if (failed) {
    say("");
    say(`  → \`npm run gates -- --stage ${failed.stage}\` prints what to do next.`);
    flushSummary();
    return failed.status;
  }

  // The ordering, judged on the medians rather than on this one run.
  const medians = mediansFrom(log);
  const judged = STAGES.map((stage) => ({
    stage,
    ms: medians[stage]?.medianMs ?? measured[stage],
    label: labelOf(stage),
  }));
  const problems = orderingProblems(judged);
  if (problems.length) {
    say("");
    say(`✗ the chain is no longer ordered cheapest-first (${problems.length} finding(s)):`);
    for (const p of problems) say(`  • ${p}`);
    say("");
    say("  The order is the whole reason a wrong change is refused in seconds instead of after a build.");
    say("  See docs/adr/0007-gate-rung-discipline.md and scripts/gate-remedy.mjs.");
    flushSummary();
    return 1;
  }

  const slowest = [...judged].sort((a, b) => b.ms - a.ms)[0];
  say("");
  say(`  Cheapest-first holds. The gate is dominated by \`${slowest.stage}\` (${fmt(slowest.ms)} median).`);
  say(`  Rolling measurements: .gate-timings.json (${log.runs.length} run(s), git-ignored).`);
  say('  Record the current shape: npm run gates:timings -- --accept --reason "…"');
  flushSummary();
  return 0;
}

// --- report / check / accept --------------------------------------------------

function rowsFromRecords(records) {
  return STAGES.filter((s) => records[s]).map((stage) => ({
    stage,
    ms: records[stage].medianMs,
    label: labelOf(stage),
  }));
}

function report() {
  const log = readJson(LOG);
  const baseline = readJson(BASELINE);
  const medians = mediansFrom(log ?? { runs: [] });

  if (baseline?.stages && Object.keys(baseline.stages).length) {
    say(`Recorded baseline — ${baseline.measuredOn ?? "date unknown"} (${baseline.runs ?? "?"} run(s))`);
    say("");
    const rows = rowsFromRecords(baseline.stages);
    table(rows, rows.reduce((a, r) => a + r.ms, 0));
    say("");
  } else {
    say("No baseline recorded yet (.github/gate-timings.json).");
    say("");
  }

  if (Object.keys(medians).length) {
    say(`Rolling measurement — ${(log?.runs ?? []).length} run(s) on this machine (.gate-timings.json)`);
    say("");
    const rows = rowsFromRecords(medians);
    table(rows, rows.reduce((a, r) => a + r.ms, 0));
  } else {
    say("Nothing measured on this machine yet — run `npm run check:ci:timed`.");
  }
  flushSummary();
  return 0;
}

function check() {
  const baseline = readJson(BASELINE);
  const records = baseline?.stages ?? {};
  const missing = STAGES.filter((s) => !records[s]);

  if (!Object.keys(records).length) {
    say("No gate timings recorded yet, so there is no measured order to hold the chain to.");
    say('  npm run check:ci:timed  →  npm run gates:timings -- --accept --reason "…"');
    flushSummary();
    return 0;
  }

  const rows = rowsFromRecords(records);
  table(rows, rows.reduce((a, r) => a + r.ms, 0));
  const problems = orderingProblems(rows);
  if (missing.length) {
    say("");
    say(`  • ${missing.length} stage(s) added since the baseline was recorded: ${missing.join(", ")}`);
    say('    Re-record: npm run check:ci:timed, then npm run gates:timings -- --accept --reason "…"');
  }
  if (problems.length) {
    say("");
    say(`✗ the recorded timings say the chain is not cheapest-first (${problems.length} finding(s)):`);
    for (const p of problems) say(`  • ${p}`);
    flushSummary();
    return 1;
  }
  say("");
  say("✓ no stage runs after one that measures in a slower bucket than it does.");
  flushSummary();
  return 0;
}

function failures() {
  const log = readJson(LOG);
  const { counts, red, runs } = failureCountsFrom(log);

  say(`First-failure ranking — ${red} red run(s) of ${runs} recorded in .gate-timings.json`);
  say("");
  if (!red) {
    say("  Nothing has gone red on this machine yet, so there is no ranking to read.");
    say("  The log only fills from `npm run check:ci:timed` (what CI runs), and it keeps the last 20 runs.");
    flushSummary();
    return 0;
  }

  const width = Math.max(...STAGES.map((s) => s.length), 12);
  const ranked = STAGES.map((stage, position) => ({ stage, position, hits: counts[stage] ?? 0 })).sort(
    (a, b) => b.hits - a.hits || a.position - b.position
  );
  for (const row of ranked) {
    if (!row.hits) continue;
    const share = Math.round((row.hits / red) * 100);
    say(
      `  ${row.stage.padEnd(width)}  ${String(row.hits).padStart(3)} red  ${String(share).padStart(3)}%  ` +
        `runs ${row.position + 1} of ${STAGES.length}`
    );
  }

  const worst = ranked[0];
  say("");
  say(
    `  The gate a change here trips first is \`${worst.stage}\`, and it runs ${worst.position + 1} of ` +
      `${STAGES.length}. Everything before it is what a contributor waits through to be told.`
  );
  say("  Cost decides the halves of this chain; inside the cheap half, this is the number to move a gate on.");
  say("  Nothing is enforced from these counts — a ranking from a handful of runs is noise.");
  flushSummary();
  return 0;
}

function accept() {
  const log = readJson(LOG);
  const medians = mediansFrom(log ?? { runs: [] });
  if (!Object.keys(medians).length) {
    console.error("✗ nothing measured yet — run `npm run check:ci:timed` first.");
    return 1;
  }
  if (!REASON || REASON.trim().length < 20) {
    console.error(
      '✗ --accept needs --reason "…" (20+ characters): what the gate costs now and why that is the right shape. ' +
        "The number is the easy half; the sentence is what a reader six months from now needs."
    );
    return 1;
  }

  const previous = readJson(BASELINE);
  const complete = (log?.runs ?? []).filter((r) => r.complete).length;
  const today = new Date().toISOString().slice(0, 10);
  const totalMs = STAGES.reduce((a, s) => a + (medians[s]?.medianMs ?? 0), 0);
  const doc = {
    schema: 1,
    $comment:
      "What `npm run check:ci` costs, per stage, measured by scripts/gate-timings.mjs. The chain is ordered " +
      "cheapest-first and that order is enforced against THESE numbers, not against a hand-written label. " +
      'Re-record with: npm run check:ci:timed, then npm run gates:timings -- --accept --reason "…".',
    measuredOn: today,
    node: process.version,
    platform: process.platform,
    runs: complete,
    totalMs,
    stages: Object.fromEntries(
      STAGES.filter((s) => medians[s]).map((s) => [
        s,
        { medianMs: medians[s].medianMs, samples: medians[s].samples, bucket: bucketFor(medians[s].medianMs) },
      ])
    ),
    history: [
      ...(previous?.history ?? []),
      { on: today, reason: REASON.trim(), totalMs, wasMs: previous?.totalMs ?? null },
    ].slice(-20),
  };
  write(BASELINE, doc);
  say(`✓ recorded ${Object.keys(doc.stages).length} stage timings in .github/gate-timings.json (total ${fmt(doc.totalMs)}).`);
  say("  Commit it with the change that made it true.");
  return 0;
}

// --- CLI ---------------------------------------------------------------------

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  let code = 0;
  if (ACCEPT) code = accept();
  else if (FAILURES) code = failures();
  else if (CHECK) code = check();
  else if (REPORT) code = report();
  else code = runChain();
  process.exit(code);
}
