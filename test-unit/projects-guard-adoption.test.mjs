/** Structural guard: every projects sub-resource under src/app/api/projects/[id]/**
 *  must route auth/ownership through the shared requireOwnedProject guard
 *  (src/lib/projects/api-guard.ts) — no route may re-inline the
 *  `currentUserId()` + `getProject()` + 401/404 handshake. This pins Direction 2's
 *  "one guard" outcome so a future route can't quietly hand-roll a divergent variant
 *  (the drift that let the [id] DELETE skip its ownership check). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(process.cwd(), "src", "app", "api", "projects", "[id]");
const API_ROOT = join(process.cwd(), "src", "app", "api");

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

/** Second structural guard, same doctrine one layer earlier: a wire-supplied
 *  `projectId` must be PROVED to be the caller's BEFORE it is composed into a tenant
 *  key (rejectUnknownProject, src/lib/projects/api-guard.ts).
 *
 *  The failure this pins is not a 500 — it is silence. `resolveTenant` on an
 *  unverified id does not fail; it mints a FRESH EMPTY tenant, so the route answers
 *  "nothing here yet" and leaves an orphan that projects/delete-cascade.ts can never
 *  reach. Declared-then-proven: the doctrine was declared in api-guard.ts's own
 *  comment while only 4 of the eligible routes followed it.
 *
 *  Candidates are DERIVED (a route that resolves a tenant AND reads a wire
 *  projectId), not listed, so a NEW route lands in one of two buckets deliberately:
 *  it adopts the guard, or someone adds it to EXEMPT with a reason. */

/** Candidate routes that do NOT carry the guard, each with the reason. This list is
 *  the honest backlog: it may shrink, never grow. (Routes whose projectId never came
 *  off the wire — the crons, and projects/[id]/* whose path id requireOwnedProject
 *  already proves — are not candidates at all and need no entry here.) */
const EXEMPT = new Map([
  ["campaigns/analyze/batch/route.ts", "backlog: sibling of campaigns/analyze, not yet adopted"],
  ["experiments/route.ts", "backlog: not yet adopted"],
  ["images/route.ts", "backlog: not yet adopted"],
  ["images/nobg/route.ts", "backlog: not yet adopted"],
  ["images/attribution/route.ts", "backlog: not yet adopted"],
  ["images/file/[id]/route.ts", "backlog: not yet adopted"],
  ["keywords/lists/route.ts", "backlog: not yet adopted"],
  ["patterns/route.ts", "backlog: not yet adopted"],
  ["patterns/search/route.ts", "backlog: not yet adopted"],
]);

function apiRoutes(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...apiRoutes(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

test("every tenant-keyed route proves a wire projectId before composing a tenant key", () => {
  const composes = /\bresolveTenant\s*\(|\bresolveCampaignContext\s*\(|\bresolveTenantForAccount\s*\(/;
  // A projectId that came off the wire: a query param or a body field.
  const wireProjectId =
    /searchParams\.get\(\s*["']projectId["']\s*\)|body[^\n]*\bprojectId\b|\{\s*projectId\?/;

  const candidates = [];
  for (const file of apiRoutes(API_ROOT)) {
    const src = readFileSync(file, "utf8");
    if (!composes.test(src) || !wireProjectId.test(src)) continue;
    candidates.push([relative(API_ROOT, file).split(sep).join("/"), src]);
  }

  // Instrument assertion: an empty walk must fail LOUDLY rather than pass clean —
  // a gate that sees nothing is the false green this class of test exists to avoid.
  assert.ok(candidates.length >= 10, `expected the tenant-keyed route set, found ${candidates.length}`);

  const offenders = candidates
    .filter(([rel, src]) => !EXEMPT.has(rel) && !/rejectUnknownProject/.test(src))
    .map(([rel]) => rel);

  assert.deepEqual(
    offenders,
    [],
    `these routes turn a wire projectId into a tenant key without proving it first:\n${offenders.join("\n")}\n` +
      `Adopt rejectUnknownProject, or add the route to EXEMPT with the reason it is safe.`
  );

  // The exemption list is itself checked: a stale entry (route renamed or deleted,
  // or one that HAS since adopted the guard) must be removed, not left to rot.
  const names = new Set(candidates.map(([rel]) => rel));
  const stale = [...EXEMPT.keys()].filter((rel) => !names.has(rel));
  assert.deepEqual(stale, [], `EXEMPT names routes that are no longer candidates:\n${stale.join("\n")}`);
});

test("the routes this direction adopted still carry the guard", () => {
  // Named explicitly, so a later refactor that drops the call from one of them fails
  // here even if the derivation above stops classifying it as a candidate.
  const adopted = [
    "activity/route.ts",
    "alerts/route.ts",
    "campaigns/route.ts",
    "campaigns/analyze/route.ts",
    "campaigns/control-plane/route.ts",
    "campaigns/report-config/route.ts",
    "campaigns/share/route.ts",
    "microsite/route.ts",
    "social/messages/route.ts",
    "social/posts/route.ts",
  ];
  for (const rel of adopted) {
    const src = readFileSync(join(API_ROOT, ...rel.split("/")), "utf8");
    assert.match(src, /rejectUnknownProject/, `${rel} lost its rejectUnknownProject guard`);
  }
});
