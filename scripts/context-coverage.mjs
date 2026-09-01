#!/usr/bin/env node
/** Which CONTEXTS have a test pointing at them — the number a global ratio hides.
 *  (zero-dependency, ADR-0008)
 *
 *  WHY THIS EXISTS. There are 515 test files here and a healthy test-to-source
 *  ratio, and both numbers are taken over the repository. The unit an agent
 *  actually works in is the CONTEXT: `context-map.json` scopes every tracked source
 *  file into 117 of them, AGENTS.md tells a run to scope its edits to one, and
 *  `.github/context-conventions.json` routes the sharp local rules by context name.
 *  A context with no test at all moves a repository-wide ratio by a fraction of a
 *  percent — which is to say it does not move it — so the one shape this suite could
 *  not see was a whole feature area nothing claims.
 *
 *  That matters more here than the aggregate does, because the aggregate is already
 *  strong. `npm run mutation:drill` asks whether a wrong answer would be caught on
 *  six named seams; this asks the question in front of it: is there a test pointing
 *  at this area of the map at all?
 *
 *  WHAT A CLAIM IS. A test claims a source file when the test's own text NAMES it —
 *  by repo path (`src/lib/cron/fan-out.ts`) or by its `@/` module specifier
 *  (`@/lib/cron/fan-out`). Derived from the tests, so it cannot rot the way a
 *  hand-kept mapping does; the same principle `scripts/test-fast.mjs` selects on.
 *
 *  AND IT IS DELIBERATELY STRICTER THAN THAT SELECTOR. `test-fast` also matches a
 *  bare FILENAME, which is right for choosing what to run (a false positive costs a
 *  few seconds) and wrong for a coverage claim: half the files under `src/app/` are
 *  called `route.ts` or `page.tsx`, and a matcher that accepts a bare filename would
 *  report the whole App Router as covered by whichever test happens to say the word
 *  "route". A census that overstates coverage is worse than no census.
 *
 *  WHAT IT CANNOT SEE, and the reason the numbers below are not called coverage:
 *  naming a file is not exercising it. A test that imports a module to assert its
 *  shape claims it here exactly as loudly as one that drives its behaviour. This
 *  measures ATTENTION — whether anything in the suite is pointed at this part of the
 *  map — and the question of whether that attention is worth anything is what
 *  `npm run mutation:drill` answers, on the seams where wrong is a bill or a breach.
 *
 *  TWO RUNGS (docs/adr/0007-gate-rung-discipline.md):
 *
 *    BLOCKING   the FLOORS in .github/context-test-floors.json, run from
 *               test-unit/context-coverage.test.mjs on every build. A handful of
 *               contexts — the chokepoint, the metering, the store backend, the ad
 *               writes, the cron spine — may not fall to zero claimed files. Each
 *               passes today, so a red is a regression this change introduced.
 *    REPORTING  the census itself: how many contexts have nothing pointing at them,
 *               ranked, with the credential-path ones marked. It is a list to work
 *               through, not a count to satisfy, and it carries no accepted ceiling
 *               until somebody has run it (`--accept`), because a baseline invented
 *               without measuring is what tsconfig.strict.json names as the thing
 *               that must not happen.
 *
 *  A NEW CONTEXT STARTS WITH NO FLOOR. The Personas scan creates contexts; a floor
 *  that arrived with one would be a red build caused by a rescan, which teaches
 *  people to distrust the rescan rather than to write the test. New contexts appear
 *  in the ranked report instead, and a floor is added on purpose — one line, with the
 *  reason, the same shape as every other pin here.
 *
 *  Usage:
 *    npm run context:coverage                        the census, ranked
 *    npm run context:coverage -- --context cron-jobs one context, file by file
 *    npm run context:coverage -- --uncovered         only the contexts nothing names
 *    npm run context:coverage:check                  …and fail on a floor breach
 *    npm run context:coverage -- --accept --reason "…"   pin today's uncovered count
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const MAP_REL = "context-map.json";
export const FLOORS_REL = ".github/context-test-floors.json";

/** Where tests live. `test-unit/` is the gate; `tests/` is the Playwright lane, and
 *  a page that only an e2e spec names is still a page something is pointed at. */
