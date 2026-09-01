#!/usr/bin/env node
/** Do the commands the GUIDANCE quotes still exist? (zero-dependency)
 *
 *  WHAT WAS MISSING. Two gates already protect the guidance surface and neither
 *  looks at this. `npm run agents:surface` protects what the generated regions SAY —
 *  a vendor reword cannot ride along in an unrelated diff.
 *  `test-unit/guidance-budget.test.mjs` protects how MUCH of it there is. The
 *  hand-written half quotes something neither of them reads: about a hundred
 *  `npm run …` commands, every one of which lives in `package.json` and can be
 *  renamed there without a single check going red.
 *
 *  WHY IT COSTS MORE HERE THAN IT LOOKS. A renamed script leaves the sentence that
 *  names it reading exactly as it did before — confidently, in the canonical
 *  document, in the file agents obey. The reader is usually an agent with a wall
 *  clock: it runs the command, gets `Missing script`, and then does the expensive
 *  thing, which is not stopping. It guesses a neighbouring command, or concludes the
 *  gate does not exist and skips it. This repository has ~100 scripts and eleven
 *  documents naming them, so this is a question of when rather than whether.
 *
 *  WHICH DOCUMENTS. Not "every markdown file" — the archived scan reports under
 *  `docs/harness/` quote the commands of the day on purpose, and a rename should not
 *  make history red. The covered set is the GUIDANCE surface, and it is derived
 *  rather than listed so it cannot fall behind: everything
 *  `.github/guidance-budget.json` calls `readFirst` (what an agent reads before its
 *  first edit) or `lookups` (what `docs/task-index.md` routes it to), plus the five
 *  entry points below that a contributor opens first.
 *
 *  TWO RUNGS (docs/adr/0007-gate-rung-discipline.md):
 *
 *    BLOCKING   every `npm run <name>` quoted in a covered document resolves to a
 *               script `package.json` defines. It passes today, so a red is a
 *               regression — and it is the diff that renamed the script that goes
 *               red, rather than the run that trips over it months later. It runs
 *               inside `npm run test:unit` (test-unit/guidance-commands.test.mjs) →
 *               `check:ci` → `.husky/pre-push`, so it costs a handful of file reads
 *               and still refuses a push.
 *    REPORTING  the other direction: scripts `package.json` defines that no document
 *               an agent reads ever names. That does NOT pass today — about half are
 *               the `:check` / `:list` variant of a documented command and some are
 *               deliberately internal — so it prints and never fails. It is the
 *               number to read before adding a gate nobody will find.
 *
 *  WHAT IT CANNOT SEE. Whether a documented command still does what the sentence
 *  around it claims; only that it resolves. That half is `npm run gates` for the
 *  chain, and `test-unit/gate-remedy.test.mjs` for what each gate says to run next.
 *
 *  Usage:
 *    npm run guidance:commands          # the table, both directions
 *    npm run guidance:commands:check    # same; exits 1 on a command that does not resolve
 *    node scripts/guidance-commands.mjs --docs <file...>   # a fixture set; the test
 *                                       # points the REAL gate at a document that
 *                                       # quotes a command nobody defines
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUDGET_REL = ".github/guidance-budget.json";

/** The entry points a reader opens first, which the budget does not list because
 *  they are not what an AGENT is told to read before its first edit. A person's
 *  first command comes from one of these, so a dead command here costs the same. */
export const ENTRY_POINTS = [
  "README.md",
  "docs/README.cs.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
];

/** `npm run <name>`, in prose, in a fenced block, or as a permission pattern. The
 *  trailing `[-.:]` strip is what makes a sentence's `npm run check:ci.` and a
 *  permission pattern's `npm run test:unit:*` resolve to the script they name. */
const COMMAND_RE = /npm run ([A-Za-z][\w.:-]*)/g;

/** A broken extractor reads exactly like a tree with nothing wrong in it, so the
 *  default run asserts it still finds a guidance surface's worth of commands. */
const MIN_COMMANDS = 40;

/** Every `npm run` command a document names, as `{ command, line }`. */
export function commandsIn(text) {
  const found = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(COMMAND_RE)) {
      const command = m[1].replace(/[-.:]+$/, "");
      if (command) found.push({ command, line: i + 1 });
    }
  });
  return found;
}

/** The covered set: the budget's own two lists, plus the entry points. Derived, so
 *  a document promoted from lookup to read-first — or added to either — is covered
 *  the moment it is declared, without anyone editing this file. */
export function guidanceDocuments(root = ROOT) {
  const budgetPath = join(root, BUDGET_REL);
  const declared = [];
  if (existsSync(budgetPath)) {
    const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
    for (const entry of [...(budget.readFirst ?? []), ...(budget.lookups ?? [])]) {
      if (entry?.file) declared.push(entry.file);
    }
  }
  return [...new Set([...declared, ...ENTRY_POINTS])];
}

/** The whole check, as data: the failures, and the two tables worth printing.
 *  Separated from the CLI so a test can call it, and so importing this module
 *  never runs anything. */
