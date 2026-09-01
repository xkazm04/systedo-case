/** The interruption drill's catalogue — the half that can block on every build.
 *
 *  `npm run interrupt:drill` kills real processes and reads what survived, which is
 *  exactly the kind of thing that behaves differently on a loaded shared runner, so
 *  it is REPORTING and weekly (docs/adr/0007-gate-rung-discipline.md). That leaves
 *  the failure a weekly reporting drill cannot catch on its own: a scenario whose
 *  ANCHOR has drifted. It still runs, it still passes, and it is no longer
 *  exercising the code it claims to — a score that keeps printing while the
 *  property it stood for is unmeasured. Exactly the reason
 *  test-unit/mutation-census.test.mjs exists next to the mutation drill.
 *
 *  So this asserts the catalogue's shape, and asserts it against the tree:
 *
 *    • every scenario names the file whose behaviour it exercises, and a string
 *      that is still in it;
 *    • every scenario states what it damages AND the question it asks, because a
 *      drill whose scenarios do not say what they are for gets pruned by whoever
 *      is trying to make the week green;
 *    • the drill still uses the REAL checkpoint CLI against a SCRATCH directory —
 *      a drill that reimplements the thing it tests proves nothing, and one that
 *      writes into `.agent/checkpoints/` would eat the handoff of whoever is
 *      working in this checkout;
 *    • and the whole point: the interruption is a real kill. A scenario that
 *      politely asked a process to stop would be rehearsing a shutdown.
 *
 *  Rung: BLOCKING. It passes today. Runs inside `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`.
 *
 *  Pure — imports the catalogue and reads files. It never runs the drill: importing
 *  scripts/interrupt-drill.mjs does not execute it (the CLI half is guarded by an
 *  invoked-directly check, which this file also asserts is still there).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CATALOGUE } from "../scripts/interrupt-drill.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const DRILL_REL = "scripts/interrupt-drill.mjs";

test("the catalogue covers the ways a lane is actually stopped", () => {
  assert.ok(
    CATALOGUE.length >= 5,
    `${DRILL_REL} has ${CATALOGUE.length} scenario(s). The interruption has more than one shape — the kill lands ` +
      "before the write, during it, or after a run that never recorded a next step, and they fail differently."
  );
  const ids = new Set();
  for (const s of CATALOGUE) {
    assert.ok(s.id, `${DRILL_REL}: a scenario has no \`id\`.`);
    assert.ok(!ids.has(s.id), `${DRILL_REL}: scenario \`${s.id}\` is declared twice.`);
    ids.add(s.id);
    assert.ok(
      typeof s.what === "string" && s.what.length > 20,
      `${s.id}: \`what\` must say what the interruption DAMAGES, in a sentence.`
    );
    assert.ok(
      typeof s.asks === "string" && s.asks.length > 20,
      `${s.id}: \`asks\` must say what the next lane needs to be true afterwards. A scenario that does not say ` +
        "what it is for is the first one deleted when the week has to be green."
    );
    assert.equal(typeof s.run, "function", `${s.id}: \`run\` must be the scenario itself.`);
  }
  // The two shapes the log actually shows: a kill mid-task, and a run that
  // committed partial work. Both have a scenario, by name.
  assert.ok(ids.has("killed-mid-session"), `${DRILL_REL}: no scenario kills a lane mid-session — that is the drill.`);
  assert.ok(
    ids.has("commit-fold-never-invents"),
    `${DRILL_REL}: no scenario covers the partial-work commit, which is the artefact this repository's log ` +
      "actually shows (`chore: partial work from an interrupted lane session`)."
  );
});

test("every scenario's anchor still exists in the file it names", () => {
  // The failure this catches: the checkpoint CLI is refactored, the string a
  // scenario asserts against moves, and the scenario now exercises nothing while
  // still scoring a pass every week.
  const drifted = [];
  for (const s of CATALOGUE) {
    assert.ok(s.anchor?.file && s.anchor?.contains, `${s.id}: no \`anchor\` — nothing holds it to the tree.`);
    if (!existsSync(join(ROOT, s.anchor.file))) {
      drifted.push(`${s.id}: ${s.anchor.file} does not exist`);
      continue;
    }
    if (!read(s.anchor.file).includes(s.anchor.contains)) {
      drifted.push(`${s.id}: ${s.anchor.file} no longer contains ${JSON.stringify(s.anchor.contains)}`);
    }
  }
  assert.deepEqual(
    drifted,
    [],
    `${drifted.length} scenario(s) have drifted off the code they claim to exercise:\n  ${drifted.join("\n  ")}\n\n` +
      "Re-point the anchor at where the behaviour went — and check the scenario still asserts it. A drill whose " +
      "anchors have moved keeps printing a score for a property nobody is measuring."
  );
});

test("the drill uses the real checkpoint CLI, against a scratch directory", () => {
  const drill = read(DRILL_REL);
  assert.match(
    drill,
    /agent-checkpoint\.mjs/,
    `${DRILL_REL} no longer runs scripts/agent-checkpoint.mjs. A drill that reimplements the handoff proves ` +
      "something about the drill."
  );
  assert.match(
    drill,
    /ADAMANT_CHECKPOINT_DIR/,
    `${DRILL_REL} no longer redirects the checkpoint directory. Without it the drill writes into ` +
      ".agent/checkpoints/ and eats the handoff of whoever is working in this checkout."
  );
  assert.match(
    drill,
    /mkdtempSync/,
    `${DRILL_REL} no longer allocates a scratch directory per scenario, so scenarios can see each other's files.`
  );
  assert.match(
    drill,
    /ADAMANT_CHECKPOINT_DIR:\s*dir/,
    `${DRILL_REL} no longer SETS the override for its children — a drill that only reads it is pointing at ` +
      "whatever directory the caller happened to be using."
  );
});

test("the interruption is a real kill, not a polite request", () => {
  const drill = read(DRILL_REL);
  assert.match(
    drill,
    /kill\("SIGKILL"\)/,
    `${DRILL_REL} no longer SIGKILLs the child. A lane stopped by its harness does not get to run a handler, so a ` +
      "drill that sends something catchable is rehearsing a clean shutdown — the one case that was never the problem."
  );
  assert.match(
    drill,
    /spawn\(/,
    `${DRILL_REL} no longer spawns a process to kill, so nothing is being interrupted.`
  );
});

test("the checkpoint directory override exists for this and nothing else", () => {
  const cli = read("scripts/agent-checkpoint.mjs");
  assert.match(
    cli,
    /process\.env\.ADAMANT_CHECKPOINT_DIR/,
    "scripts/agent-checkpoint.mjs no longer honours ADAMANT_CHECKPOINT_DIR, so the interruption cannot be " +
      "rehearsed anywhere but the live handoff directory."
  );
  // It is an affordance for the drill, not a configuration knob. Nothing that
  // runs in a session, a hook or the gate chain may set it: a checkout whose
  // checkpoints silently went somewhere else is a checkout with no handoff.
  const leaks = [];
  for (const rel of [".husky/pre-commit", ".husky/pre-push", "package.json", ".github/workflows/ci.yml"]) {
    if (existsSync(join(ROOT, rel)) && read(rel).includes("ADAMANT_CHECKPOINT_DIR")) leaks.push(rel);
  }
  assert.deepEqual(
    leaks,
    [],
    `ADAMANT_CHECKPOINT_DIR is set in ${leaks.join(", ")}. It redirects where a stopped run's handoff lands, and ` +
      "the only caller that may do that is the drill."
  );
});

test("the drill is reporting-rung — it is not in the blocking chain", () => {
  // ADR-0007. It spawns and kills processes; that belongs in a weekly job, never
  // in the gate that stands between a change and master.
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.scripts["interrupt:drill"], "package.json defines no `interrupt:drill` — the drill has no way to run.");
  assert.ok(
    !pkg.scripts["check:ci"].includes("interrupt:drill"),
    "`interrupt:drill` is in check:ci. It kills processes and reads what survived, which is not a thing to do " +
      "between a change and master (ADR-0007) — it runs weekly, and this census is its blocking half."
  );
});
