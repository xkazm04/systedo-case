/** The seam fences, proven to still FIRE — not merely to still be written down.
 *
 *  test-unit/lint-fences.test.mjs is the neighbouring test and it asks a different
 *  question: are the restricted names still SPELLED OUT in eslint.config.mjs, and do
 *  the messages still name a decision record? That catches somebody quietly deleting
 *  an entry to go green, and it is blind to the other way these rules die — the
 *  fence stays written and stops MATCHING. A `files:` glob that no longer covers the
 *  tree, a block ordering that lets a later `no-restricted-imports` replace an
 *  earlier one's options, an ESLint or `eslint-config-next` major that changes how
 *  `allowImportNames` behaves, a widened `globalIgnores`: every one of those leaves
 *  the strings exactly where this repository asserts they are, and turns the rule
 *  off. `npm run lint` then reports green forever, and a fence that silently passes
 *  is indistinguishable from a codebase with no violations.
 *
 *  So this runs the LINTER over deliberate violations (scripts/lint-fence-drill.mjs)
 *  and requires each rule to report — and over the code each fence deliberately
 *  allows, requiring silence, because a fence that has widened until it refuses
 *  legal code is the version somebody switches off.
 *
 *  Blocking, and green on arrival (docs/adr/0007-gate-rung-discipline.md): it runs
 *  inside `npm run test:unit` → `check:ci` → `.husky/pre-push`. It spawns the drill
 *  in a plain `node` rather than importing it, so ESLint and the Next config load
 *  under the flags `npm run lint` uses and not under this suite's
 *  `--conditions react-server`.
 *
 *  Threat-model flows TM-02 and TM-04 (docs/security/threat-model.md § Credentials, by
 *  flow): two of the three fences drilled here are SECURITY fences rather than
 *  architectural ones. `adamant/seams` is what keeps `FIREBASE_SERVICE_ACCOUNT` — and
 *  the tenant key the store layer applies with it — out of a route or a component, and
 *  the chokepoint fence is what keeps a provider key (and a tenant's decrypted BYOM
 *  key) from being handled by a second client somebody built elsewhere. The model
 *  names those fences as what stands on both flows; this is the file that proves they
 *  still fire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const DRILL_REL = "scripts/lint-fence-drill.mjs";
const DRILL = join(ROOT, DRILL_REL);

const runDrill = (args) =>
  spawnSync(process.execPath, [DRILL, ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

test("every seam fence still fires on a violation, and stays quiet on what it allows", () => {
  const res = runDrill(["--check"]);
  assert.equal(
    res.status,
    0,
    "a fence in eslint.config.mjs is not behaving as declared:\n\n" +
      `${res.stdout}\n${res.stderr}\n\n` +
      "The rule is still written down. What changed is whether the linter acts on it — fix the config, never " +
      "the expectation in the drill."
  );
  assert.match(res.stdout, /asked a violation/);
});

test("the drill goes red when the fences are taken away, so a green means something", () => {
  // The check that has stopped detecting is the failure mode this whole file is
  // about; leaving the drill itself on trust would be the same mistake one level up.
  const res = runDrill(["--without-fences"]);
  assert.equal(
    res.status,
    1,
    "the drill passed with the `adamant/*` blocks removed from the config. It is therefore not measuring the " +
      `fences at all:\n\n${res.stdout}\n${res.stderr}`
  );
  assert.match(
    `${res.stdout}${res.stderr}`,
    /did NOT report|removed nothing/,
    "with the fences gone the drill must fail because a rule stopped reporting — any other reason means the " +
      "control is measuring something else."
  );
});

test("every fence declared in eslint.config.mjs has a case in the drill", () => {
  // The property that stops this rotting: a FOURTH seam fence cannot land with
  // nothing rehearsing it, which is exactly how the first three came to be untested.
  const config = read("eslint.config.mjs");
  const drill = read(DRILL_REL);
  const declared = [...config.matchAll(/name:\s*"(adamant\/[a-z0-9-]+)"/g)].map((m) => m[1]);

  assert.ok(declared.length >= 4, `eslint.config.mjs declares ${declared.length} named fence(s); expected at least 4.`);
  for (const name of new Set(declared)) {
    assert.ok(
      drill.includes(`"${name}"`),
      `eslint.config.mjs declares the fence \`${name}\` and ${DRILL_REL} has no case for it. A fence nothing ` +
        "rehearses is a fence that can stop firing without anything going red."
    );
  }
});

test("the drill is wired to a command, and is not mistakeable for the gate itself", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["lint:fences"], "node scripts/lint-fence-drill.mjs");
  assert.equal(pkg.scripts["lint:fences:check"], "node scripts/lint-fence-drill.mjs --check");
  // It belongs in the unit suite, not as a fifteenth stage of check:ci: it costs one
  // ESLint config load, and `npm run lint` is what actually refuses the violation in
  // a contributor's tree. Adding it to the chain would also owe scripts/gate-remedy.mjs
  // an entry — see test-unit/gate-remedy.test.mjs.
  assert.ok(
    !(pkg.scripts["check:ci"] ?? "").includes("lint:fences"),
    "`lint:fences` has been added to check:ci without an entry in scripts/gate-remedy.mjs's CHAIN; the two are " +
      "held in step by test-unit/gate-remedy.test.mjs."
  );
});
