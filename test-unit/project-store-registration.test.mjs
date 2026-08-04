/** Structural guard: every PER-PROJECT store that exposes a wipe-the-whole-project
 *  function must be registered in `PROJECT_STORE_DELETERS`
 *  (src/lib/projects/delete-cascade.ts) — the one fan-out that scrubs a workspace on
 *  delete. Modelled on projects-guard-adoption.test.mjs, which pins the analogous
 *  "no route re-inlines the guard" rule.
 *
 *  Why this exists: four stores (goals, inventory plan, finance inputs, twin archive)
 *  shipped with working `clear*` functions on BOTH backends and were simply never
 *  added to the registry, so a deleted project's revenue-goal history, inventory
 *  plans, margin scenarios and archived Twin drafts outlived it forever. Nothing
 *  caught it — the fixture test seeded a subset. This makes the whole CLASS of bug
 *  impossible: a new store's clear function is registered, or it is on the explicit
 *  allowlist below with a written reason. Never silently absent.
 *
 *  The rule scans the DISPATCHER modules only (`.local.ts` / `.firestore.ts` are the
 *  backends behind them) and recognises the two project-store families by signature:
 *    Family A — project-scoped:      (projectId: string)
 *    Family B — per-(user, project): (userId: string, projectId: string)
 *  A per-ITEM delete (`deleteAnnotation(projectId, id)`) or a per-USER one
 *  (`deleteSklikConnection(userId)`) does not match either shape and is ignored. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const LIB = join(process.cwd(), "src", "lib");
const CASCADE = join(LIB, "projects", "delete-cascade.ts");

/** Functions matching a project-store-clear SIGNATURE that are deliberately NOT in
 *  the cascade. Every entry needs a reason — this is the documented escape hatch the
 *  rule demands instead of a silent omission. */
const ALLOWLIST = {
  deleteProject:
    "the `projects` doc ITSELF — removed by the DELETE route as the primary operation " +
    "AFTER the cascade, so a satellite hiccup can't strand the data behind a deleted entry.",
  deleteProjectCascade:
    "the cascade's own entry point (it lives in delete-cascade.ts and is excluded by path anyway).",
};

function tsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (
      entry.endsWith(".ts") &&
      !entry.endsWith(".local.ts") && // backend impl behind a dispatcher
      !entry.endsWith(".firestore.ts") && // ditto
      !entry.endsWith(".d.ts") &&
      !entry.includes(".test.")
    ) {
      out.push(full);
    }
  }
  return out;
}

/** Exported `clear*` / `delete*` functions whose parameter list is exactly one of the
 *  two per-project store shapes. Matches both `export async function x(…)` and
 *  `export const x = async (…)`. */
function projectStoreClears(src) {
  const found = [];
  const re =
    /export\s+(?:async\s+function|function)\s+((?:clear|delete)\w*)\s*\(([^)]*)\)|export\s+const\s+((?:clear|delete)\w*)\s*=\s*(?:async\s*)?\(([^)]*)\)/g;
  for (const m of src.matchAll(re)) {
    const name = m[1] ?? m[3];
    const params = (m[2] ?? m[4] ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const isFamilyA = params.length === 1 && /^projectId\s*:\s*string$/.test(params[0]);
    const isFamilyB =
      params.length === 2 &&
      /^userId\s*:\s*string$/.test(params[0]) &&
      /^projectId\s*:\s*string$/.test(params[1]);
    if (isFamilyA || isFamilyB) found.push(name);
  }
  return found;
}

test("every per-project store clear is registered in the delete cascade", () => {
  const cascadeSrc = readFileSync(CASCADE, "utf8");
  const files = tsFiles(LIB).filter((f) => f !== CASCADE);
  assert.ok(files.length > 100, `expected to scan the whole lib tree, found ${files.length} files`);

  const offenders = [];
  let matched = 0;
  for (const file of files) {
    for (const name of projectStoreClears(readFileSync(file, "utf8"))) {
      matched++;
      if (name in ALLOWLIST) continue;
      // Registration is an import + one line in PROJECT_STORE_DELETERS; the imported
      // identifier appearing in the cascade source IS the registration.
      if (!new RegExp(`\\b${name}\\b`).test(cascadeSrc)) {
        offenders.push(`${relative(process.cwd(), file).split(sep).join("/")} → ${name}()`);
      }
    }
  }

  // Sanity: the scan must actually be finding stores, or the rule proves nothing.
  assert.ok(matched >= 16, `the signature scan matched only ${matched} store clears`);

  assert.deepEqual(
    offenders.sort(),
    [],
    "these per-project stores can wipe a project's data but are NOT in PROJECT_STORE_DELETERS " +
      "— register them in src/lib/projects/delete-cascade.ts, or add a documented ALLOWLIST " +
      `entry in this test:\n${offenders.join("\n")}`
  );
});

test("the allowlist stays honest — every entry still exists and carries a reason", () => {
  const names = new Set();
  for (const file of tsFiles(LIB)) for (const n of projectStoreClears(readFileSync(file, "utf8"))) names.add(n);
  for (const [name, reason] of Object.entries(ALLOWLIST)) {
    assert.ok(names.has(name), `allowlisted ${name}() no longer exists — drop the entry`);
    assert.ok(reason.length > 40, `allowlist entry ${name} needs a real reason`);
  }
});
