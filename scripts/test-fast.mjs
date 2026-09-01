#!/usr/bin/env node
/** The fast lane: the tests that claim what you just edited (zero-dependency).
 *
 *  WHY THIS EXISTS. There are 489 test files behind one `test:unit` step, and
 *  `check:ci` runs fourteen gates in front of it. That chain is the right shape
 *  for a gate and the wrong shape for feedback: when the only honest signal takes
 *  minutes, it is run once, at push time, after a dozen more edits have been built
 *  on top of the mistake. Latency is what decides whether a check is consulted or
 *  merely satisfied — and an agent optimising for a green gate at the end of a run
 *  is exactly the reader that behaviour costs the most.
 *
 *  WHAT IT IS NOT. It is not a gate and must never become one. `npm run test:unit`
 *  inside `check:ci` inside `.husky/pre-push` is what decides a build, and a subset
 *  that can be green while the suite is red must not be mistakeable for it — so
 *  this script prints what it did NOT run, every time, and says so on the way out.
 *
 *  HOW THE SELECTION WORKS. Two parts, and neither is a hand-kept mapping:
 *
 *    always    — .github/test-tiers.json names the maps and censuses that any diff
 *                can break regardless of what it touched. They are pure (they read
 *                files and run nothing), so they cost almost nothing to include,
 *                and they are what an agent's changes break most often.
 *    claimed   — every test file whose SOURCE mentions a file you changed: by repo
 *                path, by its `@/` module specifier, or by filename. The mapping is
 *                therefore maintained by the tests themselves and cannot rot the
 *                way a listed one does.
 *
 *  A changed file that no test names is REPORTED rather than skipped over. That is
 *  a fact about coverage worth seeing at the moment you are still holding the
 *  change, and a silent green would spend it.
 *
 *  Usage:
 *    npm run test:fast                    # working-tree changes vs HEAD
 *    npm run test:fast -- --base origin/master
 *    npm run test:fast -- --list          # what it would run, and why
 *    npm run test:fast -- --check         # also fail when it runs over budget
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TIERS = join(ROOT, ".github", "test-tiers.json");
const TEST_DIR = join(ROOT, "test-unit");

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const LIST = argv.includes("--list");
const CHECK = argv.includes("--check");
const BASE = arg("--base");

if (!existsSync(TIERS)) {
  console.error(`✗ test:fast: ${TIERS} is missing — it names the always-on tier and the budget.`);
  process.exit(1);
}
const tiers = JSON.parse(readFileSync(TIERS, "utf8"));

const git = (args) => {
  const res = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return res.status === 0 ? res.stdout : null;
};

/** What you have changed. The default is the working tree, because that is what a
 *  reader mid-edit is holding; `--base <ref>` asks the same question of a branch. */
function changedFiles() {
  const out = BASE
    ? git(["diff", "--name-only", "--diff-filter=ACMR", `${BASE}...HEAD`])
    : [git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]), git(["ls-files", "--others", "--exclude-standard"])]
        .filter((s) => s !== null)
        .join("\n");
  if (out === null) return null; // no git: fall back to the always tier
  return [...new Set(out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
}

const allTests = existsSync(TEST_DIR)
  ? readdirSync(TEST_DIR)
      .filter((f) => f.endsWith(".test.mjs"))
      .map((f) => `test-unit/${f}`)
  : [];

/** The strings a test would use to reach `path`. `index` is dropped on purpose —
 *  every directory has one, and matching it would select the whole suite. */
function needlesFor(path) {
  const noExt = path.replace(/\.[a-z]+$/i, "");
  const base = noExt.split("/").pop();
  const needles = [path, noExt];
  if (noExt.startsWith("src/")) needles.push(`@/${noExt.slice(4)}`);
  if (base && base !== "index" && base.length >= 4) needles.push(base);
  return needles;
}

const changed = changedFiles();
const always = (tiers.always ?? []).filter((p) => existsSync(join(ROOT, p)));
const selected = new Set(always);
const claimedBy = new Map(); // changed file → the tests that name it
const unclaimed = [];

if (changed && changed.length) {
  const sources = new Map(allTests.map((t) => [t, readFileSync(join(ROOT, t), "utf8")]));
  for (const path of changed) {
    if (path.startsWith("test-unit/") && path.endsWith(".test.mjs")) {
      if (existsSync(join(ROOT, path))) {
        selected.add(path);
        claimedBy.set(path, [path]);
      }
      continue;
    }
    const needles = needlesFor(path);
    const hits = allTests.filter((t) => needles.some((n) => sources.get(t).includes(n)));
    if (hits.length) {
      for (const t of hits) selected.add(t);
      claimedBy.set(path, hits);
    } else {
      unclaimed.push(path);
    }
  }
}

const files = [...selected].sort();

console.log(`test:fast — ${files.length} of ${allTests.length} unit suite(s)`);
console.log("");
if (changed === null) {
  console.log("  git is not available here, so nothing could be selected by change — running the always tier only.");
} else {
  console.log(`  changed: ${changed.length} file(s)${BASE ? ` against ${BASE}` : " in the working tree"}`);
  for (const [path, tests] of claimedBy) console.log(`    ${path} → ${tests.length} suite(s)`);
}
console.log(`  always:  ${always.length} suite(s) (.github/test-tiers.json)`);
if (unclaimed.length) {
  console.log("");
  console.log(`  ⚠ ${unclaimed.length} changed file(s) that no test names:`);
  for (const p of unclaimed.slice(0, 10)) console.log(`      ${p}`);
  if (unclaimed.length > 10) console.log(`      … and ${unclaimed.length - 10} more`);
  console.log("    Not a failure — a fact about coverage, worth reading while you still hold the change.");
}
console.log("");

if (LIST) {
  for (const f of files) console.log(`  ${f}`);
  process.exit(0);
}

const started = Date.now();
const res = spawnSync(
  process.execPath,
  [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--conditions",
    "react-server",
    "--import",
    "./test-llm/setup.mjs",
    "--experimental-test-module-mocks",
    "--test",
    ...files,
  ],
  { cwd: ROOT, stdio: "inherit" }
);
const seconds = (Date.now() - started) / 1000;

const budget = Number(tiers.budgetSeconds ?? 0);
console.log("");
console.log(`test:fast — ${seconds.toFixed(1)}s for ${files.length} suite(s)${budget ? ` (budget ${budget}s)` : ""}`);
console.log(
  `  This is NOT the gate. ${allTests.length - files.length} suite(s) did not run, and neither did typecheck, ` +
    "lint, build or any of the fourteen gates in front of them — `npm run check:ci` is what decides a build."
);

let overBudget = false;
if (budget && seconds > budget) {
  overBudget = true;
  console.log("");
  console.log(
    `  ✗ over the ${budget}s budget in .github/test-tiers.json. A fast lane that stops being fast stops being ` +
      "run — trim the always tier, or find the suite that got slow. Raising the budget to make this pass is the " +
      "softening AGENTS.md § Red names outright."
  );
}

if (res.status !== 0) process.exit(res.status ?? 1);
process.exit(CHECK && overBudget ? 1 : 0);
