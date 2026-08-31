/** The agent → task index, asserted rather than trusted.
 *
 *  docs/task-index.md exists because a run starts knowing the task and not the
 *  filename, and test-unit/docs-task-index.test.mjs keeps that routing honest.
 *  The same guess happens one layer down and was unguarded: `.claude/agents/`
 *  holds subagent specs that are operating contracts hundreds of words long, and
 *  picking between them meant reading all of them. docs/agent-index.md is the
 *  lookup — per agent, what it is for, what it may assume about the tree and the
 *  handoff, and what it returns — and this file is why it stays true.
 *
 *  Three properties, each failing a different way of letting it rot:
 *
 *    1. Every spec has a row. A new agent that lands without one is invisible to
 *       the only document a caller reads before dispatching, which is exactly the
 *       state this index was written to end.
 *    2. Every row names a spec that exists. A routing table into a deleted agent
 *       is a confident wrong answer at the moment the reader is choosing.
 *    3. A spec's `name:` matches its filename. The name is the dispatch address;
 *       when the two drift, the index routes to a file and the caller invokes a
 *       name, and only one of them is right.
 *
 *  Rung: blocking (ADR-0007 — it passes today). Runs inside `npm run test:unit`
 *  → `npm run check:ci` → `.husky/pre-push`, so adding an agent without routing
 *  it is a red build on the machine that added it.
 *
 *  Pure — reads files, runs nothing. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");
const INDEX_REL = "docs/agent-index.md";
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

/** The spec files, by the name they are dispatched under (their filename). */
function specs() {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => ({ file: f, name: f.slice(0, -3), text: readFileSync(join(AGENTS_DIR, f), "utf8") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

test("the index exists where the task index and the specs point", () => {
  assert.ok(
    existsSync(join(ROOT, INDEX_REL)),
    `${INDEX_REL} is gone. It is the only routing from a task to a subagent; without it, choosing one means ` +
      "reading every spec in .claude/agents/."
  );
});

const index = read(INDEX_REL);

/** Table rows name their agent in backticks in the first cell. Prose elsewhere in
 *  the file may mention a skill or a path in backticks; only a row routes. */
const rowNames = [...index.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gim)].map((m) => m[1]);

test("the index states the three facts a caller needs, in that shape", () => {
  // The value of this file is not that it lists the agents — it is that it answers
  // the same three questions for each. A table that loses a column silently
  // becomes a list of names.
  for (const heading of ["Reach for it when", "may assume", "Returns"]) {
    assert.ok(
      index.includes(heading),
      `docs/agent-index.md no longer has a "${heading}" column. The three facts (what it is for, what it may ` +
        "assume, what it returns) are the whole reason a caller opens this instead of the spec."
    );
  }
});

test("every agent spec has a row in the index", () => {
  const found = specs();
  assert.ok(found.length > 0, `.claude/agents/ holds no specs — has the directory moved? (looked in ${AGENTS_DIR})`);
  const missing = found.filter((s) => !rowNames.includes(s.name)).map((s) => s.file);
  assert.deepEqual(
    missing,
    [],
    `docs/agent-index.md has no row for ${missing.join(", ")}. Add one naming what it is for, what it may ` +
      "assume about the tree and the handoff, and what it returns — a spec nobody is routed to is a file, not " +
      "an agent."
  );
});

test("every row in the index names an agent that exists", () => {
  const names = new Set(specs().map((s) => s.name));
  const dead = rowNames.filter((n) => !names.has(n));
  assert.deepEqual(
    dead,
    [],
    `docs/agent-index.md routes to ${dead.join(", ")}, which no longer exists in .claude/agents/. Drop the row, ` +
      "or re-point it at the agent that took the work over."
  );
});

test("a spec's declared name is the name it is dispatched under", () => {
  // The frontmatter `name:` is the address a caller types; the filename is what
  // the index routes to. A drift between them means the index is right about a
  // file nobody can invoke.
  for (const s of specs()) {
    const m = /^name:\s*(\S+)\s*$/m.exec(s.text);
    assert.ok(m, `.claude/agents/${s.file} declares no \`name:\` in its frontmatter — nothing can dispatch it.`);
    assert.equal(
      m[1],
      s.name,
      `.claude/agents/${s.file} declares \`name: ${m[1]}\`. The filename is what docs/agent-index.md routes to ` +
        "and the name is what a caller invokes; keep them identical."
    );
  }
});

// --- which specs are actually reached ----------------------------------------
//
//  The three properties above keep the index complete. They say nothing about
//  whether any of the specs is still USED, and that is the failure this pair
//  closes: a spec whose dispatch site was deleted keeps its row, keeps its
//  frontmatter, keeps its name — and is indistinguishable from one carrying real
//  traffic. Goldens answer the same question for the LLM chokepoint; nothing
//  answered it one layer up.
//
//  There is no fixture that can execute a subagent, so "proved" here is the
//  weaker property that is genuinely checkable: something in the tree still
//  dispatches it. The index states WHERE per agent (the `Proved by` column) and
//  the second test recomputes it from the tree, so the column cannot be kept true
//  by editing the column.
//
//  Rung: blocking (ADR-0007 — all four are dispatched today, so red is a
//  regression). Pure: reads files, runs nothing.

/** Table rows by agent name → their cells. No cell in this table contains a `|`. */
function rows() {
  const out = new Map();
  for (const raw of index.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^\|\s*`([a-z0-9-]+)`\s*\|/.exec(line);
    if (!m) continue;
    out.set(
      m[1],
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim())
    );
  }
  return out;
}

/** Where a dispatch can live. `.claude/agents/` and `docs/` are excluded on
 *  purpose: a spec mentioning itself, and an index mentioning a spec, are exactly
 *  the two references a dead agent still has. */
const DISPATCH_ROOTS = [".claude/skills", "scripts", "test-unit", "test-llm"];
const TEXTUAL = /\.(md|mjs|cjs|js|ts|tsx|json|ya?ml|txt|sh)$/i;

function textFilesUnder(rel, acc = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, rel), { withFileTypes: true });
  } catch {
    return acc; // a root that does not exist here contributes nothing
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".git")) continue;
    // A shared skill is a LINK into the AI registry (AGENTS.md § AI registry);
    // its target is outside this tree and is not this repository's to assert on.
    if (e.isSymbolicLink()) continue;
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) textFilesUnder(child, acc);
    else if (e.isFile() && TEXTUAL.test(e.name)) acc.push(child);
  }
  return acc;
}

