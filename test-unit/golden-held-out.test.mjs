/** The goldens still carry the rules a re-bake may not absorb.
 *
 *  The contract goldens answer "did this change?" and the provenance ledger
 *  answers "was it accepted on purpose?". Neither can answer the question that
 *  actually decides whether the harness is honest: **was the expectation moved to
 *  agree with the output?** `npm run llm:eval:update -- --reason "…"` rewrites
 *  every golden to whatever the registry now says, and a reviewer looking at that
 *  diff sees a fingerprint and a wall of Czech prompt text. One deleted sentence
 *  does not show up in that reading, and the sentences held out in
 *  test-llm/held-out.mjs are the ones whose absence changes what the product tells
 *  an advertiser about their own money.
 *
 *  Two callers, one check, and this is the half that cannot be skipped:
 *
 *    scripts/llm-eval.mjs --update   refuses BEFORE it writes — but only when the
 *                                    accept tooling is what made the change.
 *    here                            runs against the COMMITTED goldens on every
 *                                    build, inside `npm run test:unit` →
 *                                    `check:ci` → `.husky/pre-push`. A golden
 *                                    edited by hand matches the registry (that is
 *                                    how it was edited) and sails through the
 *                                    drift check; it is caught here.
 *
 *  Blocking rung (docs/adr/0007-gate-rung-discipline.md): it passes today, so a
 *  red one is a regression rather than pre-existing debt.
 *
 *  Pure — reads files, calls no model, runs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HELD_OUT, heldOutRefusal, heldOutViolations } from "../test-llm/held-out.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN_DIR = join(ROOT, "test-llm", "golden");

/** The committed goldens, in the `{ id, system, schema }` shape the checker takes
 *  — the same shape the registry's tools have, which is what lets one function
 *  serve both callers. */
function committedGoldens() {
  return readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(GOLDEN_DIR, f), "utf8")))
    .filter((g) => g && typeof g.id === "string");
}

test("every held-out invariant still holds in the committed goldens", () => {
  const problems = heldOutViolations(committedGoldens());
  assert.deepEqual(problems, [], heldOutRefusal(problems));
});

test("a held-out rule names a golden that exists, and says what it is protecting", () => {
  for (const rule of HELD_OUT) {
    assert.ok(rule.id && rule.mustContain, `a held-out rule with no id or no phrase protects nothing.`);
    assert.ok(
      String(rule.why ?? "").length > 60,
      `${rule.id}: \`why\` must say what claim the phrase prevents. This list is only ever read at the moment ` +
        "somebody wants to remove an entry, which is exactly when the reason has to already be written."
    );
    assert.ok(rule.tools.length > 0, `${rule.id}: holds out nothing.`);
    for (const id of rule.tools) {
      assert.ok(
        existsSync(join(GOLDEN_DIR, `${id}.json`)),
        `${rule.id} holds out \`${id}\`, and test-llm/golden/${id}.json does not exist. An invariant on a tool ` +
          "that is gone is one nobody is checking any more."
      );
    }
  }
});

test("the check still DETECTS — a golden with the rule removed is refused", () => {
  // The half worth having: a check that has quietly stopped detecting looks
  // identical to one that keeps passing. Run the real function against a golden
  // with the phrase surgically removed and require it to complain.
  const [rule] = HELD_OUT;
  const [toolId] = rule.tools;
  const real = JSON.parse(readFileSync(join(GOLDEN_DIR, `${toolId}.json`), "utf8"));
  const gutted = { ...real, system: String(real.system).split(rule.mustContain).join("") };

  assert.notEqual(gutted.system, real.system, `the fixture did not actually remove "${rule.mustContain}".`);
  const problems = heldOutViolations([gutted]);
  assert.ok(
    problems.some((p) => p.rule === rule.id && p.tool === toolId),
    "a golden with a held-out instruction deleted was accepted. The tier that cannot be absorbed by a " +
      "`--reason` is only worth having while it still fires."
  );
});

test("the accept tooling runs this check before it writes", () => {
  const evalScript = readFileSync(join(ROOT, "scripts", "llm-eval.mjs"), "utf8");
  assert.match(
    evalScript,
    /heldOutViolations/,
    "scripts/llm-eval.mjs no longer calls heldOutViolations, so `npm run llm:eval:update` can rewrite a " +
      "golden past a rule that was supposed to be held out. This test catches the result on the next build; " +
      "the point of the call there is that the author is told at the moment they can still fix the prompt."
  );
});
