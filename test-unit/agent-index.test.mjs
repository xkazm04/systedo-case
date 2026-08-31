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

test("the task index sends a reader to the agent index", () => {
  // Same reason docs-task-index.test.mjs asserts the entry points link to it: an
  // index nobody is pointed at is just another document to guess between.
  assert.ok(
    read("docs/task-index.md").includes("agent-index.md"),
    "docs/task-index.md never routes to docs/agent-index.md. The task index is where a run looks first, so a " +
      "reader who needs a subagent has to already know the agent index exists."
  );
});
