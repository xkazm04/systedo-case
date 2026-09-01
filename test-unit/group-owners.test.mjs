/** Every context GROUP is answered for — the blocking half of group ownership.
 *
 *  THE PROBLEM. .github/CODEOWNERS is drawn per FILE and deliberately narrow: about
 *  fifteen law files, with its own first line saying everything else is open season.
 *  That is the right shape for the rule GitHub acts on. The system, meanwhile, is
 *  described per GROUP — 117 contexts in 16 groups in context-map.json — and nothing
 *  joined the two. So a whole group could gain files, gain cross-group imports and
 *  gain source no context maps, and nothing here could say that nobody answers for
 *  it. `npm run owners:groups` prints the join; this is what stops the declaration
 *  drifting away from the map it describes.
 *
 *  Same split as `npm run fences` and the mutation census: the INVENTORY blocks on
 *  every build, the measurement is a print. A group with no owner reads exactly like
 *  a group whose owner has been reading it.
 *
 *  Rung: blocking (ADR-0007 — it passes today). Runs inside `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`.
 *
 *  Pure — reads files, runs nothing, writes nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const DECL_REL = ".github/group-owners.json";
const MAP_REL = "context-map.json";
const CODEOWNERS_REL = ".github/CODEOWNERS";

const declaration = JSON.parse(read(DECL_REL));
const map = JSON.parse(read(MAP_REL));
const codeowners = read(CODEOWNERS_REL);

const rows = declaration.groups ?? [];
const mapGroups = map.groups ?? [];

/** The handles CODEOWNERS actually routes to. */
const handles = new Set();
for (const raw of codeowners.split(/\r?\n/)) {
  const line = raw.replace(/#.*$/, "").trim();
  if (!line) continue;
  for (const token of line.split(/\s+/).slice(1)) if (token.startsWith("@")) handles.add(token);
}

test("the declaration is well formed and says what it cannot see", () => {
  assert.ok(Array.isArray(rows) && rows.length > 0, `${DECL_REL} declares no groups.`);
  assert.ok(
    Array.isArray(declaration.$cannotSee) && declaration.$cannotSee.length >= 3,
    `${DECL_REL} must state what a declared owner does NOT prove. A row records who answers for a group; it is ` +
      "not evidence that anybody read it, and a list of names with no such sentence next to it reads as one."
  );
  const seen = new Set();
  for (const r of rows) {
    assert.ok(r.group, "a row with no `group`");
    assert.ok(!seen.has(r.group), `two rows claim "${r.group}"`);
    seen.add(r.group);
  }
});

test("G1 — every group the context map holds has somebody who answers for it", () => {
  // The gap this exists for: a context scan adds a group, the declaration does not
  // move, and the weekly triage pass skips a whole area of the system without anyone
  // being able to say which one.
  const declared = new Set(rows.map((r) => r.group));
  const missing = mapGroups.filter((g) => !declared.has(g.name)).map((g) => `${g.name} (${g.domain})`);
  assert.deepEqual(
    missing,
    [],
    `${MAP_REL} holds group(s) that ${DECL_REL} does not: add a row with the owner, the reason a wrong change ` +
      "there costs something, and where it sits in the weekly triage order."
  );
});

test("G2 — and no row survives the group it was written for", () => {
  // The other direction, for the same reason a stale CODEOWNERS path is worse than
  // none: a declaration that has stopped describing the tree still reads current.
  const live = new Set(mapGroups.map((g) => g.name));
  const stale = rows.filter((r) => !live.has(r.group)).map((r) => r.group);
  assert.deepEqual(
    stale,
    [],
    `${DECL_REL} declares owners for group(s) ${MAP_REL} no longer has. Drop the row in the diff that dropped ` +
      "the group, or re-point it at whatever the rescan renamed it to."
  );
});

test("G3 — an owner is a handle CODEOWNERS can actually route to", () => {
  // A name that GitHub has never heard of is not an owner. If a group genuinely
  // needs a second person, they arrive in CODEOWNERS first, where a review request
  // can reach them.
  const problems = rows
    .filter((r) => !handles.has(r.owner))
    .map((r) => `${r.group} → ${r.owner ?? "(none)"}`);
  assert.deepEqual(problems, [], `${CODEOWNERS_REL} names none of these owners.`);
});

test("G4/G5 — every row says why, and where it sits in the weekly pass", () => {
  const problems = [];
  for (const r of rows) {
    if (!String(r.why ?? "").trim()) problems.push(`${r.group}: no \`why\``);
    if (!Number.isInteger(r.triageRank) || r.triageRank < 1) {
      problems.push(`${r.group}: triageRank ${JSON.stringify(r.triageRank)} is not a positive integer`);
    }
  }
  assert.deepEqual(
    problems,
    [],
    "a rank with no reason next to it is a preference, and a list with no rank is not an order. The ordering is " +
      "the artefact this file adds — before it, the triage pass read whatever it scrolled past first."
  );
});

test("the ranking actually discriminates — everything-is-rank-1 is a list again", () => {
  // The failure this catches is the cheap one: a group added under whatever rank the
  // last row used, until every group shares one and the order says nothing.
  const distinct = new Set(rows.map((r) => r.triageRank));
  assert.ok(
    distinct.size >= 3,
    `all ${rows.length} groups share ${distinct.size} rank(s). The point of the rank is that the groups where a ` +
      "wrong change is a bill or a breach are read before the ones where it is a layout regression."
  );
});

test("the join is reachable — a declaration nobody can print is not a declaration", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(existsSync(join(ROOT, "scripts/group-owners.mjs")), "scripts/group-owners.mjs is gone.");
  assert.match(
    String(pkg.scripts?.["owners:groups"] ?? ""),
    /scripts\/group-owners\.mjs/,
    "`npm run owners:groups` no longer prints the join between CODEOWNERS and the context map."
  );
  assert.match(
    String(pkg.scripts?.["owners:groups:check"] ?? ""),
    /scripts\/group-owners\.mjs.*--check/,
    "`npm run owners:groups:check` no longer runs the checks this file asserts, so a maintainer fixing a red " +
      "build here has no command to re-run."
  );
});
