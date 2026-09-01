/** Every credential the threat model names has a way to be TAKEN AWAY.
 *
 *  `docs/security/threat-model.md` traces where each credential enters, rests and
 *  leaves, and `test-unit/threat-flows.test.mjs` holds each `TM-nn` flow to a suite
 *  that asserts the seam standing on it. Both answer questions about the credential
 *  while it is working. Neither answers the question asked at 3am: **this one has
 *  leaked — how do I replace it, and what breaks while I do?**
 *
 *  That procedure had no page. It is the one thing in this repository that would be
 *  performed under real time pressure and had never been rehearsed, written down or
 *  dated — while `docs/deploy.md` § Known red already owes the triage of eleven
 *  secret-scan findings whose own stated remedy is "any real credential means
 *  rotation". `docs/runbooks/credential-rotation.md` is the page;
 *  `.github/credential-rotation.json` is the half a machine can compare against the
 *  threat model; this file is what stops the two drifting apart.
 *
 *  WHAT BLOCKS IS THE SHAPE, NOT THE DATES.
 *
 *    • A flow the threat model declares and the registry does not is a credential
 *      nobody can rotate under pressure — and it arrives the ordinary way, in the
 *      diff that adds the fifteenth credential to a table of fourteen.
 *    • An entry naming a `TM-nn` the threat model no longer declares is a procedure
 *      for a flow that has moved. A rotted citation that keeps passing is worse than
 *      none, which is the same property test-unit/threat-flows.test.mjs holds.
 *    • A cited path that no longer exists sends the reader nowhere at the worst
 *      possible moment.
 *    • And the runbook has to be REACHABLE: registered in the staleness budget (so
 *      it goes red when the seams it describes move under it) and routed to from
 *      docs/task-index.md (so it is found by someone who has not read it before).
 *
 *  WHAT DOES NOT BLOCK: being unrotated. Every `lastRotated` / `lastDrilled` is
 *  null today and that is recorded rather than enforced — an expiry that turned
 *  master red on a morning nobody chose would be re-dated rather than acted on
 *  (docs/adr/0007-gate-rung-discipline.md). Rotating a live credential is a RED
 *  action under AGENTS.md § What you may do unattended, so nothing automated may
 *  ever fill those fields in.
 *
 *  Rung: blocking (ADR-0007 — it passes today). Runs inside `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`. Pure — reads files, runs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize as normalizePath } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_REL = ".github/credential-rotation.json";
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const registry = JSON.parse(read(REGISTRY_REL));
const entries = registry.credentials ?? [];
const RUNBOOK_REL = registry.runbook;
const THREAT_REL = registry.threatModel;

/** Every `TM-nn` the threat model DECLARES — the first column of its flow tables,
 *  which is the only place an id is introduced rather than referred to. Matching on
 *  the table-row shape (`| TM-01 |`) rather than on the bare id keeps prose that
 *  merely mentions a flow from counting as a declaration. */
function declaredFlows(markdown) {
  const out = new Set();
  for (const m of markdown.matchAll(/^\|\s*(TM-\d{2})\s*\|/gm)) out.add(m[1]);
  return out;
}

test("the runbook and the threat model the registry points at both exist", () => {
  for (const rel of [RUNBOOK_REL, THREAT_REL]) {
    assert.ok(rel, `${REGISTRY_REL} names no ${rel === RUNBOOK_REL ? "runbook" : "threatModel"}.`);
    assert.ok(
      existsSync(join(ROOT, normalizePath(rel))),
      `${REGISTRY_REL} points at ${rel}, which does not exist. The registry is the machine half of a page; ` +
        "without the page it is a table nobody reads under pressure."
    );
  }
});

const declared = declaredFlows(read(THREAT_REL));
const covered = new Set(entries.map((e) => e.flow));

test("the threat model declares flows at all — the parse still works", () => {
  // Without this, every assertion below would pass vacuously the day somebody
  // reformats the threat model's tables.
  assert.ok(
    declared.size >= 10,
    `only ${declared.size} TM-nn flow(s) parsed out of ${THREAT_REL}. The declaration is its table rows; if ` +
      "those have been reshaped, this whole file stops measuring anything."
  );
});

test("every credential the threat model names has a rotation procedure", () => {
  // The property that matters, and the one that fails the ordinary way: a diff adds
  // a credential to the threat model, and nothing anywhere says how to replace it.
  const unrotatable = [...declared].filter((f) => !covered.has(f)).sort();
  assert.deepEqual(
    unrotatable,
    [],
    `${THREAT_REL} declares ${unrotatable.join(", ")} and ${REGISTRY_REL} has no rotation entry. A credential ` +
      "that can be traced but not replaced is one somebody improvises a procedure for during the incident. Add " +
      `the entry, and its row in ${RUNBOOK_REL}.`
  );
});