test("every row says what would have to change for its agent to stay reachable", () => {
  const table = rows();
  for (const s of specs()) {
    const cells = table.get(s.name);
    assert.ok(cells, `docs/agent-index.md has no table row for \`${s.name}\`.`);
    const proof = cells[4];
    assert.ok(
      proof,
      `The row for \`${s.name}\` has no \`Proved by\` cell. Name the file that dispatches it (or the fixture that ` +
        "exercises it) — a spec with no answer to that is a document, and this index cannot tell you which."
    );
    const paths = [...proof.matchAll(/`([^`]*\/[^`]*)`/g)].map((m) => m[1]);
    assert.ok(
      paths.length > 0,
      `The \`Proved by\` cell for \`${s.name}\` names no file path in backticks: "${proof}". It has to point at ` +
        "something a reader can open."
    );
    for (const p of paths) {
      assert.ok(existsSync(join(ROOT, p)), `docs/agent-index.md says \`${s.name}\` is proved by ${p}, which does not exist.`);
      assert.ok(
        readFileSync(join(ROOT, p), "utf8").includes(s.name),
        `docs/agent-index.md says \`${s.name}\` is proved by ${p}, but that file never mentions it. The link is ` +
          "decorative — point at the file that actually dispatches or exercises the agent."
      );
    }
  }
});

test("no agent spec has quietly stopped being dispatched", () => {
  // Recomputed from the tree rather than read out of the table above, so the
  // index going stale and the agent going dead are two different red builds.
  const corpus = DISPATCH_ROOTS.flatMap((r) => textFilesUnder(r));
  assert.ok(corpus.length > 0, `none of ${DISPATCH_ROOTS.join(", ")} could be read — the scan would pass vacuously.`);
  const pending = new Set(specs().map((s) => s.name));
  for (const f of corpus) {
    if (pending.size === 0) break;
    let text;
    try {
      text = readFileSync(join(ROOT, f), "utf8");
    } catch {
      continue;
    }
    for (const name of [...pending]) if (text.includes(name)) pending.delete(name);
  }
  const orphans = [...pending];
  assert.deepEqual(
    orphans,
    [],
    `Nothing under ${DISPATCH_ROOTS.join(", ")} names ${orphans.join(", ")} any more, so the spec is unreachable: ` +
      "whatever used to hand it work no longer does. Either restore the dispatch site, or delete the spec and its " +
      "row — a prompt nobody sends looks identical to one under load, which is the state this test exists to end."
  );
});

test("the task index sends a reader to the agent index", () => {
  // Same reason docs-task-index.test.mjs asserts the entry points link to it: an
  // index nobody is pointed at is just another document to guess between.
  assert.ok(
    read("docs/task-index.md").includes("agent-index.md"),
    "docs/task-index.md never routes to docs/agent-index.md. The task index is where a run looks first, so a " +
      "reader who needs a subagent has to already know the agent index exists."
  );
});