export const TEST_DIRS = ["test-unit", "tests"];

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));

/** Repo-relative, forward-slashed. */
export const norm = (p) => String(p ?? "").split("\\").join("/").replace(/^\.\//, "");

/** A file's path with its extension removed — the form an `@/` specifier is written
 *  in, and therefore the form both sides of the comparison are reduced to. */
export const stripExt = (p) => String(p).replace(/\.[a-z0-9]+$/i, "");

/** Every path-shaped token a test's text mentions, normalised to `src/…` and to
 *  both its extensioned and extensionless forms.
 *
 *  Built once over the whole suite and then queried per file, because the naive
 *  shape of this — for each of ~1200 mapped files, scan ~530 test sources for three
 *  needles — is a few gigabytes of string scanning inside a test that runs on every
 *  build.
 */
export function claimTokens(text) {
  const tokens = new Set();
  for (const raw of String(text).match(/(?:@\/|src\/)[A-Za-z0-9_@.\-/]+/g) ?? []) {
    // Trailing punctuation: a path at the end of an English sentence, or before a
    // closing quote that the character class already stopped at.
    const cleaned = raw.replace(/[./]+$/, "");
    const asSrc = cleaned.startsWith("@/") ? `src/${cleaned.slice(2)}` : cleaned;
    tokens.add(asSrc);
    tokens.add(stripExt(asSrc));
  }
  return tokens;
}

/** Every test source in the tree, keyed by repo-relative path. Recursive, because
 *  `test-unit/fixtures/` and `tests/*-snapshots/` exist and a helper module that
 *  names a file is as good a claim as a `.test.mjs` that does. */
export function readTestSources({ root = ROOT, dirs = TEST_DIRS } = {}) {
  const sources = new Map();
  const walk = (abs, rel, depth) => {
    if (depth > 4 || !existsSync(abs)) return;
    for (const entry of readdirSync(abs)) {
      const childAbs = join(abs, entry);
      const childRel = `${rel}/${entry}`;
      let stats;
      try {
        stats = statSync(childAbs);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        walk(childAbs, childRel, depth + 1);
        continue;
      }
      if (!/\.(mjs|js|ts|tsx)$/i.test(entry)) continue;
      sources.set(childRel, readFileSync(childAbs, "utf8"));
    }
  };
  for (const dir of dirs) walk(join(root, dir), dir, 0);
  return sources;
}

/**
 * The census: one row per context in the map.
 *
 * `files` counts only the context's SOURCE files (`src/…`). A context whose
 * `file_paths` are all tests, fixtures or config has nothing to be claimed and is
 * marked `sourceless` rather than counted as uncovered — the map does list test
 * files under some contexts, and reporting those as a coverage hole would be a
 * finding about the map rather than about the suite.
 */
export function census({ map = readJson(MAP_REL), sources = readTestSources() } = {}) {
  const claimed = new Set();
  for (const text of sources.values()) for (const token of claimTokens(text)) claimed.add(token);

  const rows = [];
  for (const context of map.contexts ?? []) {
    const files = [...new Set((context.file_paths ?? []).map(norm))].filter((p) => p.startsWith("src/"));
    const hit = files.filter((p) => claimed.has(p) || claimed.has(stripExt(p)));
    const miss = files.filter((p) => !claimed.has(p) && !claimed.has(stripExt(p)));
    rows.push({
      name: context.name,
      group: context.group ?? "",
      category: context.category ?? "",
      files: files.length,
      claimed: hit.length,
      unclaimed: miss,
      sourceless: files.length === 0,
    });
  }
  rows.sort((a, b) => a.claimed - b.claimed || b.files - a.files || String(a.name).localeCompare(String(b.name)));
  return { rows, totalContexts: rows.length, tests: sources.size };
}

/** The contexts with source files and nothing pointing at any of them. */
export const uncoveredRows = (rows) => rows.filter((r) => !r.sourceless && r.claimed === 0);

/**
 * The floors, resolved against the census.
 *
 * Two kinds of failure, and they read differently on purpose: a floor naming a
 * context the map no longer has is a ROUTING failure (the Personas scan renamed it
 * and the floor now guards nothing, which reads exactly like a floor that is being
 * met), and a floor that is not met is a COVERAGE failure.
 */
export function checkFloors({ rows, floors = readJson(FLOORS_REL) } = {}) {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const routing = [];
  const breaches = [];
  const seen = new Set();

  for (const floor of floors.floors ?? []) {
    const name = floor.context;
    if (!name) {
      routing.push(`${FLOORS_REL}: a floor names no \`context\`, so it guards nothing.`);
      continue;
    }
    if (seen.has(name)) {
      routing.push(`${FLOORS_REL}: \`${name}\` carries two floors — two answers to one question.`);
      continue;
    }
    seen.add(name);
    if (!floor.why || String(floor.why).length < 40) {
      routing.push(
        `${FLOORS_REL}: \`${name}\` has no \`why\`. A floor is a number that can fail a build; say what a zero here ` +
          "would cost, so the next reader can argue with it rather than raise it."
      );
    }
    const min = Number(floor.minClaimedFiles);
    if (!Number.isInteger(min) || min < 1) {
      routing.push(`${FLOORS_REL}: \`${name}\` declares no usable \`minClaimedFiles\` (got ${floor.minClaimedFiles}).`);
      continue;
    }
    const row = byName.get(name);
    if (!row) {
      routing.push(
        `${FLOORS_REL}: \`${name}\` is not a context in ${MAP_REL}. A rescan renamed or removed it, so this floor ` +
          "now guards nothing while continuing to read as a guard — re-point it at the context the code moved into."
      );
      continue;
    }
    if (row.claimed < min) {
      breaches.push({ name, claimed: row.claimed, min, files: row.files, unclaimed: row.unclaimed });
    }
  }
  return { routing, breaches };
}

const REASON_FILLER = /^(update|fix|chore|wip|because|reasons?|n\/?a|\.+)$/i;

/** The same bar every other `--accept` in this repository applies: a reason that
 *  says nothing is refused, because the record exists to be read later. */
export function reasonProblem(reason) {
  const r = String(reason ?? "").trim();
  if (!r) return "no --reason given. A baseline with no sentence behind it is a number nobody can argue with.";
  if (r.length < 12) return `the reason "${r}" is too short to tell a future reader what was measured and why.`;
  if (REASON_FILLER.test(r)) return `"${r}" is filler. Say what the count is and why pinning it here is right.`;
  return null;
}

// --- CLI ---------------------------------------------------------------------

const SELF = fileURLToPath(import.meta.url);
const ENTRY = process.argv[1] ? resolve(process.argv[1]) : "";
const invokedDirectly = ENTRY === SELF || ENTRY.toLowerCase() === SELF.toLowerCase();

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : null;
  };
  const CHECK = argv.includes("--check");
  const ACCEPT = argv.includes("--accept");
  const ONLY_UNCOVERED = argv.includes("--uncovered");
  const CONTEXT = arg("--context");

  const floors = readJson(FLOORS_REL);
  const { rows, totalContexts, tests } = census();
  const uncovered = uncoveredRows(rows);
  const { routing, breaches } = checkFloors({ rows, floors });

  if (CONTEXT) {
    const row = rows.find((r) => r.name === CONTEXT);
    if (!row) {
      console.error(`✗ ${MAP_REL} has no context named \`${CONTEXT}\`.`);
      process.exit(1);
    }
    console.log(`\n## ${row.name}  ·  ${row.group}  ·  ${row.category}`);
    console.log(`   ${row.claimed} of ${row.files} source file(s) named by a test.`);
    if (row.unclaimed.length) {
      console.log("\n   Named by nothing:");
      for (const p of row.unclaimed) console.log(`     ${p}`);
    }
    console.log("");
    process.exit(0);
  }

  console.log(`context:coverage — ${totalContexts} context(s) in ${MAP_REL}, against ${tests} test source(s)`);
  console.log("");

  const withSource = rows.filter((r) => !r.sourceless);
  const shown = ONLY_UNCOVERED ? uncovered : withSource;
  console.log("  claimed/files  context");
  for (const row of shown.slice(0, ONLY_UNCOVERED ? shown.length : 25)) {
    const floor = (floors.floors ?? []).find((f) => f.context === row.name);
    const mark = floor ? ` ← floor ${floor.minClaimedFiles}` : "";
    console.log(`   ${String(row.claimed).padStart(4)}/${String(row.files).padEnd(4)}   ${row.name}${mark}`);
  }
  if (!ONLY_UNCOVERED && shown.length > 25) console.log(`         …    and ${shown.length - 25} more, better covered`);
  console.log("");
  console.log(
    `  ${uncovered.length} of ${withSource.length} context(s) with source files have NOTHING pointing at them.` +
      (floors.accepted?.uncovered != null ? `  (accepted ceiling ${floors.accepted.uncovered})` : "  (no ceiling accepted yet)")
  );
  console.log(
    `  ${(floors.floors ?? []).length} context(s) carry a floor — the ones where zero is a credential, a bill or a ` +
      "breach rather than a gap."
  );
  console.log("");

  if (ACCEPT) {
    const problem = reasonProblem(arg("--reason"));
    if (problem) {
      console.error(`✗ context:coverage --accept: ${problem}`);
      process.exit(1);
    }
    const record = {
      ...floors,
      accepted: {
        uncovered: uncovered.length,
        contextsWithSource: withSource.length,
        at: new Date().toISOString().slice(0, 10),
        reason: String(arg("--reason")).trim(),
      },
      history: [...(floors.history ?? []), ...(floors.accepted ? [floors.accepted] : [])],
    };
    writeFileSync(join(ROOT, FLOORS_REL), `${JSON.stringify(record, null, 2)}\n`);
    console.log(`✓ ${FLOORS_REL}: ${uncovered.length} uncovered context(s) pinned. It may fall; it may not rise.`);
    process.exit(0);
  }

  let failed = false;

  if (routing.length) {
    failed = true;
    console.error(`✗ ${routing.length} floor(s) no longer resolve:`);
    for (const r of routing) console.error(`  • ${r}`);
    console.error("");
  }

  for (const b of breaches) {
    failed = true;
    console.error(
      `✗ \`${b.name}\`: ${b.claimed} of ${b.files} source file(s) named by a test, below its floor of ${b.min}.`
    );
    for (const p of b.unclaimed.slice(0, 6)) console.error(`      ${p}`);
    if (b.unclaimed.length > 6) console.error(`      … and ${b.unclaimed.length - 6} more`);
  }
  if (breaches.length) {
    console.error("");
    console.error("  → what to do next:");
    console.error("      npm run context:coverage -- --context <name>   # which files nothing names");
    console.error("      Write the test. Lowering a floor to go green is rubric B3, and this is the one census");
    console.error("      where the contexts with a floor are the ones AGENTS.md § Red is about.");
    console.error("");
  }

  const ceiling = floors.accepted?.uncovered;
  if (typeof ceiling === "number" && uncovered.length > ceiling) {
    failed = true;
    console.error(
      `✗ ${uncovered.length} context(s) have no test pointing at them, above the accepted ${ceiling}. This change ` +
        "added a context nothing claims, or took the last test off one."
    );
    console.error("");
  } else if (typeof ceiling === "number" && uncovered.length < ceiling) {
    console.log(
      `  ↓ ${ceiling - uncovered.length} fewer uncovered than the accepted ceiling. Lower it in this commit: ` +
        'npm run context:coverage -- --accept --reason "…"'
    );
  } else if (ceiling == null) {
    console.log(
      "  REPORTING RUNG (docs/adr/0007-gate-rung-discipline.md): no ceiling has been accepted, so the census above " +
        "measures and does not decide. The FLOORS decide. Pin the count on purpose to make the total one-way:"
    );
    console.log('    npm run context:coverage -- --accept --reason "what this count is and why pinning it here is right"');
  }

  if (CHECK && !failed) {
    console.log("");
    console.log(`✓ every floor in ${FLOORS_REL} resolves to a context, and every one of them is met.`);
  }
  process.exit(failed && CHECK ? 1 : 0);
}