test("no rotation procedure describes a flow the threat model has dropped", () => {
  const orphaned = [...covered].filter((f) => !declared.has(f)).sort();
  assert.deepEqual(
    orphaned,
    [],
    `${REGISTRY_REL} carries a procedure for ${orphaned.join(", ")}, which ${THREAT_REL} no longer declares. A ` +
      "procedure for a flow that has moved reads exactly like a current one."
  );
});

test("every entry says what it costs, how to verify it, and which shape it is", () => {
  const shapes = new Set(Object.keys(registry.shapes ?? {}));
  assert.ok(shapes.size >= 3, `${REGISTRY_REL} declares no rotation shapes.`);
  for (const e of entries) {
    assert.match(String(e.flow ?? ""), /^TM-\d{2}$/, `an entry has no well-formed \`flow\`: ${JSON.stringify(e)}`);
    assert.ok(e.name, `${e.flow}: no \`name\`.`);
    assert.ok(
      shapes.has(e.shape),
      `${e.flow}: shape "${e.shape}" is not one of ${[...shapes].join(" / ")}. The shape is what decides whether ` +
        "there is a window in which both values are live — `re-key` treated as an overlap loses tenant ciphertext."
    );
    assert.ok(["operator", "tenant"].includes(e.scope), `${e.flow}: \`scope\` must be operator or tenant.`);
    assert.ok(
      String(e.cost ?? "").length > 40,
      `${e.flow}: no \`cost\`. "What breaks while I rotate this?" is the question the runbook is opened for.`
    );
    assert.ok(
      String(e.verify ?? "").length > 20,
      `${e.flow}: no \`verify\`. Rotation is not finished when the variable is set — a rotation that silently ` +
        "left the deployment on sample data is the failure the verify step exists to catch."
    );
    assert.ok(Array.isArray(e.cites) && e.cites.length, `${e.flow}: cites nothing in the tree.`);
  }
});

test("every path a rotation procedure cites still exists", () => {
  const dead = [];
  for (const e of entries) {
    for (const c of e.cites ?? []) {
      if (!existsSync(join(ROOT, normalizePath(c)))) dead.push(`${c} (cited by ${e.flow})`);
    }
  }
  assert.deepEqual(
    dead,
    [],
    `${REGISTRY_REL} cites ${dead.length} path(s) that do not exist: ${dead.join(", ")}. The reader following ` +
      "one of these is mid-incident and has no budget to search for where it went."
  );
});

test("the dates are declared, even though none of them has happened", () => {
  // null is the honest value and it has to be PRESENT: an absent field and a
  // never-exercised procedure read identically, and only one is waiting for
  // somebody. Nothing here asserts a date IS set — see the file header.
  for (const e of entries) {
    for (const key of ["lastRotated", "lastDrilled"]) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(e, key),
        `${e.flow}: no \`${key}\`. Null means "never — and we know it"; missing means nobody decided.`
      );
      const v = e[key];
      assert.ok(
        v === null || /^\d{4}-\d{2}-\d{2}$/.test(String(v)),
        `${e.flow}.${key} must be null or YYYY-MM-DD, not ${JSON.stringify(v)}.`
      );
    }
  }
});

test("every flow in the registry is named by the runbook a human actually reads", () => {
  // The registry is the machine half. If the page stops naming a flow, the person
  // holding a leaked credential gets a table of fourteen and their own is not in it.
  const runbook = read(RUNBOOK_REL);
  const unmentioned = entries.map((e) => e.flow).filter((f) => !runbook.includes(f));
  assert.deepEqual(
    unmentioned,
    [],
    `${RUNBOOK_REL} never mentions ${unmentioned.join(", ")}. The JSON is not the runbook; a flow that only ` +
      "exists in the data is one nobody will find at 3am."
  );
});

test("the runbook is reachable — budgeted for staleness, and routed to", () => {
  // Two different ways to lose a runbook. It goes stale silently (the staleness
  // budget is what makes the seams it describes able to overtake it — and
  // test-unit/docs-staleness.test.mjs already refuses an unbudgeted runbook, so this
  // asserts the WATCHES are the credential seams rather than something incidental).
  const budget = JSON.parse(read(".github/docs-staleness.json"));
  const entry = (budget.docs ?? []).find((d) => d.doc === RUNBOOK_REL);
  assert.ok(entry, `${RUNBOOK_REL} has no entry in .github/docs-staleness.json.`);
  assert.ok(
    (entry.watches ?? []).includes(THREAT_REL),
    `${RUNBOOK_REL} is not watched against ${THREAT_REL}. That page is where a new credential arrives, so it is ` +
      "the one commit that must be able to overtake this runbook."
  );

  // And it is never found in the first place. docs/task-index.md is the lookup a
  // reader performs when they know the task and not the filename, which is exactly
  // the state somebody holding a leaked credential is in.
  assert.ok(
    read("docs/task-index.md").includes("runbooks/credential-rotation.md"),
    "docs/task-index.md does not route to the credential-rotation runbook. An index that omits the page read " +
      "under pressure omits the one it was written for."
  );
});