export function auditCommands({ documents, scripts, fixture = false, root = ROOT } = {}) {
  const failures = [];
  const rows = [];
  /** command → the documents that name it. */
  const quoted = new Map();
  let total = 0;

  for (const rel of documents) {
    // `resolve` rather than `join`, so a fixture passed as an absolute path — which
    // is what a test writing into a temp directory has — is read as itself.
    const abs = resolve(root, rel);
    if (!existsSync(abs)) {
      // A `readFirst` / `lookups` entry that has moved is guidance-budget's finding
      // and it already blocks on it; saying it twice makes one change red in two
      // places with two different remedies. ENTRY_POINTS is this file's own list, so
      // a stale one there is this file's bug.
      if (fixture || ENTRY_POINTS.includes(rel)) {
        failures.push(
          `${rel}: named as a guidance document and does not exist. Re-point ENTRY_POINTS in ` +
            "scripts/guidance-commands.mjs at where the document went."
        );
      }
      continue;
    }
    const found = commandsIn(readFileSync(abs, "utf8"));
    const dead = new Set();
    for (const { command, line } of found) {
      if (!quoted.has(command)) quoted.set(command, new Set());
      quoted.get(command).add(rel);
      if (!(command in scripts)) {
        dead.add(command);
        failures.push(
          `${rel}:${line}: quotes \`npm run ${command}\`, and package.json defines no such script. A renamed ` +
            "script leaves the sentence naming it reading exactly as before — the reader runs it, gets `Missing " +
            "script`, and then guesses a neighbouring command or concludes the gate does not exist. Re-point the " +
            "sentence, or restore the script name."
        );
      }
    }
    total += found.length;
    rows.push({ file: rel, references: found.length, distinct: new Set(found.map((f) => f.command)).size, dead: [...dead] });
  }

  if (!fixture && quoted.size < MIN_COMMANDS) {
    failures.push(
      `only ${quoted.size} distinct commands were found across the guidance surface, below the floor of ` +
        `${MIN_COMMANDS}. Either the documents stopped naming their commands, or the extractor here has stopped ` +
        "matching — and a check that has stopped detecting reads exactly like a clean tree."
    );
  }

  const unmentioned = Object.keys(scripts).filter((name) => !quoted.has(name));
  return { failures, rows, total, distinct: quoted.size, unmentioned };
}

// --- CLI ----------------------------------------------------------------------
//
// Guarded, so the test can import `commandsIn` and `guidanceDocuments` without the
// gate running, printing and exiting inside the suite.

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  // `--check` is the exit-code form and is a no-op: this gate exits non-zero on an
  // unresolved command either way (the same shape as `npm run lint:fences`). The flag
  // exists so the npm script reads like every other `:check` here.
  const summaryIdx = argv.indexOf("--summary");
  const summaryFile = summaryIdx !== -1 ? argv[summaryIdx + 1] : null;
  const docsIdx = argv.indexOf("--docs");
  const fixtureDocs = docsIdx === -1 ? null : argv.slice(docsIdx + 1).filter((a) => !a.startsWith("--"));

  const out = [];
  const say = (s = "") => {
    out.push(s);
    console.log(s);
  };

  const pkgPath = join(ROOT, "package.json");
  if (!existsSync(pkgPath)) {
    console.error("✗ guidance commands: package.json is missing — there is nothing to resolve a command against.");
    process.exit(1);
  }
  const scripts = JSON.parse(readFileSync(pkgPath, "utf8")).scripts ?? {};
  const documents = fixtureDocs ?? guidanceDocuments();
  const audit = auditCommands({ documents, scripts, fixture: Boolean(fixtureDocs) });

  say("## The commands the guidance quotes, resolved against package.json");
  say("");
  say("| Document | Commands quoted | Distinct | Unresolved |");
  say("| --- | ---: | ---: | --- |");
  for (const row of audit.rows) {
    say(`| \`${row.file}\` | ${row.references} | ${row.distinct} | ${row.dead.length ? row.dead.join(", ") : "—"} |`);
  }
  say("");
  say(`**${audit.total} command reference(s)** across ${audit.rows.length} document(s), ${audit.distinct} distinct.`);

  say("");
  say(
    `${audit.unmentioned.length} of ${Object.keys(scripts).length} script(s) are named by no document an agent ` +
      "reads. REPORTING only (docs/adr/0007-gate-rung-discipline.md) — most are the `:check` / `:list` variant " +
      "of a documented command, and some are deliberately internal. It is the number to read before adding a " +
      "gate nobody will find."
  );
  for (const name of audit.unmentioned) say(`  · ${name}`);

  if (audit.failures.length) {
    say("");
    say(`### ✗ ${audit.failures.length} unresolved command reference(s)`);
    say("");
    for (const f of audit.failures) say(`- ${f}`);
    say("");
    say("  → what to do next (`guidance:commands:check`):");
    say("      npm run guidance:commands   # the table above, with the file and the line");
    say("      npm run gates               # the chain, with the command each stage really is");
    say("      Fix the DOCUMENT when a script was renamed on purpose; fix package.json when it was not.");
    say("      Never delete the sentence to go green — the guidance naming its commands is the point.");
  } else {
    say("");
    say(
      `✓ guidance commands: every \`npm run …\` quoted in the ${audit.rows.length} document(s) an agent is told ` +
        "to read resolves to a script package.json defines."
    );
  }

  if (summaryFile) {
    try {
      appendFileSync(summaryFile, `${out.join("\n")}\n`);
    } catch (err) {
      console.error(`(could not write summary: ${err.message})`);
    }
  }

  process.exit(audit.failures.length ? 1 : 0);
}
