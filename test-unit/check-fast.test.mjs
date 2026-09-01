/** The inner loop's shape, held to the gate it is derived from.
 *
 *  `npm run check:fast` exists because the feedback loop and the gate had become the
 *  same command: sixteen stages, two of which cost minutes, paid in full for a
 *  one-line change. It is a SUBSET, and every subset in this repository carries the
 *  same obligation — it must be derived rather than listed, so it cannot drift from
 *  the chain, and it must be impossible to mistake for the verdict.
 *
 *  So this asserts the two things a list cannot be trusted to keep true on its own:
 *  every cheap stage of the declared chain is in the lane (a new gate joins it
 *  automatically), and the two expensive ones are NOT (the lane never quietly
 *  becomes the gate). Blocking, pure — it reads files and runs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAIN } from "../scripts/gate-remedy.mjs";
import { cheapStages, laneStages, OMITTED } from "../scripts/check-fast.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const pkg = JSON.parse(read("package.json"));
const runner = read("scripts/check-fast.mjs");

test("every cheap stage of the declared chain is in the fast lane", () => {
  // Derived, not listed: a gate added to check:ci and labelled `seconds` joins this
  // lane without anybody editing it, which is the only way a subset stays true.
  const lane = laneStages();
  for (const stage of cheapStages()) {
    assert.ok(
      lane.includes(stage),
      `\`${stage}\` is a "seconds" stage of the chain in scripts/gate-remedy.mjs and is not in the fast lane. ` +
        "The lane is meant to be derived from the chain — if it is being filtered by hand now, it will drift."
    );
  }
  assert.ok(cheapStages().length >= 10, `the chain declares ${cheapStages().length} cheap stage(s); expected at least 10.`);
});

test("the fast lane skips exactly the two stages that cost minutes, and says what they catch", () => {
  const lane = laneStages();
  assert.ok(!lane.includes("check"), "`check` (and therefore `next build`) is in the fast lane — it is what makes the gate slow.");
  assert.ok(
    !lane.includes("test:unit"),
    "the full unit suite is in the fast lane. `test:fast` is the scoped form; running both makes the lane the gate."
  );
  assert.ok(lane.includes("typecheck") && lane.includes("lint"), "the lane must still run the two cheap halves of `check`.");
  assert.ok(lane.includes("test:fast"), "the lane must still run the scoped suite, or it proves nothing about the tests.");

  for (const omitted of OMITTED) {
    assert.ok(
      CHAIN.some((s) => s.stage === omitted.stage),
      `scripts/check-fast.mjs says it omits \`${omitted.stage}\`, which is no longer a stage of the chain.`
    );
    assert.ok(String(omitted.missing).length > 40, `the omission of \`${omitted.stage}\` has to say what it would have caught.`);
  }
});

test("every stage the lane runs is a command that exists", () => {
  for (const stage of laneStages()) {
    assert.ok(pkg.scripts[stage], `the fast lane runs \`npm run ${stage}\`, which package.json does not define.`);
  }
});

test("check:fast is wired, and is NOT the gate", () => {
  assert.equal(pkg.scripts["check:fast"], "node scripts/check-fast.mjs");
  assert.ok(
    !(pkg.scripts["check:ci"] ?? "").includes("check:fast"),
    "`check:fast` has been added to check:ci. It skips `next build` and runs a subset of the suite — a gate " +
      "that can be green while the build is broken is worse than no gate."
  );
  assert.ok(
    /NOT the gate/.test(runner),
    "the runner no longer tells the reader what it did not run. A partial answer presented as a verdict is the " +
      "one failure mode a fast lane cannot afford."
  );
  const prePush = read(".husky/pre-push");
  assert.ok(
    !prePush.includes("check:fast"),
    ".husky/pre-push runs the fast lane. The push is the release act here (docs/deploy.md § Delivery contract); " +
      "it has to run `check:ci`."
  );
});
