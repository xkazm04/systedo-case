/** Structural guard: every projects sub-resource under src/app/api/projects/[id]/**
 *  must route auth/ownership through the shared requireOwnedProject guard
 *  (src/lib/projects/api-guard.ts) — no route may re-inline the
 *  `currentUserId()` + `getProject()` + 401/404 handshake. This pins Direction 2's
 *  "one guard" outcome so a future route can't quietly hand-roll a divergent variant
 *  (the drift that let the [id] DELETE skip its ownership check). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src", "app", "api", "projects", "[id]");

function routeFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

test("no projects [id] route re-inlines the auth handshake outside the guard", () => {
  const files = routeFiles(ROOT);
  assert.ok(files.length >= 15, `expected the full sub-resource set, found ${files.length}`);

  const offenders = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    // `getProject(` (the ownership read) — note this does NOT match getProjectState(.
    // `currentUserId(` — the session read the guard now owns.
    if (/\bcurrentUserId\s*\(/.test(src) || /\bgetProject\s*\(/.test(src)) {
      offenders.push(file);
    }
    // Every route must actually import the shared guard.
    assert.match(
      src,
      /requireOwnedProject/,
      `${file} does not use the shared requireOwnedProject guard`
    );
  }

  assert.deepEqual(
    offenders,
    [],
    `these routes still inline currentUserId()/getProject() instead of the shared guard:\n${offenders.join("\n")}`
  );
});
