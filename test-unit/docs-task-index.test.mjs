/** The task → document index, asserted rather than trusted.
 *
 *  This repository's documentation is already kept honest in every direction but
 *  one. `npm run docs:parity` holds the bilingual pair in step, `npm run adr:check`
 *  fails an ADR that cites a path which has since been renamed, and
 *  `npm run agents:surface` fails a guidance pointer that resolves to nothing. All
 *  of those check a document that a reader has ALREADY chosen.
 *
 *  Choosing was the unguarded step. An agent starts a run knowing the task and not
 *  the filename, and with an ADR set, a bilingual README pair, a product profile, a
 *  value case, a deploy runbook, a self-hosting design and an i18n contract in the
 *  tree, guessing is cheap to do and expensive to get wrong — the failure mode is
 *  not a missing answer, it is a change made without the decision record that
 *  governs the seam. docs/task-index.md is the lookup; this file is why it stays
 *  true.
 *
 *  Three properties, each of which fails a different way of letting it rot:
 *
 *    1. Every path the index routes to still EXISTS. A routing table into a
 *       renamed file is worse than no routing table — it is a confident wrong
 *       answer at the moment the reader is orienting.
 *    2. Every ADR is routed to. ADRs are the documents whose absence causes the
 *       expensive mistake, and a new one lands roughly monthly; without this, the
 *       index silently stops covering the newest decisions, which are the ones a
 *       reader is least likely to already know about.
 *    3. The entry points LINK to it. An index nobody is sent to is a file, not an
 *       index.
 *
 *  Rung: blocking (ADR-0007 — it passes today). It runs inside `npm run test:unit`
 *  → `npm run check:ci` → `.husky/pre-push`, so moving a document without
 *  re-pointing the index is a red build on the machine that moved it.
 *
 *  Pure — reads files, runs nothing. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize as normalizePath, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_REL = "docs/task-index.md";
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

test("the task index exists at the path everything else points at", () => {
  assert.ok(
    existsSync(join(ROOT, INDEX_REL)),
    `${INDEX_REL} is gone. .ai/manifest.yaml nominates it under guidance.taskIndex and the entry points link ` +
      "to it, so removing it turns three live pointers into dead ones."
  );
});

const index = read(INDEX_REL);

/** Every markdown link target in the index, resolved to a repo-relative path.
 *  Anchors and external URLs are not this file's business — a link to
 *  https://… cannot be checked offline, and a `#section` is checked by the eye. */
function routedPaths(markdown) {
  const out = new Set();
  for (const m of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
    const clean = target.split("#")[0];
    if (!clean) continue;
    // Index links are written relative to docs/, the directory it lives in.
    // A directory row ends in `/`; drop it so the existence check is uniform.
    out.add(posix.normalize(posix.join("docs", clean)).replace(/\/+$/, ""));
  }
  return [...out].sort();
}

const routes = routedPaths(index);

test("the index routes somewhere — a table of contents with no rows is a gesture", () => {
  assert.ok(
    routes.length >= 25,
    `docs/task-index.md routes to only ${routes.length} document(s). It exists to answer "which document ` +
      'answers this task" across the whole tree, not for a handful of favourites.'
  );
});

test("every document the index routes to still exists", () => {
  // The one property that makes the index worth opening. A rename that misses this
  // file leaves a reader following a pointer into nothing, at the exact moment they
  // had no idea which file to open in the first place.
  const dead = routes.filter((rel) => !existsSync(join(ROOT, normalizePath(rel))));
  assert.deepEqual(
    dead,
    [],
    `docs/task-index.md routes to ${dead.length} path(s) that do not exist: ${dead.join(", ")}. ` +
      "Re-point the row at where the document went, or drop the row and say what now answers that task."
  );
});

test("every ADR is routed to from the index", () => {
  // ADRs are the reason this index earns its keep: they are the documents whose
  // absence produces a change that undoes a decision nobody knew had been made.
  // A new record lands often enough that "someone will remember to add a row" is
  // not a mechanism.
  const adrs = readdirSync(join(ROOT, "docs", "adr"))
    .filter((f) => /^\d{4}-.+\.md$/.test(f))
    .sort();
  assert.ok(adrs.length > 0, "docs/adr/ holds no numbered records — has the directory moved?");
  const missing = adrs.filter((f) => !index.includes(f));
  assert.deepEqual(
    missing,
    [],
    `docs/task-index.md does not route to ${missing.join(", ")}. Add a row naming the SEAM that record governs ` +
      '— the reader knows "I am about to change the store", not "I should read ADR-0001".'
  );
});

test("the entry points send a reader to the index", () => {
  // An index nobody is pointed at is just another document to guess between. These
  // are the three files a reader actually opens first — canonical guidance, the
  // README, and the human contributor path.
  for (const entry of ["AGENTS.md", "README.md", "CONTRIBUTING.md"]) {
    assert.ok(
      read(entry).includes("task-index.md"),
      `${entry} never mentions docs/task-index.md. A reader who opens only that file still has to guess which ` +
        "document answers their task, which is the whole gap the index closes."
    );
  }
});

test("the index is nominated in the manifest, next to the canonical document", () => {
  // .ai/manifest.yaml is the machine-readable half of "which document do I trust
  // first". `npm run agents:surface` already fails a guidance pointer that resolves
  // to nothing; this asserts the pointer is declared at all, so an agent reading the
  // manifest rather than the prose finds the index too.
  const manifest = read(".ai/manifest.yaml");
  assert.match(
    manifest,
    /^\s{2}taskIndex:\s*docs\/task-index\.md\s*$/m,
    ".ai/manifest.yaml declares no `guidance.taskIndex`. An agent that reads the manifest instead of the prose " +
      "gets the precedence order and no route from its task to a document."
  );
  assert.match(
    read("scripts/agent-surface.mjs"),
    /"taskIndex"/,
    "scripts/agent-surface.mjs no longer verifies guidance.taskIndex resolves, so the manifest may point at a " +
      "file that has been deleted and nothing says so."
  );
});
