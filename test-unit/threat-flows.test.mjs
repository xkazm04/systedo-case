/** The threat model, traced back to the suite — in both directions.
 *
 *  `docs/security/threat-model.md` names where every credential enters, rests and
 *  leaves, and `SECURITY.md` is candid that the worst case here is somebody spending
 *  an advertiser's budget. The suite proves the seams broadly; until the `TM-nn` ids
 *  landed, nothing tied a specific flow in that document to a specific assertion, so
 *  a refactor that widened a credential path stayed green and the page stayed
 *  confident.
 *
 *  BLOCKING (docs/adr/0007-gate-rung-discipline.md), and green on arrival: fourteen
 *  of the fifteen flows are claimed today and the fifteenth is on the untraced list
 *  with the reason no assertion is possible. It runs inside `npm run test:unit` →
 *  `check:ci` → `.husky/pre-push`.
 *
 *  The two detector tests are what make the first one worth reading: the REAL gate is
 *  pointed at a model whose module has moved, and at a tree where no suite claims
 *  anything, and it has to go red on both. A traceability check that passes either
 *  way traces nothing.
 *
 *  NOTE FOR THE NEXT READER: this file is excluded from the claim scan by name
 *  (`CENSUS_REL` in scripts/threat-flows.mjs) — it names every flow id in its own
 *  assertions, so counting it would make every flow look asserted by construction.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CENSUS_REL,
  THREAT_MODEL_REL,
  UNTRACED,
  UNTRACED_CEILING,
  auditFlows,
  claimsIn,
  parseFlows,
} from "../scripts/threat-flows.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const GATE = join(ROOT, "scripts", "threat-flows.mjs");

const run = (args) =>
  spawnSync(process.execPath, [GATE, ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const output = (res) => `${res.stdout ?? ""}${res.stderr ?? ""}`;
const tempFile = (name, text) => {
  const path = join(mkdtempSync(join(tmpdir(), "threat-flows-")), name);
  writeFileSync(path, text);
  return path;
};

test("every credential flow the threat model declares is asserted by a suite that names it", () => {
  const res = run(["--check"]);
  assert.equal(
    res.status,
    0,
    `\`npm run threat:flows:check\` is red:\n\n${output(res).slice(-4000)}\n\n` +
      "A credential flow is described in the model and nothing in the suite points back at it."
  );
});

test("the model declares its flows in a shape a machine can read", () => {
  const flows = parseFlows(read(THREAT_MODEL_REL));
  assert.ok(
    flows.length >= 15,
    `${THREAT_MODEL_REL} declares ${flows.length} flow(s) with a \`TM-nn\` id. The model names more credentials ` +
      "than that, so a column has been lost — and a traceability check with nothing to trace is green everywhere."
  );
  const ids = flows.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, "a flow id names one flow; two rows carry the same one.");
  for (const flow of flows) {
    assert.ok(flow.credential, `${flow.id}: names no credential.`);
    assert.ok(flow.standsOn, `${flow.id}: says nothing about what stands on it.`);
  }
});

test("no suite cites a flow the model has dropped", () => {
  // The citation-rot direction. A test naming TM-09 after the row was renumbered
  // keeps passing while telling its reader about a credential path that is gone.
  const declared = new Set(parseFlows(read(THREAT_MODEL_REL)).map((f) => f.id));
  for (const [file, ids] of claimsIn(join(ROOT, "test-unit"))) {
    for (const id of ids) {
      assert.ok(
        declared.has(id),
        `${file} cites ${id}, which ${THREAT_MODEL_REL} does not declare. Follow the renumbering, or drop the ` +
          "citation — a pointer that rots while the test keeps passing is worse than no pointer."
      );
    }
  }
});

test("the untraced list is an exception list: short, reasoned, and inside its ceiling", () => {
  const ids = Object.keys(UNTRACED);
  assert.ok(
    ids.length <= UNTRACED_CEILING,
    `${ids.length} flow(s) are excused from tracing, ceiling ${UNTRACED_CEILING}. This list may only shrink.`
  );
  for (const id of ids) {
    assert.ok(
      UNTRACED[id].length > 120,
      `${id}: an excuse needs a reason a reviewer can disagree with, not a phrase. Say why no assertion is ` +
        "possible and what would make one possible."
    );
  }
});

test("the gate goes red when a path the model cites has moved", () => {
  const moved = read(THREAT_MODEL_REL).replace("src/lib/cron-auth.ts", "src/lib/cron-auth-moved-away.ts");
  const path = tempFile("threat-model.md", moved);
  const res = run(["--check", "--doc", path]);
  assert.equal(res.status, 1, "a flow pointing at a module that has moved describes a path nobody can follow.");
  assert.match(output(res), /cron-auth-moved-away\.ts/);
  assert.match(output(res), /does not exist/);
});

test("the gate goes red when nothing in the tree claims a flow", () => {
  // The control that proves the traceability half is measured rather than assumed:
  // point the gate at a suite directory with no suites in it, and every flow but the
  // reasoned exception must be reported as unasserted.
  const emptySuite = mkdtempSync(join(tmpdir(), "threat-flows-empty-"));
  const res = run(["--check", "--suite", emptySuite]);
  assert.equal(res.status, 1, "a tree where no test claims a flow must not pass a traceability check.");
  assert.match(output(res), /no suite asserts/);
});

test("the census excludes itself, so a flow cannot look asserted by this file alone", () => {
  assert.equal(CENSUS_REL, "threat-flows.test.mjs");
  const claims = claimsIn(join(ROOT, "test-unit"));
  assert.ok(
    ![...claims.keys()].some((f) => f.endsWith(CENSUS_REL)),
    "the claim scan is counting this file, which names every id in its own assertions."
  );
  // …and the audit agrees the tree is clean, called directly rather than spawned.
  assert.deepEqual(auditFlows().failures, []);
});

test("the check is wired as an npm script and named where a reader is routed", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.scripts["threat:flows"], "package.json has no `threat:flows` script.");
  assert.ok(pkg.scripts["threat:flows:check"], "package.json has no `threat:flows:check` script.");
  assert.match(
    read(THREAT_MODEL_REL),
    /npm run threat:flows/,
    "the model no longer names the command that checks it, so a reader has no way to ask what asserts a flow."
  );
});
