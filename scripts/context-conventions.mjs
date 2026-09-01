#!/usr/bin/env node
/** Which conventions govern the file I am about to change? (zero-dependency, ADR-0008)
 *
 *  AGENTS.md is repository-wide and context-map.json is per-context, and until this
 *  landed nothing joined them. An agent editing src/lib/llm/index.ts and an agent
 *  editing a marketing page read the same ~930 lines — which is not primarily a
 *  cost in reading time. It is what the averaging does to the content: a rule that
 *  is load-bearing in one directory and irrelevant in fifteen gets written weakly
 *  enough to be true everywhere, and the sharp local ones stay tacit.
 *
 *  .github/context-conventions.json is the join. This is the reader:
 *
 *    npm run context:conventions                       every context that has one
 *    npm run context:conventions -- --path src/lib/llm/index.ts
 *                                                      what governs the file already open
 *    npm run context:conventions -- --context llm-core-providers
 *    npm run context:conventions -- --check            the routing still resolves
 *
 *  TWO RUNGS (docs/adr/0007-gate-rung-discipline.md):
 *
 *    BLOCKING   `--check`, run from test-unit/context-conventions.test.mjs on every
 *               build: every `context` is one context-map.json still has, every
 *               `constraints` id is one .github/constraint-map.json defines, every
 *               cited path exists, and every `local` note says something. A routing
 *               table that has stopped resolving is worse than none, because it is
 *               read with confidence. It passes today, so a red is a regression.
 *    REPORTING  coverage: how many of the 117 contexts have a row. That is
 *               deliberately far from 100% — most contexts are governed entirely by
 *               the global rules and a row for them would bury the sharp ones — so
 *               it prints and never fails.
 *
 *  WHAT IT CANNOT SEE. Whether a `local` note is still TRUE. It holds the note to a
 *  context and to the paths it cites, which catches the note about code that moved;
 *  a note about code that stayed and changed its mind is what
 *  .github/docs-staleness.json is for on the documents, and what a reader is for
 *  here. The notes are deliberately short and consequence-first so that staying true
 *  is cheap.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_REL = ".github/context-conventions.json";
const MAP_REL = "context-map.json";
const CONSTRAINTS_REL = ".github/constraint-map.json";

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));

/** Repo-relative, forward-slashed — the form every other tool here prints. */
const norm = (p) => String(p ?? "").split("\\").join("/").replace(/^\.\//, "");

/**
 * The registry, resolved against the tree.
 *
 * Exported so test-unit/context-conventions.test.mjs runs the REAL resolution
 * rather than a copy of it — a checker the test reimplements is a checker nobody
 * has seen fail.
 */
export function resolveConventions({
  registry = readJson(REGISTRY_REL),
  map = readJson(MAP_REL),
  constraints = readJson(CONSTRAINTS_REL),
} = {}) {
  const contextsByName = new Map((map.contexts ?? []).map((c) => [c.name, c]));
  const knownConstraints = new Set((constraints.constraints ?? []).map((c) => c.id));

  const failures = [];
  const rows = [];
  const seen = new Set();

  for (const entry of registry.contexts ?? []) {
    const name = entry.context;
    if (!name) {
      failures.push(`${REGISTRY_REL}: an entry has no \`context\`, so it routes from nothing.`);
      continue;
    }
    if (seen.has(name)) {
      failures.push(`${REGISTRY_REL}: \`${name}\` appears twice — two answers to one question.`);
      continue;
    }
    seen.add(name);

    const context = contextsByName.get(name);
    if (!context) {
      failures.push(
        `${REGISTRY_REL}: \`${name}\` is not a context in ${MAP_REL}. A rescan renamed or removed it, and the ` +
          "note is now attached to nothing — re-point it at the context the code moved into."
      );
      continue;
    }

    if (!entry.why || String(entry.why).length < 30) {
      failures.push(`${name}: no \`why\` — say what makes this context's conventions worth a row of their own.`);
    }

    for (const id of entry.constraints ?? []) {
      if (!knownConstraints.has(id)) {
        failures.push(
          `${name}: names constraint \`${id}\`, which ${CONSTRAINTS_REL} does not define. This file routes to the ` +
            "rules, it does not declare them — add the rule there (and its row in AGENTS.md) or fix the id."
        );
      }
    }

    const locals = entry.local ?? [];
    if (!locals.length && !(entry.constraints ?? []).length) {
      failures.push(`${name}: routes to no constraint and states no local convention, so the row says nothing.`);
    }
    for (const note of locals) {
      if (!note.note || String(note.note).length < 60) {
        failures.push(
          `${name}: a \`local\` note is too short to carry a consequence. The bar is: would an agent that read ` +
            "AGENTS.md end to end still get this wrong, and what happens when it does?"
        );
      }
      for (const cite of note.cites ?? []) {
        if (!existsSync(join(ROOT, cite))) {
          failures.push(
            `${name}: cites \`${cite}\`, which does not exist. A note about a file that moved reads exactly like ` +
              "one about a file that did not."
          );
        }
      }
      if (!(note.cites ?? []).length) {
        failures.push(`${name}: a \`local\` note cites no file, so a reader cannot check whether it is still true.`);
      }
    }

    rows.push({ name, context, entry, paths: (context.file_paths ?? []).map(norm) });
  }

  return { rows, failures, totalContexts: (map.contexts ?? []).length };
}

/** Every row whose context claims this path — by exact file, then by directory. */
export function rowsForPath(rows, path) {
  const target = norm(path);
  const exact = rows.filter((r) => r.paths.includes(target));
  if (exact.length) return exact;
  return rows.filter((r) => r.paths.some((p) => target.startsWith(`${p.split("/").slice(0, -1).join("/")}/`)));
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
  const PATH = arg("--path");
  const CONTEXT = arg("--context");

  const { rows, failures, totalContexts } = resolveConventions();

  const print = (row) => {
    console.log(`\n## ${row.name}  ·  ${row.context.group}  ·  ${row.context.category}`);
    console.log(`   ${row.entry.why}`);
    if ((row.entry.constraints ?? []).length) {
      console.log(`\n   Global rules that bite here (.github/constraint-map.json):`);
      for (const id of row.entry.constraints) console.log(`     · ${id}`);
    }
    if ((row.entry.local ?? []).length) {
      console.log(`\n   Local — true here and nowhere else:`);
      for (const note of row.entry.local) {
        console.log(`     ${note.unfenced ? "⚠ (nothing will tell you)" : "·"} ${note.note}`);
        console.log(`        ${(note.cites ?? []).join(", ")}`);
      }
    }
  };

  let selected = rows;
  if (CONTEXT) selected = rows.filter((r) => r.name === CONTEXT);
  if (PATH) selected = rowsForPath(rows, PATH);

  if (PATH && !selected.length) {
    console.log(
      `No context in ${REGISTRY_REL} declares a convention for ${norm(PATH)}.\n` +
        `That is the common case — ${rows.length} of ${totalContexts} contexts have a row, because most are ` +
        "governed entirely by the rules in AGENTS.md. Read those, and add a row here if this edit turns out to " +
        "need something they do not say."
    );
  } else {
    for (const row of selected) print(row);
  }

  console.log("");
  console.log(
    `Coverage: ${rows.length} of ${totalContexts} contexts carry a convention row (reporting — most contexts need ` +
      "none, and a row for every one of them would bury the sharp ones)."
  );

  if (failures.length) {
    console.error("");
    console.error(`✗ ${failures.length} routing failure(s) in ${REGISTRY_REL}:`);
    for (const f of failures) console.error(`  • ${f}`);
    console.error("");
    console.error(
      "A routing table that has stopped resolving is worse than none: it is read with confidence. Re-point the " +
        "row, or drop it and say what now covers that context."
    );
    process.exit(1);
  }
  if (CHECK) {
    console.log("");
    console.log(`✓ every row in ${REGISTRY_REL} resolves to a context, a rule and a file that all still exist.`);
  }
  process.exit(0);
}
