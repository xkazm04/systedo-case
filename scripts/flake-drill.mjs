#!/usr/bin/env node
/** Does the suite give the SAME answer twice? — the nondeterminism drill
 *  (zero-dependency).
 *
 *  WHY THIS EXISTS. `npm run test:unit` is a blocking stage of `check:ci`, and
 *  `check:ci` is what `.husky/pre-push` runs before the push that ships master.
 *  There are 482 test files behind that gate plus a Playwright lane, and nothing
 *  in this repository has ever asked whether they agree with themselves. That
 *  matters more here than the count does: a gate that fails one run in twenty
 *  teaches the person waiting on it to press the button again, and once re-running
 *  is the habit, a REAL red is indistinguishable from the noise. It is the cheapest
 *  way to lose a gate without anybody removing it — nothing goes red, nothing gets
 *  softened, the fence simply stops being read.
 *
 *  It is also the failure mode this tree is most exposed to. The suite shells out
 *  to gates that write files (`scripts/contract-ledger.mjs` against a temp fixture,
 *  the revert and mutation drills, the fence-firings trail), reads the clock, and
 *  runs its files concurrently by default. Every one of those is a place where the
 *  answer can depend on the order the runner happened to pick.
 *
 *  WHAT IT DOES. Runs the whole unit suite N times (default 3), parses each run's
 *  TAP output down to individual test names, and reports every test whose OUTCOME
 *  changed between runs — passed once, failed once — or that appeared in some runs
 *  and not others. The runs are deliberately not identical: file-level concurrency
 *  is varied between them, because a test that depends on interleaving is the one
 *  a repeat under identical conditions is least likely to catch.
 *
 *  It does NOT vary `TZ`. CI pins `TZ=Europe/Prague` because the format goldens are
 *  minted in it (.github/workflows/ci.yml), so a run in another zone fails for a
 *  reason that is correct rather than flaky, and reporting that as nondeterminism
 *  would be the drill lying in the alarming direction.
 *
 *  WHAT HAPPENS TO A FINDING. `.github/flaky-tests.json` is the quarantine
 *  register: a flake stays a red drill until somebody writes down which test it is,
 *  why it is nondeterministic, and what is going to be done about it. There are
 *  three honest answers — fix it, quarantine it while it is fixed, delete it if it
 *  was never asserting anything — and the register makes the maintainer pick one in
 *  writing. It is NOT a skip list: nothing here stops a quarantined test running or
 *  failing the build. It is the list of flakes somebody has looked at, and its
 *  length is capped by a ceiling in `.github/contract-ledger.json`, so it cannot
 *  grow one line per inconvenient week.
 *
 *  RUNG: reporting (docs/adr/0007-gate-rung-discipline.md). It runs the whole suite
 *  several times over, so it can never sit in `check:ci` or the pre-push hook, and
 *  it is deliberately absent from .github/required-checks.json. It runs weekly in
 *  .github/workflows/flake-watch.yml, where the job's conclusion IS the verdict.
 *  What blocks on every build is the REGISTER's shape
 *  (test-unit/flake-census.test.mjs) — an entry naming a test file that is gone, or
 *  a quarantine with no plan, is a register that has stopped describing the suite.
 *
 *  IT WRITES NOTHING INTO THE TREE. The suite is run as-is; no file is edited, so
 *  there is no restore contract to get wrong (unlike the revert and mutation
 *  drills, which is why those have one).
 *
 *  HONEST LIMITS, printed with every run: N runs can only find a flake whose rate
 *  is high enough to show up in N; it measures the unit suite, not Playwright; and
 *  it runs on one machine, so a flake that needs a slower or busier runner is
 *  invisible here.
 *
 *  Usage:
 *    npm run flake:drill                    # 3 runs, print the verdict
 *    npm run flake:drill -- --runs 5
 *    npm run flake:drill -- --list          # what is currently quarantined
 *    npm run flake:drill -- --out f.json --report f.md --summary "$GITHUB_STEP_SUMMARY"
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The one declaration of "how this repository runs its unit suite" lives with the
// mutation catalogue, parsed out of package.json rather than restated. Importing it
// here means a new loader flag on `test:unit` arrives in this drill for free — the
// alternative is two drills that disagree about what the suite is.
import { unitTestFlags } from "./mutation-catalogue.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTER = join(ROOT, ".github", "flaky-tests.json");

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const OUT = arg("--out");
const REPORT = arg("--report");
const SUMMARY = arg("--summary");
const RUNS = Math.max(2, Number(arg("--runs") ?? 3) || 3);

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

/** What a green drill still does NOT prove. Printed with every run, because a
 *  "no flakes found" with no limit next to it reads as a guarantee. Deliberately
 *  not exported: importing this module RUNS the suite, so nothing may read it as
 *  data (the mutation catalogue is a separate, side-effect-free file for exactly
 *  that reason). */
