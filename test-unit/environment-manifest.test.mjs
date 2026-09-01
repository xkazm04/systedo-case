/** The deploy target is declared, and the declaration still describes the tree.
 *
 *  THE PROBLEM. Every gate in this repository verifies a change on the way IN, and
 *  `master` ships on push — so the release act is a push that fifteen checks have
 *  already blessed. Past that point there was nothing: no environment manifest, no
 *  drift check, nothing an agent could read to know what runs where. The production
 *  target was described in a dashboard (not reviewable, not diffable) and in prose
 *  (nothing compares it to the tree), which means "the environment drifted from what
 *  the repository assumes" was a state no build could go red for. That asymmetry is
 *  where a well-gated repository still ships a surprise.
 *
 *  `.github/environments.json` is the declaration and `scripts/env-manifest.mjs` is
 *  the comparison. This file is what makes the comparison BLOCK: it runs the exact
 *  function the CLI runs, so `npm run test:unit` → `npm run check:ci` →
 *  `.husky/pre-push` refuses a push where the two have come apart — a cron added to
 *  vercel.json that nothing declares, a Node bump in one workflow and not the others,
 *  a new environment variable classified nowhere, a variable that must never be set
 *  in production drifting into the list a deployment may set.
 *
 *  WHAT IT DOES NOT CLAIM. It reads the repository, not the platform: whether a
 *  secret is actually set in the Vercel project, which region a function landed in,
 *  whether the Firestore TTL policy exists. That half needs an API token and is the
 *  operator's (docs/deploy.md § Post-deploy verification), and the manifest's own
 *  `cannotSee` list says so — asserted below, because a check that overstated its
 *  reach would leave the gap invisible AND believed closed.
 *
 *  Rung: blocking (ADR-0007 — it passes on the tree today).
 *
 *  Pure — reads files, runs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MANIFEST_PATH,
  environmentFindings,
  envExampleNames,
  readSources,
  workflowNodeVersions,
} from "../scripts/env-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const sources = readSources(ROOT);
const manifest = sources.manifest;

const CLASSES = new Set(["required", "optional", "local", "selfhosted", "bench", "build"]);

test("the manifest declares a target rather than a shape", () => {
  assert.equal(manifest.schema, 1, `${MANIFEST_PATH} changed schema — the readers have to follow it.`);
  assert.ok(
    (manifest.environments ?? []).some((e) => e.id === "production"),
    `${MANIFEST_PATH} declares no \`production\` environment, which is the one the push ships to.`
  );
  for (const e of manifest.environments ?? []) {
    for (const key of ["id", "platform", "branch", "promotion", "rollback", "dataStore", "nodeEnv"]) {
      assert.ok(e[key], `${e.id ?? "(unnamed)"}: environment declares no \`${key}\``);
    }
  }
  assert.ok(
    (manifest.crons?.schedules ?? []).length > 0,
    "the manifest declares no schedules, and vercel.json fires six. A cron runs against production on its own."
  );
  assert.ok(
    manifest.crons?.guardedBy,
    "the manifest does not say what guards the cron endpoints. They are unauthenticated URLs otherwise."
  );
});

test("every variable is classified, and a public one says so", () => {
  const env = manifest.env ?? {};
  assert.ok(Object.keys(env).length >= 50, `${MANIFEST_PATH} classifies ${Object.keys(env).length} variables — the`
    + " deployment reads far more than that, so the manifest has stopped being the surface it claims to be.");
  for (const [name, spec] of Object.entries(env)) {
    assert.ok(CLASSES.has(spec.class), `${name}: unknown class "${spec.class}" (expected ${[...CLASSES].join(" | ")})`);
    assert.ok(
      spec.scope === "server" || spec.scope === "public",
      `${name}: scope must be \`server\` or \`public\` — whether a value reaches the browser is the fact that decides`
        + " whether it may ever hold a secret."
    );
    assert.ok(
      spec.source === "env-example" || spec.source === "code",
      `${name}: \`source\` must say where a human reads about it — \`env-example\` or \`code\`.`
    );
  }
});

test("the declaration and the repository agree — runtime, schedules, configuration", () => {
  // The gate itself. Everything it compares is committed data, so a red here is
  // always a real divergence and never a flake.
  const findings = environmentFindings(sources);
  assert.deepEqual(
    findings,
    [],
    `${MANIFEST_PATH} no longer describes this repository. Move the declaration in the SAME diff as the change it `
      + "describes — never delete a row to go green, because the row firing IS the drift being caught. "
      + "`npm run env:manifest` prints the target."
  );
});

test("the check refuses a manifest that has drifted (it is wired, not decorative)", () => {
  // A gate nobody has seen fail is a gate nobody knows is wired. Three real drifts,
  // applied to a COPY of the live sources, each of which must be caught by name.
  const clone = () => ({ ...sources, manifest: JSON.parse(JSON.stringify(manifest)) });

  const undeclaredCron = clone();
  undeclaredCron.manifest.crons.schedules = undeclaredCron.manifest.crons.schedules.slice(1);
  assert.ok(
    environmentFindings(undeclaredCron).some((f) => f.startsWith("C1 crons")),
    "a cron that vercel.json fires and the manifest does not declare is not reported."
  );

  const bumpedNode = clone();
  bumpedNode.manifest.runtime.node.value = "26.x";
  assert.ok(
    environmentFindings(bumpedNode).some((f) => f.startsWith("R1 runtime.node")),
    "a Node range that no longer matches package.json engines is not reported."
  );

  const unclassified = clone();
  delete unclassified.manifest.env.CRON_SECRET;
  assert.ok(
    environmentFindings(unclassified).some((f) => f.startsWith("E1 env")),
    "a documented variable that the manifest classifies nowhere is not reported."
  );

  const forbiddenButAllowed = clone();
  forbiddenButAllowed.manifest.env.DEV_AUTH.class = "optional";
  assert.ok(
    environmentFindings(forbiddenButAllowed).some((f) => f.startsWith("E5 env")),
    "a variable that must never be set in production, reclassified as one a deployment may set, is not reported."
  );
});

test("the manifest is honest about the half it cannot read", () => {
  // The failure mode a declaration like this invites: it looks like infrastructure
  // as code, and it is a description of the repository's assumptions. Saying so in
  // the file is the difference between a gap that is visible and one that is
  // believed closed.
  assert.ok(
    (manifest.cannotSee ?? []).length >= 3,
    `${MANIFEST_PATH} no longer lists what it cannot see. It reads the repository, not the Vercel project — a `
      + "reader who forgets that will believe a green build says the platform is configured."
  );
});

test("the declaration is reachable from the loop and from the runbook", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(
    String(pkg.scripts?.["env:manifest"] ?? ""),
    /scripts\/env-manifest\.mjs/,
    "`npm run env:manifest` no longer prints the target. A declaration nobody can invoke is a file."
  );
  assert.match(
    String(pkg.scripts?.["env:manifest:check"] ?? ""),
    /--check/,
    "`npm run env:manifest:check` no longer fails on drift."
  );
  assert.ok(
    read("AGENTS.md").includes(MANIFEST_PATH),
    `AGENTS.md does not name ${MANIFEST_PATH}. An agent asking "what does production run?" then has nowhere to `
      + "look but a dashboard it has no access to."
  );
  assert.ok(
    read("docs/deploy.md").includes(MANIFEST_PATH),
    `docs/deploy.md does not point at ${MANIFEST_PATH}, so the runbook and the machine-readable declaration can `
      + "drift into two answers."
  );
});

test("the helpers read what they claim to read", () => {
  const names = envExampleNames(read(".env.example"));
  assert.ok(names.has("CRON_SECRET"), "the .env.example reader no longer finds an uncommented declaration.");
  assert.ok(names.has("LOCAL_DB"), "the .env.example reader no longer finds a commented-out declaration.");
  assert.ok(
    !names.has("ROTATION"),
    "the .env.example reader is matching prose. A sentence that mentions a variable is not a declaration of one."
  );
  const pinned = workflowNodeVersions(sources.workflows);
  assert.ok(pinned.length >= 5, `only ${pinned.length} workflow step(s) pin a node version — did the parser break?`);
});
