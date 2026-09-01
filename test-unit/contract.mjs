/** What a red test SAYS — the rule that broke, not only the value that differed.
 *
 *  Not a test. A helper the seam suites import (the glob is
 *  `test-unit/**\/*.test.mjs`, so this file is never executed as one).
 *
 *  THE GAP THIS CLOSES. `eslint.config.mjs` already makes the argument for lint
 *  refusals: a fence whose message names the seam, the reason and the way out is
 *  cheaper than one that names a symbol, because the reader is usually an agent
 *  re-deriving the constraint from scratch. The suite never made that move. A
 *  mutant that inverts the cron guard's fail-closed branch produces:
 *
 *      AssertionError: Expected values to be strictly equal: true !== false
 *          at test-unit/cron-auth.test.mjs:52
 *
 *  which says a boolean differed. It does not say that six `/api/cron/*` endpoints
 *  just became public, that the rule is `security-rules`, that it is stated in
 *  AGENTS.md, or which of the fences around it was the one that caught this. The
 *  reader reconstructs all of that from the test's NAME and whatever the file's
 *  header happens to explain — and a reader who reconstructs a contract from a name
 *  is a reader who can talk themselves into weakening the assertion.
 *
 *  WHERE THE WORDS COME FROM. Not from here. Every fact in the message is read out
 *  of `.github/constraint-map.json` — the file that already answers "if I get this
 *  wrong, will anything notice?" — so a message can never name a rule the map does
 *  not have, quote a sentence that moved, or claim a fence that was removed.
 *  `unknownContract()` throws on an id the map does not carry, which makes a typo a
 *  loud failure at import rather than a plausible-looking wrong citation in a
 *  failure nobody re-reads.
 *
 *  WHAT IT DELIBERATELY DOES NOT DO. It does not assert anything and it changes no
 *  outcome: a suite using it goes red on exactly the inputs it went red on before.
 *  The only thing that changes is what the reader is told, which is the whole point
 *  — `test-unit/failure-contract.test.mjs` is what keeps it from rotting.
 *
 *  Usage:
 *
 *      import { contract } from "./contract.mjs";
 *      const failsClosed = contract("security-rules");
 *      assert.equal(
 *        cronAuthorized(req("Bearer anything")),
 *        false,
 *        failsClosed("with no CRON_SECRET configured, an unauthenticated cron probe is refused")
 *      );
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The map is the source of every word below; naming it in the message is what
 *  lets a reader go and check the citation. */
export const CONSTRAINT_MAP_REL = ".github/constraint-map.json";

/** The routing table from a seam to the record that decided it. Named rather than
 *  resolved: this helper does not get to guess which ADR governs a rule, and a
 *  pointer to the router is more honest than a pointer to the wrong record. */
export const ROUTE_REL = "docs/task-index.md";

const map = JSON.parse(readFileSync(join(ROOT, CONSTRAINT_MAP_REL), "utf8"));

/** id → the map's row. Built once, at import. */
const BY_ID = new Map((map.constraints ?? []).map((c) => [c.id, c]));

/** Every rule id the map carries, for the census test. */
export function constraintIds() {
  return [...BY_ID.keys()];
}

/** The map's row, or a throw naming what is available. A wrong id must not
 *  degrade into a message that cites a rule nobody wrote. */
export function constraintOf(id) {
  const row = BY_ID.get(id);
  if (!row) {
    throw new Error(
      `contract("${id}"): ${CONSTRAINT_MAP_REL} has no rule with that id. ` +
        "A failure message may only cite a rule the map carries — otherwise the citation rots silently " +
        `while the assertion keeps passing. Known ids: ${constraintIds().join(", ")}`
    );
  }
  return row;
}

/** `kind name` per fence, e.g. `lint adamant/seams, gate llm:gate:check`. */
function fencesOf(row) {
  const list = (row.enforcement ?? []).map((e) => `${e.kind} ${e.name}`);
  return list.length ? list.join(", ") : "nothing (honour rule)";
}

/** The block appended under an assertion's own sentence. Exported so the census
 *  can check what a reader actually sees, rather than checking that a function
 *  exists. */
export function contractBlock(id) {
  const row = constraintOf(id);
  return [
    "",
    `  contract: ${row.id} — ${row.rule}`,
    `  rung:     ${row.rung} · enforced by ${fencesOf(row)}`,
    `  stated:   ${row.statedIn?.file ?? "(unstated)"}`,
    `  route:    ${ROUTE_REL} (the record that decided this seam) · ${CONSTRAINT_MAP_REL} (the rule)`,
  ].join("\n");
}

/** `contract(id)` returns the message-builder for one rule.
 *
 *  The argument is the EXPECTATION in the reader's own words — "an unauthenticated
 *  cron probe is refused", not "expected false". Everything after it is the
 *  citation, and none of it is written here.
 */
export function contract(id) {
  const block = contractBlock(id); // throws now, not inside a failing assertion
  return (expectation) => `${expectation}${block}`;
}
