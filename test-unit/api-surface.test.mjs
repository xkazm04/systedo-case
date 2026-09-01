/** The published HTTP contract still describes the routes the router serves.
 *
 *  `docs/api/openapi.json` is the boundary an integrator and an agent both read,
 *  and until this file existed nothing compared it to `src/app/api/`. That is the
 *  worst state for a spec to be in: `npm run docs:parity` keeps the bilingual prose
 *  honest, so a reader reasonably assumes the machine-readable document is held to
 *  the same standard — while a route could gain a verb, rename the path parameter
 *  every caller interpolates, or quietly stop requiring a session, and the document
 *  would keep saying otherwise with complete confidence.
 *
 *  scripts/lib/api-surface-core.mjs derives the pinned half out of the tree and
 *  scripts/api-surface.mjs is the CLI. THIS is the wiring: the comparison runs on
 *  every build, inside `npm run test:unit` → `check:ci` → `.husky/pre-push`, rather
 *  than as another `check:ci` stage, because it is a few milliseconds of file reads
 *  and the stage list is ordered by a clock (`npm run gates:timings`).
 *
 *  RUNG: blocking (docs/adr/0007-gate-rung-discipline.md). It passes on the tree as
 *  it stands — 88 route modules, 88 documented paths — so a red one is a regression
 *  this change introduced, never inherited debt. The way back is never to edit the
 *  derived half: `npm run api:surface:write` re-derives it, keeps every written
 *  sentence, and leaves a diff to read.
 *
 *  Threat-model flow TM-05 (docs/security/threat-model.md § Credentials, by flow):
 *  `GOOGLE_ADS_DEVELOPER_TOKEN` travels to the Google Ads API alongside a tenant's own
 *  OAuth token, and what stands on it is `sast` `route-auth` — caller identity on every
 *  route that can reach it. The posture assertions below classify handlers with the
 *  SAME regex the security gate uses, so the document and the gate cannot hold two
 *  opinions about whether a route knows who is calling.
 *
 *  Pure — reads files, runs nothing, spends nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GUARD_RE,
  POSTURES,
  compareSurface,
  deriveSurface,
  routeFiles,
} from "../scripts/lib/api-surface-core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const SPEC_REL = "docs/api/openapi.json";

const surface = deriveSurface(ROOT);
const spec = JSON.parse(read(SPEC_REL));

test("the spec describes exactly what the router serves", () => {
  const findings = compareSurface(surface, spec);
  const detail = findings.map((f) => `  • ${f.path} — [${f.kind}] ${f.detail}`).join("\n");
  assert.deepEqual(
    findings,
    [],
    `${SPEC_REL} and src/app/api disagree:\n${detail}\n\n` +
      "The disagreement IS the change being caught — do not edit the derived half to silence it. " +
      "Re-derive with `npm run api:surface:write`, describe anything new, and read the diff."
  );
});

test("every route module is in the document, and the document invents none", () => {
  // compareSurface already catches both directions; this states the count on its
  // own, because "88 handlers, 88 paths" is the sentence that tells a reader the
  // artefact is a census rather than a sample.
  const files = routeFiles(ROOT);
  assert.ok(files.length > 50, `only ${files.length} route module(s) found — the derivation stopped seeing the tree.`);
  assert.equal(
    Object.keys(spec.paths ?? {}).length,
    Object.keys(surface).length,
    `${SPEC_REL} documents ${Object.keys(spec.paths ?? {}).length} path(s) and the router serves ` +
      `${Object.keys(surface).length}.`
  );
});

test("no route establishes no caller identity at all", () => {
  // The same finding `npm run sast` raises as `route-auth`, asserted here from the
  // document's side: an `unguarded` posture is not a posture, it is the finding.
  const unguarded = Object.entries(surface)
    .filter(([, r]) => r.auth === "unguarded")
    .map(([path, r]) => `${path} (${r.source})`);
  assert.deepEqual(unguarded, [], `${POSTURES.unguarded}\n  ${unguarded.join("\n  ")}`);
});

test("the document and the security gate cannot hold two opinions about a guard", () => {
  // GUARD_RE in api-surface-core.mjs is copied verbatim from scripts/sast.mjs. Two
  // classifiers for "does this handler know who is calling?" is worse than one, and
  // a copy is only safe while something notices it drifting.
  const sast = read("scripts/sast.mjs");
  assert.ok(
    sast.includes(GUARD_RE.source),
    "scripts/sast.mjs no longer contains the guard pattern scripts/lib/api-surface-core.mjs uses. The spec's " +
      "`x-adamant.auth` and the SAST `route-auth` rule have started disagreeing about what counts as a guard — " +
      "copy the gate's version back, or move both to one module."
  );
});

test("the check still detects — a spec that has drifted is refused", () => {
  // A comparison nobody has watched fail is a comparison nobody knows is wired. Run
  // the real comparator against a document mutated in the four ways that matter and
  // require a finding for each.
  const [samplePath] = Object.keys(surface);
  const clone = () => JSON.parse(JSON.stringify(spec));

  const droppedVerb = clone();
  for (const verb of ["get", "post", "put", "patch", "delete", "head", "options"]) {
    delete droppedVerb.paths[samplePath][verb];
  }
  assert.ok(
    compareSurface(surface, droppedVerb).some((f) => f.path === samplePath && f.kind === "methods"),
    "a spec that stopped documenting a route's verbs passed the comparison."
  );

  const movedAuth = clone();
  movedAuth.paths[samplePath]["x-adamant"].auth = "public";
  assert.ok(
    compareSurface(surface, movedAuth).some((f) => f.kind === "auth"),
    "a spec claiming a session route is public passed the comparison — that is the one drift that is a " +
      "security change rather than a documentation one."
  );

  const phantom = clone();
  phantom.paths["/api/does-not-exist"] = { "x-adamant": { source: "nowhere", auth: "public" } };
  assert.ok(
    compareSurface(surface, phantom).some((f) => f.kind === "phantom"),
    "a spec describing a route the router does not serve passed the comparison."
  );

  const undescribed = clone();
  const item = undescribed.paths[samplePath];
  const verb = ["get", "post", "put", "patch", "delete"].find((v) => v in item);
  item[verb].summary = "TODO — one sentence on what this operation does.";
  assert.ok(
    compareSurface(surface, undescribed).some((f) => f.kind === "undescribed"),
    "a route that landed with a TODO summary passed the comparison, so a new route can arrive undescribed."
  );
});

test("the gate is reachable by name", () => {
  const scripts = JSON.parse(read("package.json")).scripts ?? {};
  for (const name of ["api:surface", "api:surface:check", "api:surface:write"]) {
    assert.ok(scripts[name], `package.json defines no \`${name}\` script — the check has no way in.`);
  }
});
