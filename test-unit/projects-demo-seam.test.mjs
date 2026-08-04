/** Structural guard: demo-ness is resolved at ONE seam, never re-derived as a string
 *  test at a call site, and no persisting Server Action re-inlines the write-path
 *  ownership handshake.
 *
 *  Why this exists: the only thing separating a demo/marketing project from a real
 *  tenant is that its id starts with `demo-`. That prefix used to be spelled at ~10
 *  places, and the three Server Action files that persist per-project state each
 *  carried a hand-copied `ownerOf()` (the newest one documents that it copied the
 *  previous one line by line). Copies drift, and a drifted copy writes demo content
 *  into a real tenant's data — or a real tenant's data onto the public marketing
 *  surface. One missed check is the whole bug.
 *
 *  Modelled on projects-guard-adoption.test.mjs (the API-route twin of rule 2) and
 *  project-store-registration.test.mjs (the "registered or explicitly allowlisted"
 *  shape of rule 1).
 *
 *  The `demo-` id convention REMAINS the storage truth — nothing here asks for a data
 *  migration. It asks that exactly one function reads it and exactly one mints it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(process.cwd(), "src");
const SEAM = join(SRC, "lib", "projects", "demo.ts");
const GUARD = join(SRC, "lib", "projects", "persist-guard.ts");

/** Files allowed to spell a `demo-…` literal, each with a reason AND the exact set of
 *  literals it may spell — so an allowlisted file cannot quietly grow a new one. */
const PREFIX_ALLOWLIST = {
  "src/lib/projects/demo.ts": {
    reason:
      "THE seam — resolveProjectKind() is the only reader of the prefix and demoProjectId() the only writer.",
    literals: ["demo-"],
  },
  "src/components/demo/DemoModule.tsx": {
    reason:
      "`demo-user` is the mock USER id the public demo shell renders as the signed-in account — a user id, not a project id, so it is outside this rule entirely.",
    literals: ["demo-user"],
  },
};

/** Every `demo-…` literal a file spells, deduped. */
function demoLiterals(src) {
  return [...new Set((src.match(/["'`]demo-[\w-]*/g) ?? []).map((m) => m.slice(1)))].sort();
}

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const rel = (f) => relative(process.cwd(), f).split(sep).join("/");

/** Strip comments so a docstring that MENTIONS `demo-eshop` isn't read as a check. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ---------------------------------------------------------------------------
// Rule 1 — the prefix is spelled in exactly one file
// ---------------------------------------------------------------------------

test("nothing outside the seam derives demo-ness from the id string", () => {
  const files = sourceFiles(SRC);
  assert.ok(files.length > 300, `expected to scan the whole src tree, found ${files.length}`);

  const offenders = [];
  for (const file of files) {
    const src = code(readFileSync(file, "utf8"));
    const literals = demoLiterals(src);
    // …a literal "demo-…" id / prefix anywhere in code, or the constant re-tested by hand.
    if (literals.length === 0 && !/\bDEMO_ID_PREFIX\b/.test(src)) continue;
    const allowed = PREFIX_ALLOWLIST[rel(file)];
    if (!allowed) {
      offenders.push(rel(file));
      continue;
    }
    assert.deepEqual(
      literals,
      [...allowed.literals].sort(),
      `${rel(file)} is allowlisted for ${allowed.literals.join(", ")} only — it now also spells ${literals.join(", ")}`
    );
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    "these files re-derive demo-ness from the id string instead of going through " +
      "src/lib/projects/demo.ts (resolveProjectKind / asTenantProjectId / projectRef / " +
      `demoProjectId):\n${offenders.join("\n")}`
  );
});

test("the seam really is a seam — one prefix test, one minting site", () => {
  const src = code(readFileSync(SEAM, "utf8"));
  const startsWith = src.match(/startsWith\s*\(/g) ?? [];
  assert.equal(startsWith.length, 1, "resolveProjectKind must be the ONLY prefix test");
  for (const fn of [
    "resolveProjectKind",
    "projectRef",
    "asTenantProjectId",
    "demoProjectId",
    "isDemoProjectId",
    "isDemoProject",
  ]) {
    assert.match(src, new RegExp(`export function ${fn}\\b`), `${fn} must be part of the seam`);
  }
  for (const [file, entry] of Object.entries(PREFIX_ALLOWLIST)) {
    assert.ok(entry.reason.length > 40, `allowlist entry ${file} needs a real reason`);
    assert.ok(entry.literals.length > 0, `allowlist entry ${file} must name its literals`);
  }
});

// ---------------------------------------------------------------------------
// Rule 2 — no persisting Server Action re-inlines the write-path handshake
// ---------------------------------------------------------------------------

test("every persisting Server Action routes ownership through the shared guard", () => {
  const actions = sourceFiles(SRC).filter(
    (f) => f !== GUARD && /^\s*["']use server["']/.test(readFileSync(f, "utf8"))
  );
  assert.ok(actions.length >= 3, `expected the Server Action files, found ${actions.length}`);

  const offenders = [];
  for (const file of actions) {
    const src = code(readFileSync(file, "utf8"));
    // `getProject(` is the ownership read (does NOT match getProjectState( ),
    // `currentUserId(` the session read — both belong to the guard now. A demo
    // predicate in a WRITE path is the same re-derivation by another name.
    if (
      /\bcurrentUserId\s*\(/.test(src) ||
      /\bgetProject\s*\(/.test(src) ||
      /\bisDemoProjectI?d?\s*\(/.test(src)
    ) {
      offenders.push(rel(file));
    }
    assert.match(
      src,
      /requireOwnedTenantProject/,
      `${rel(file)} does not use the shared requireOwnedTenantProject guard`
    );
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    "these Server Actions still inline the currentUserId()/getProject()/demo handshake " +
      `instead of the shared write-path guard (src/lib/projects/persist-guard.ts):\n${offenders.join("\n")}`
  );
});
