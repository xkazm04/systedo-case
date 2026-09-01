#!/usr/bin/env node
/** How much has to be read before the first correct edit (zero-dependency).
 *
 *  WHY THIS EXISTS. An agent starting a task here is pointed at `AGENTS.md`, then
 *  `CLAUDE.md`, then the rubric its diff will be judged by, then the enumeration of
 *  what may stop a change, then two routing tables, then the ledger of traps other
 *  agents fell into. Every one of those was added for a reason a reviewer agreed
 *  with, and the total has never had a limit — which is the shape of every surface
 *  that grows without anyone deciding it should.
 *
 *  `npm run agents:surface` already protects what the guidance SAYS: a generated
 *  region cannot smuggle in an instruction, and a vendor reword has to be accepted
 *  on its own. Nothing protected how MUCH of it there is. That matters more here
 *  than in a repository read by people: a person skims and returns, while an agent
 *  pays for the whole surface on every run, before it has seen a line of the code
 *  it was asked to change, and a surface that outgrows the attention available is
 *  read partially — which is worse than a shorter one, because nobody can say
 *  which part was dropped.
 *
 *  WHAT IT MEASURES, and what it deliberately does not. Only the READ-FIRST set:
 *  the documents this repository tells an agent to read before its first edit.
 *  Everything else here is a LOOKUP — the ADRs, the runbooks, `context-map.json`,
 *  the contract ledger — reached deliberately, when a task needs it, through
 *  `docs/task-index.md`. Those are unbounded on purpose: a routing table's whole
 *  job is to make a large corpus cheap, and capping it would push its content back
 *  into the file everybody reads. So the budget's real content is the BOUNDARY:
 *  moving a document from lookup to read-first is the expensive decision, and this
 *  is where it becomes visible.
 *
 *  Lines rather than tokens or bytes: it is the unit a diff is written in, it is
 *  stable across editors, and every ceiling here can be checked by anyone with
 *  `wc -l`.
 *
 *  RUNG. Blocking, and green on arrival (docs/adr/0007-gate-rung-discipline.md):
 *  every ceiling in `.github/guidance-budget.json` is what the tree holds today.
 *  It runs inside `npm run test:unit` (test-unit/guidance-budget.test.mjs) rather
 *  than as its own stage of `check:ci`, so it costs nothing and still refuses a
 *  push. Raising a ceiling is allowed and is the point — it is one reviewed line
 *  next to the paragraph it pays for, with the reason beside it, which is the same
 *  shape every other pin in this repository has.
 *
 *  Usage:
 *    node scripts/guidance-budget.mjs            # the table
 *    node scripts/guidance-budget.mjs --check    # exit 1 when a ceiling is passed
 *    node scripts/guidance-budget.mjs --summary FILE
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUDGET_REL = ".github/guidance-budget.json";

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const summaryIdx = argv.indexOf("--summary");
const SUMMARY_FILE = summaryIdx !== -1 ? argv[summaryIdx + 1] : null;
/** Overridable so a test can point the REAL gate at a fixture and require a red —
 *  a ceiling nobody has watched fail is a ceiling nobody knows is wired. */
const budgetIdx = argv.indexOf("--budget");
const BUDGET_PATH = budgetIdx !== -1 && argv[budgetIdx + 1] ? argv[budgetIdx + 1] : join(ROOT, BUDGET_REL);

/** Lines, counted the way `wc -l` counts them: a trailing newline does not add
 *  one. Exported through the report so the number in the JSON is reproducible. */
export function countLines(text) {
  return text.replace(/\n$/, "").split(/\r?\n/).length;
}

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

const failures = [];

if (!existsSync(BUDGET_PATH)) {
  console.error(`✗ guidance budget: ${BUDGET_REL} is missing — it is the declaration this gate reads.`);
  process.exit(1);
}
const budget = JSON.parse(readFileSync(BUDGET_PATH, "utf8"));
const readFirst = budget.readFirst ?? [];
const lookups = budget.lookups ?? [];

say("## The guidance surface, measured");
say("");
say("| Document | Lines | Ceiling | Why it is read first |");
say("| --- | ---: | ---: | --- |");

let total = 0;
for (const entry of readFirst) {
  const abs = join(ROOT, entry.file);
  if (!existsSync(abs)) {
    failures.push(
      `${entry.file}: declared read-first and does not exist. A budget naming a document that has moved measures ` +
        "nothing and says so to nobody."
    );
    say(`| \`${entry.file}\` | — | ${entry.maxLines} | ${entry.why ?? ""} |`);
    continue;
  }
  const lines = countLines(readFileSync(abs, "utf8"));
  total += lines;
  say(`| \`${entry.file}\` | ${lines} | ${entry.maxLines} | ${entry.why ?? ""} |`);
  if (typeof entry.maxLines !== "number") {
    failures.push(`${entry.file}: no \`maxLines\`. A read-first document with no ceiling is what this measures.`);
  } else if (lines > entry.maxLines) {
    failures.push(
      `${entry.file}: ${lines} lines, over its ceiling of ${entry.maxLines}. Either move what grew into a ` +
        `lookup that ${budget.routedBy ?? "docs/task-index.md"} points at, or raise the ceiling in ${BUDGET_REL} ` +
        "in the same diff, with the sentence saying why every agent should now read it."
    );
  }
  if (!String(entry.why ?? "").trim()) {
    failures.push(`${entry.file}: no \`why\`. The question a read-first entry answers is what breaks if it is read late.`);
  }
}

say("");
say(`**Total: ${total} lines**, ceiling ${budget.maxTotalLines}.`);
if (typeof budget.maxTotalLines !== "number") {
  failures.push(`${BUDGET_REL}: no \`maxTotalLines\`. The per-document ceilings do not add up to a limit on their own.`);
} else if (total > budget.maxTotalLines) {
  failures.push(
    `the read-first surface is ${total} lines, over the total ceiling of ${budget.maxTotalLines}. Every document ` +
      "can be under its own ceiling while the set an agent must read is larger than it was — which is exactly " +
      "how this grew in the first place."
  );
}

// The boundary is the part worth defending: a lookup that quietly becomes
// read-first is how the total moves without any ceiling being touched.
const readFirstFiles = new Set(readFirst.map((e) => e.file));
for (const entry of lookups) {
  if (readFirstFiles.has(entry.file)) {
    failures.push(
      `${entry.file}: declared both read-first and a lookup. Which one it is decides whether every run pays for ` +
        "it, so it cannot be both."
    );
  }
  if (!existsSync(join(ROOT, entry.file))) {
    failures.push(`${entry.file}: declared a lookup and does not exist — ${budget.routedBy ?? "the routing table"} points at nothing.`);
  }
}

say("");
say(
  `${lookups.length} document(s) are declared LOOKUPS — reached through \`${budget.routedBy ?? "docs/task-index.md"}\` ` +
    "when a task needs them, and deliberately unbounded. Moving one of them into the set above is the decision " +
    "this budget exists to make visible."
);

if (failures.length) {
  say("");
  say(`### ✗ ${failures.length} budget failure(s)`);
  say("");
  for (const f of failures) say(`- ${f}`);
}

if (SUMMARY_FILE) {
  try {
    appendFileSync(SUMMARY_FILE, out.join("\n") + "\n");
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

if (failures.length && CHECK) process.exit(1);