const CANNOT_SEE = [
  `a flake rarer than roughly 1 in ${RUNS} — this is a sample, not a proof; the register is where a rare one ` +
    "that was seen once still gets written down",
  "the Playwright lane: `npm run test:e2e` is a browser and a dev server, and its nondeterminism is a " +
    "different measurement on a different budget",
  "a flake that needs a slower, busier or differently-sized runner than the one this ran on",
  "a test that is deterministic and wrong — that is what npm run mutation:drill asks",
];

// --- the quarantine register --------------------------------------------------

function readRegister() {
  if (!existsSync(REGISTER)) {
    return { error: `${REGISTER} does not exist — it is the record this drill keeps.`, quarantined: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(REGISTER, "utf8"));
    return { error: null, quarantined: Array.isArray(parsed.quarantined) ? parsed.quarantined : [] };
  } catch (err) {
    return { error: `.github/flaky-tests.json is not parseable JSON — ${err.message}`, quarantined: [] };
  }
}

const register = readRegister();
if (register.error) {
  console.error(`✗ flake-drill: ${register.error}`);
  process.exit(1);
}

if (argv.includes("--list")) {
  console.log("Quarantined tests (.github/flaky-tests.json):\n");
  if (!register.quarantined.length) console.log("  (none — nothing has been accepted as flaky)");
  for (const q of register.quarantined) {
    console.log(`  ${q.test}`);
    console.log(`    file:      ${q.file}`);
    console.log(`    seen:      ${q.firstSeen}`);
    console.log(`    why:       ${q.why}`);
    console.log(`    plan:      ${q.plan}`);
    console.log("");
  }
  process.exit(0);
}

// --- running the suite --------------------------------------------------------

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const script = String(pkg.scripts?.["test:unit"] ?? "");
const FLAGS = unitTestFlags(script);
/** Everything after `--test` in the npm script: the glob the suite runs over,
 *  with the shell quoting the script carries stripped. Node expands it itself. */
