/** The record of what agents got wrong here, held to the tree it describes.
 *
 *  THE GAP. Mistakes are caught in this repository and then forgotten: the rubric
 *  review runs on every push and publishes which rules fire, the gates refuse a
 *  change for a stated reason — and none of it survives the run that hit it. The
 *  next lane arrives with the same prior and makes the same call, and the guidance
 *  grows by accretion, one paragraph per incident, rather than by evidence.
 *
 *  .github/agent-lessons.json is that record, keyed by the MISTAKE rather than by
 *  the rule, and docs/agent-lessons.md is its readable half. This file is what
 *  stops either one becoming decoration:
 *
 *    • a row with no evidence is a hazard somebody imagined, and a ledger that
 *      admits those stops being read as a record of what actually happened;
 *    • a row with no correct call states a trap and leaves the reader where they
 *      already were;
 *    • a `constraintId` naming a rule the constraint map does not have, or a cited
 *      path that has moved, is a confident wrong answer at the moment a reader is
 *      orienting — the same failure docs/task-index.md is held against;
 *    • a row that claims `fenced` has to name what refuses it, and a row that
 *      admits `unfenced` has to say what (if anything) notices afterwards. Those
 *      are different answers and a reader acts differently on each;
 *    • and the property that keeps the two halves together: the readable page has
 *      to name every row. A lesson only the JSON knows about is one no lane reads.
 *
 *  Rung (docs/adr/0007-gate-rung-discipline.md): BLOCKING. It passes today, so a
 *  red here is a regression. Runs inside `npm run test:unit` → `npm run check:ci`
 *  → `.husky/pre-push`.
 *
 *  Pure — reads files, runs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize as normalizePath } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const LEDGER_REL = ".github/agent-lessons.json";
const DOC_REL = "docs/agent-lessons.md";

const ledger = JSON.parse(read(LEDGER_REL));
const lessons = ledger.lessons ?? [];
const doc = read(DOC_REL);

const STANDINGS = new Set(["fenced", "partial", "unfenced"]);

test("the ledger records a real set of lessons, each with an id a reader can cite", () => {
  assert.ok(
    lessons.length >= 8,
    `${LEDGER_REL} holds ${lessons.length} lesson(s). A record of two favourites answers the question for the ` +
      "mistakes somebody already remembered."
  );
  const seen = new Set();
  for (const l of lessons) {
    assert.match(
      l.id ?? "",
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      `a lesson's id must be kebab-case so it can be cited in a commit or a review: ${JSON.stringify(l.id)}`
    );
    assert.ok(!seen.has(l.id), `${l.id} is recorded twice`);
    seen.add(l.id);
  }
});

test("every lesson states the trap AND the correct call", () => {
  // A trap with no correct call leaves the reader exactly where they were, which
  // is the failure mode of every "be careful" note ever written.
  for (const l of lessons) {
    assert.ok(l.trap, `${l.id}: no \`trap\` — say what actually goes wrong, in the shape it goes wrong in.`);
    assert.ok(
      l.correctCall,
      `${l.id}: no \`correctCall\`. Naming a mistake without naming the alternative is how a rule ends up ` +
        "re-derived on every run."
    );
  }
});

test("every lesson carries evidence — this is a record, not a list of worries", () => {
  // Checked for being THERE, never for being true: the citation is what makes a
  // row arguable, and an unarguable row is how a ledger fills up with folklore.
  for (const l of lessons) {
    assert.ok(
      Array.isArray(l.evidence) && l.evidence.length >= 1,
      `${l.id}: no \`evidence\`. A row earns its place with something that happened — a subject in the log, a ` +
        "paragraph written from the incident, an entry in docs/harness/harness-learnings.md, an ADR."
    );
    for (const e of l.evidence) {
      assert.ok(
        typeof e === "string" && e.trim().length > 20,
        `${l.id}: an evidence entry has to say where to look, not just that there is somewhere: ${JSON.stringify(e)}`
      );
    }
  }
});

test("the standing column is one of the three answers, and each carries what it owes", () => {
  for (const l of lessons) {
    assert.ok(
      STANDINGS.has(l.standing),
      `${l.id}: unknown standing "${l.standing}" (expected ${[...STANDINGS].join(" | ")})`
    );
    assert.ok(
      l.nowCaughtBy,
      `${l.id}: say what catches this today. "nothing" is a legitimate and useful answer — an absent field is not.`
    );
    if (l.standing === "partial") {
      assert.ok(
        l.gapNote,
        `${l.id}: a partial row must say which path AROUND the fence is still open. That gap is the only reason ` +
          "the row is not simply fenced, and it is what a reader on that path needs."
      );
    }
    if (l.standing === "unfenced") {
      assert.ok(
        l.wouldNotice,
        `${l.id}: an unfenced row must say what would notice a breach, even when the honest answer is "the other ` +
          'agent, after the push".'
      );
    }
  }
});

test("a lesson that names a rule names one the constraint map actually has", () => {
  // The join to .github/constraint-map.json. Two files answering "is this
  // enforced?" is worse than one, so a row here points at the rule rather than
  // restating its rung.
  const constraints = JSON.parse(read(".github/constraint-map.json")).constraints ?? [];
  const ids = new Set(constraints.map((c) => c.id));
  for (const l of lessons) {
    if (!l.constraintId) continue; // null is the honest value for a trap no rule covers
    assert.ok(
      ids.has(l.constraintId),
      `${l.id}: constraintId "${l.constraintId}" is not a rule in .github/constraint-map.json. Either the rule ` +
        "was renamed and this row did not follow, or the row is pointing at a fence that was never there."
    );
  }
});

test("every path a lesson sends a reader to still exists", () => {
  const dead = [];
  for (const l of lessons) {
    for (const path of l.see ?? []) {
      if (!existsSync(join(ROOT, normalizePath(path)))) dead.push(`${path} (cited by ${l.id})`);
    }
  }
  assert.deepEqual(
    dead,
    [],
    `${LEDGER_REL} cites ${dead.length} path(s) that do not exist: ${dead.join(", ")}. A ledger that routes into ` +
      "nothing is worse than no ledger — it is a wrong answer at the moment a reader is orienting."
  );
});

test("the readable ledger names every lesson", () => {
  // The two halves, held together the same way AGENTS.md and the constraint map
  // are. A row only the JSON knows about is a row no lane will ever read.
  const missing = lessons.map((l) => l.id).filter((id) => !doc.includes(id));
  assert.deepEqual(
    missing,
    [],
    `${DOC_REL} does not name ${missing.join(", ")}. Add the row to its table — the JSON is the source, and the ` +
      "page is what somebody actually opens."
  );
});

test("the ledger is reachable from the documents a run starts in", () => {
  // An index nobody is sent to is a file. These are the two a lane opens first.
  assert.ok(
    read("docs/task-index.md").includes("agent-lessons.md"),
    "docs/task-index.md does not route to the lessons ledger, so a reader who has never heard of it never will."
  );
  assert.ok(
    read("AGENTS.md").includes("agent-lessons.md"),
    "AGENTS.md — the one document every run is told to read — no longer points at the record of what previous " +
      "runs got wrong."
  );
});

test("the page is re-read when the guidance it describes moves", () => {
  // Parity and existence are not freshness. The staleness budget is what says
  // "AGENTS.md moved under this page" — see .github/docs-staleness.json.
  const docs = JSON.parse(read(".github/docs-staleness.json")).docs ?? [];
  const entry = docs.find((d) => d.doc === DOC_REL);
  assert.ok(
    entry,
    `${DOC_REL} has no entry in .github/docs-staleness.json. A ledger of traps that is never re-read against the ` +
      "rules it describes ages into folklore, which is the failure it exists to end."
  );
  assert.ok(
    (entry.watches ?? []).includes("AGENTS.md"),
    `${DOC_REL}'s staleness entry must watch AGENTS.md — the guidance surface these lessons are about.`
  );
});
