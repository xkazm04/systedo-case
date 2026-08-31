#!/usr/bin/env node
/** When a fence actually fires, written down (zero-dependency).
 *
 *  WHY THIS EXISTS. Every fence in this repository blocks, and not one of them
 *  keeps a record of ever having blocked anything. `.github/contract-ledger.json`
 *  has had a `breaches: []` array per rule since the day it landed and it says so
 *  itself — "empty for every row today" — because the only thing that could ever
 *  fill it was `--record`, fed by hand from a rubric review that nobody folds in.
 *  So the census of what these rules are ABSORBING is live and the census of what
 *  they have CAUGHT is empty, and the two questions a blocking gate should be able
 *  to answer are the ones nothing can:
 *
 *    Which fence has not fired in six months? — it is dead weight in a chain that
 *      every change pays for, and it should be argued about rather than inherited.
 *    Which fires constantly? — it is either catching a real problem worth fixing
 *      at the source, or it is drawn in the wrong place. Both look identical from
 *      inside one red build, which is the only view anybody has today.
 *
 *  .github/workflows/agent-review-history.yml already answers exactly this for the
 *  rubric's Part A rules, and states the reasoning in those words. It can do it
 *  because Part A emits GitHub check annotations, which outlive their run. Nothing
 *  else here emits anything that outlives the terminal it printed to.
 *
 *  SO THE GATES RECORD. `printRemedy()` in scripts/gate-remedy.mjs is the one line
 *  every gate already runs on its way out when it goes red, and `scripts/sast.mjs`
 *  knows which of its ten rules produced each finding. Both now append a row here.
 *  Read it back with `npm run fences`.
 *
 *  WHAT IT IS NOT. This is a rolling LOCAL trail (`.fence-firings.jsonl`,
 *  git-ignored, same rule as `.gate-timings.json`), so it holds what this machine
 *  and this runner have seen — not the history of the repository. It starts empty
 *  and fills from the first red gate, which means for a while the honest answer to
 *  "has this fence ever fired?" is "nothing has recorded one yet", and `npm run
 *  fences` says that rather than implying the fence is dead. A count that starts
 *  today is worth more than one that never starts.
 *
 *  A FIXTURE RUN IS NOT A FIRING. Several unit tests run a gate against a
 *  deliberately red fixture to prove the gate can go red at all
 *  (test-unit/contract-ledger-ceiling.test.mjs is the clearest). Those must not
 *  land in the trail as evidence about this tree, so recording is off inside a
 *  test process, and `FENCE_FIRINGS=off` turns it off anywhere else.
 *
 *  Usage (as a library — there is no CLI here; the reader is scripts/fence-census.mjs):
 *    import { recordFiring, readFirings } from "./fence-firings.mjs";
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The rolling trail. Git-ignored: it is written by a RUN rather than by a change,
 *  and it is machine- and load-specific — the same reasoning `.gate-timings.json`
 *  is kept local under. */
export const FIRINGS_PATH = join(ROOT, ".fence-firings.jsonl");

/** Is recording on for this process? See the header: a fixture run is not a
 *  firing, and a caller that wants silence says so once. */
export function recordingEnabled(env = process.env) {
  if (String(env.FENCE_FIRINGS ?? "").trim().toLowerCase() === "off") return false;
  // node:test sets NODE_TEST_CONTEXT in each test file's process, and a gate the
  // test spawns inherits it. `npm_lifecycle_event` is the belt for that brace: npm
  // sets it to the script name, so a suite run through `npm run test:unit` is
  // recognised even if the test runner's own variable ever moves.
  if (String(env.NODE_TEST_CONTEXT ?? "").trim() !== "") return false;
  if (/^test(:|$)/.test(String(env.npm_lifecycle_event ?? "").trim())) return false;
  return true;
}

/**
 * Note that `fence` refused something, right now.
 *
 * Never throws and never changes an exit code: a gate that cannot write its own
 * trail must still print its finding. The whole point of this file is that it is
 * cheaper than the thing it records, so nothing here is allowed to be a new way
 * for a build to fail.
 *
 * @param {string} fence  the id the census knows it by — a `check:ci` stage name
 *                        (`sast`, `actions:check`) or a rule id (`route-auth`).
 * @param {{detail?: string, path?: string}} [extra]
 */
export function recordFiring(fence, extra = {}, { path = FIRINGS_PATH, env = process.env } = {}) {
  const id = String(fence ?? "").trim();
  if (!id || !recordingEnabled(env)) return false;
  try {
    const row = {
      fence: id,
      at: new Date().toISOString(),
      // Where it fired matters when reading the table: a fence that only ever goes
      // red on somebody's laptop is doing its job before a commit exists, which is
      // the best outcome and the one CI history cannot see.
      where: env.GITHUB_ACTIONS ? "ci" : "local",
      ...extra,
    };
    appendFileSync(path, `${JSON.stringify(row)}\n`);
    return true;
  } catch {
    return false;
  }
}

/** Every row in the trail, newest last. Unparseable lines are skipped rather than
 *  fatal — this is an append-only log written by processes that were already
 *  failing, and a torn last line must not take the reader down with it. */
export function readFirings(path = FIRINGS_PATH) {
  if (!existsSync(path)) return [];
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row.fence === "string" && typeof row.at === "string") rows.push(row);
    } catch {
      /* a torn line is not a reason to lose the rest of the trail */
    }
  }
  return rows;
}

/** `{ [fence]: { count, last, ci, local } }` over a trail. */
export function summarise(rows) {
  const by = {};
  for (const r of rows) {
    const e = (by[r.fence] ??= { count: 0, last: null, ci: 0, local: 0 });
    e.count += 1;
    if (!e.last || r.at > e.last) e.last = r.at;
    if (r.where === "ci") e.ci += 1;
    else e.local += 1;
  }
  return by;
}