const TARGETS = (script.split(/\s--test\s/)[1] ?? "")
  .trim()
  .split(/\s+/)
  .map((t) => t.replace(/^["']|["']$/g, ""))
  .filter(Boolean);

if (!FLAGS || !TARGETS.length) {
  console.error("✗ flake-drill: could not read the node flags and target out of the `test:unit` script.");
  console.error("  The drill runs the same suite the repository runs; it will not invent a command.");
  console.error("  (test-unit/flake-census.test.mjs fails on the same build, with the same reason.)");
  process.exit(1);
}

/** 64 MB for the same reason the other drills use it: a truncated child exits
 *  non-zero, and a buffer limit must never be able to look like a finding. */
const runOpts = { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };

/**
 * One run's results, keyed by a full test path (`file › test › subtest`).
 *
 * Node's TAP reporter announces a subtest with `# Subtest: <name>` at the child's
 * own indentation BEFORE its body, and closes it with `ok`/`not ok` at that same
 * indentation afterwards. So the enclosing names are known by the time a result
 * line arrives, which is what makes a full path recoverable from the stream.
 */
function parseTap(text) {
  const results = new Map();
  const stack = [];
  for (const raw of text.split(/\r?\n/)) {
    const indent = raw.length - raw.replace(/^\s*/, "").length;
    const depth = Math.floor(indent / 4);
    const line = raw.trim();

    const sub = /^# Subtest: (.*)$/.exec(line);
    if (sub) {
      stack.length = depth;
      stack[depth] = sub[1];
      continue;
    }

    const res = /^(not ok|ok) \d+ - (.*)$/.exec(line);
    if (!res) continue;
    // A directive (`# SKIP`, `# TODO`) is not an outcome anybody chose, and a
    // conditionally-skipped test would otherwise read as a flake.
    const name = res[2].replace(/\s+#\s+(SKIP|TODO)\b.*$/i, "");
    if (name !== res[2]) continue;
    const path = [...stack.slice(0, depth), name].join(" › ");
    // A file and each test inside it get their own path, so a parent's `not ok`
    // and the child's both survive — comparing them across runs is what turns "the
    // suite went red" into "this test did". First write wins on a repeated path,
    // which a test that runs twice under the same name would otherwise blur.
    if (!results.has(path)) results.set(path, res[1] === "ok");
  }
  return results;
}

say(`Flake drill — ${RUNS} runs of the unit suite, varying file concurrency between them`);
say("");

const runs = [];
for (let i = 0; i < RUNS; i++) {
  // Alternate serial and default (CPU-count) file concurrency. A test that depends
  // on the order or the interleaving the runner happened to pick is exactly the one
  // a repeat under identical conditions will not catch.
  const serial = i % 2 === 1;
  const extra = serial ? ["--test-concurrency=1"] : [];
  const started = Date.now();
  const res = spawnSync(
    process.execPath,
    [...FLAGS, ...extra, "--test-reporter=tap", "--test", ...TARGETS],
    runOpts
  );
  const seconds = (Date.now() - started) / 1000;
  if (res.error) {
    console.error(`✗ flake-drill: could not run the suite — ${res.error.message}`);
    process.exit(1);
  }
  const text = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const results = parseTap(text);
  if (!results.size) {
    console.error("✗ flake-drill: the run produced no parseable TAP results.");
    console.error("  Either the suite did not start, or node's TAP output has changed shape. Its last lines:");
    for (const l of text.trim().split(/\r?\n/).slice(-12)) console.error(`    ${l}`);
    process.exit(1);
  }
  const failed = [...results].filter(([, ok]) => !ok).length;
  runs.push({ concurrency: serial ? "serial" : "default", seconds: Number(seconds.toFixed(1)), red: res.status !== 0, failed, results });
  say(`  run ${i + 1}  ${serial ? "serial " : "default"}  ${seconds.toFixed(1)}s  ${failed} failing, ${results.size} results`);
}
say("");

// --- the verdict ---------------------------------------------------------------

const everyPath = new Set(runs.flatMap((r) => [...r.results.keys()]));
const unstable = [];
for (const path of everyPath) {
  const seen = runs.map((r) => r.results.get(path));
  const passed = seen.filter((v) => v === true).length;
  const failed = seen.filter((v) => v === false).length;
  const absent = seen.filter((v) => v === undefined).length;
  // Two shapes of nondeterminism, and the second is the sneakier one: a test that
  // sometimes does not run at all reports nothing rather than reporting red.
  if (passed && failed) unstable.push({ test: path, kind: "outcome", passed, failed, absent });
  else if (absent && (passed || failed)) unstable.push({ test: path, kind: "presence", passed, failed, absent });
}
unstable.sort((a, b) => a.test.localeCompare(b.test));

const quarantined = new Set(register.quarantined.map((q) => q.test));
const newFlakes = unstable.filter((u) => !quarantined.has(u.test));
const stale = register.quarantined.filter((q) => !unstable.some((u) => u.test === q.test));
/** Red in EVERY run is not a flake — it is a red suite, and calling it flaky is
 *  precisely the conclusion this drill exists to stop people reaching for. */
const alwaysRed = runs.every((r) => r.red) && !unstable.length;

const verdict = {
  ranAt: new Date().toISOString(),
  runs: runs.map(({ concurrency, seconds, red, failed }) => ({ concurrency, seconds, red, failed })),
  tests: everyPath.size,
  unstable,
  newFlakes: newFlakes.map((f) => f.test),
  quarantined: [...quarantined],
  stale: stale.map((q) => q.test),
  alwaysRed,
};

say("| Date | Runs | Tests | Unstable | Unregistered | Quarantined |");
say("| --- | ---: | ---: | ---: | ---: | ---: |");
say(
  `| ${verdict.ranAt.slice(0, 10)} | ${RUNS} | ${everyPath.size} | ${unstable.length} | ` +
    `${newFlakes.length ? `**${newFlakes.length}**` : "0"} | ${quarantined.size} |`
);
say("");

if (unstable.length) {
  say("### Tests that did not agree with themselves");
  say("");
  for (const u of unstable) {
    const known = quarantined.has(u.test) ? " _(quarantined)_" : "";
    say(`- \`${u.test}\` — ${u.kind}: passed ${u.passed}, failed ${u.failed}, absent ${u.absent}${known}`);
  }
  say("");
}
if (stale.length) {
  say(
    `### ${stale.length} quarantined test(s) did not flake this run — a candidate to take off the register ` +
      "(.github/flaky-tests.json), which also lowers its ceiling in .github/contract-ledger.json."
  );
  say("");
  for (const t of stale.map((q) => q.test)) say(`- \`${t}\``);
  say("");
}
for (const line of CANNOT_SEE) say(`  · a clean drill does not cover: ${line}`);

if (OUT) {
  try {
    writeFileSync(OUT, `${JSON.stringify(verdict, null, 2)}\n`);
  } catch (err) {
    console.error(`(flake-drill: could not write ${OUT} — ${err.message})`);
  }
}
if (REPORT) {
  // The dated record, in the form the trail issue publishes. Not committed: master
  // ships on push, so a commit from a scheduled job would be a release.
  try {
    writeFileSync(
      REPORT,
      ["## Flake drill — does the suite agree with itself?", "", `_Run ${verdict.ranAt}._`, "", ...out, ""].join("\n")
    );
  } catch (err) {
    console.error(`(flake-drill: could not write ${REPORT} — ${err.message})`);
  }
}
if (SUMMARY) {
  try {
    appendFileSync(SUMMARY, `### Flake drill\n\n${out.join("\n")}\n`);
  } catch (err) {
    console.error(`(flake-drill: could not write the summary — ${err.message})`);
  }
}

if (alwaysRed) {
  console.error("");
  console.error("✗ flake-drill: the unit suite was red in every run, with the same tests failing each time.");
  console.error("  That is a red build, not a flake. Fix it with `npm run test:unit` — and do NOT put a");
  console.error("  consistently failing test on the quarantine register: the register is for tests that");
  console.error("  disagree with themselves, and a permanently red one hidden there is a deleted test with");
  console.error("  extra steps (rubric A3).");
  process.exit(1);
}
if (newFlakes.length) {
  console.error("");
  console.error(`✗ flake-drill: ${newFlakes.length} test(s) did not agree with themselves and are not on the register.`);
  for (const f of newFlakes) console.error(`  • ${f.test} (${f.kind})`);
  console.error("");
  console.error("  That is the drill's FINDING, not its bug. `npm run test:unit` is a blocking stage of");
  console.error("  check:ci, so a test that fails at random teaches whoever is waiting to press the button");
  console.error("  again — and after that a real red looks the same as the noise.");
  console.error("");
  console.error("  Pick one, in writing, in .github/flaky-tests.json:");
  console.error("    fix        — the usual answer; the nondeterminism is normally a shared temp file, the");
  console.error("                 clock, or an assumption about the order node ran the files in.");
  console.error("    quarantine — record it while it is being fixed. Its ceiling in");
  console.error("                 .github/contract-ledger.json has to move in the same diff, so a growing");
  console.error("                 register is a line a reviewer reads.");
  console.error("    delete     — if it was never asserting anything. Needs an `Ack:` line (rubric A3).");
  console.error("");
  console.error("  What is NOT on that list is re-running until it is green.");
  process.exit(1);
}

say("");
say(
  `✓ flake drill: ${everyPath.size} tests gave the same answer in all ${RUNS} runs, under both serial and ` +
    "concurrent file execution."
);
process.exit(0);
