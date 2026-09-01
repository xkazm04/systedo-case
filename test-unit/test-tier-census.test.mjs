/** The fast lane's registry, held to the tree.
 *
 *  `npm run test:fast` exists so there is a signal a contributor or an agent can
 *  get mid-edit, instead of discovering the suite at push time. Its selection is
 *  derived — a test is run when it names a file you changed — and derived things
 *  do not rot. Its ALWAYS tier is a list, and lists do: an entry naming a suite
 *  that has been renamed silently shrinks the lane, and the lane keeps printing a
 *  confident count.
 *
 *  So the list blocks even though the lane does not (docs/adr/0007-gate-rung-discipline.md):
 *  this file runs inside `npm run test:unit` → `check:ci` → `.husky/pre-push`,
 *  while `test:fast` is deliberately outside all three. A subset that could be
 *  green while the suite is red must never be mistakeable for the gate, and the
 *  last assertion here is what keeps somebody from wiring it in.
 *
 *  Pure — reads files, runs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const TIERS_REL = ".github/test-tiers.json";
const tiers = JSON.parse(read(TIERS_REL));
const pkg = JSON.parse(read("package.json"));
const runner = read("scripts/test-fast.mjs");

const always = tiers.always ?? [];
const suite = readdirSync(join(ROOT, "test-unit")).filter((f) => f.endsWith(".test.mjs"));

test("every suite in the always tier still exists", () => {
  assert.ok(always.length >= 5, `${TIERS_REL} names ${always.length} always-on suite(s) — a lane that runs almost nothing is not a lane.`);
  assert.equal(new Set(always).size, always.length, "duplicate entry in the always tier");
  for (const rel of always) {
    assert.ok(
      existsSync(join(ROOT, rel)),
      `${TIERS_REL} names ${rel}, which does not exist. An entry pointing at a renamed suite shrinks the fast ` +
        "lane without changing the count it prints."
    );
    assert.match(rel, /^test-unit\/[\w.-]+\.test\.mjs$/, `${rel} is not a unit suite path.`);
  }
});

test("the always tier is a subset of the suite the gate runs", () => {
  for (const rel of always) {
    assert.ok(
      suite.includes(rel.slice("test-unit/".length)),
      `${rel} is in the fast lane and not in the unit suite \`npm run test:unit\` collects. The fast lane may ` +
        "only ever be a subset — a test that runs in one and not the other is a test with two answers."
    );
  }
});

test("the lane declares a budget, and says it is unmeasured rather than pretending", () => {
  assert.equal(typeof tiers.budgetSeconds, "number");
  assert.ok(tiers.budgetSeconds > 0, "a budget of zero is not a budget.");
  assert.match(
    JSON.stringify(tiers.$budget ?? ""),
    /UNMEASURED/,
    "the budget's own note has to say whether anybody has timed this lane. A number nobody measured, presented " +
      "as if they had, is how a threshold gets believed."
  );
});

test("the fast lane runs the suite under the same flags as the gate", () => {
  // A suite that passes here and fails in `test:unit` because of a resolver
  // condition or a missing setup import would teach people to distrust the fast
  // lane, which is the one thing it cannot afford.
  for (const flag of [
    "--conditions",
    "react-server",
    "./test-llm/setup.mjs",
    "--experimental-test-module-mocks",
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
  ]) {
    assert.ok(pkg.scripts["test:unit"].includes(flag), `test:unit no longer passes ${flag}`);
    assert.ok(
      runner.includes(flag),
      `scripts/test-fast.mjs no longer passes ${flag}, so the fast lane and the gate run the same files two ` +
        "different ways."
    );
  }
});

test("test:fast is wired, and is NOT a stage of check:ci", () => {
  assert.equal(pkg.scripts["test:fast"], "node scripts/test-fast.mjs");
  assert.ok(
    !(pkg.scripts["check:ci"] ?? "").includes("test:fast"),
    "`test:fast` has been added to check:ci. It is a SUBSET — it can be green while the suite is red, and a " +
      "gate that can do that is worse than no gate. `test:unit` is what decides a build."
  );
  assert.ok(
    /NOT the gate/.test(runner),
    "the runner no longer tells the reader what it did not run. A subset that presents itself as a verdict is " +
      "the failure mode this lane has to keep refusing."
  );
});
