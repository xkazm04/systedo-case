#!/usr/bin/env node
/** The threat model's flows, traced back to the tests that assert them.
 *
 *  WHAT WAS MISSING. `docs/security/threat-model.md` names where every credential
 *  enters, rests and leaves, and which fence stands on each edge. `SECURITY.md` is
 *  candid that the worst case here is somebody spending an advertiser's budget. The
 *  suite is large, behavioural and mutation-tested — and not one assertion in it
 *  named a flow in that document. So the two could drift apart in the one direction
 *  that costs something: a refactor widens a credential path, every test stays
 *  green, and the page stays confident. Traceability is what makes a threat model a
 *  living artefact rather than a description of the tree on the day it was written.
 *
 *  HOW IT IS TIED. Each row of the two tables carries a `TM-nn` id. A suite claims a
 *  flow by naming that id, which makes the link greppable from both ends: from the
 *  document ("what asserts this?") and from a failing test ("which credential path
 *  did I just break?").
 *
 *  WHAT A CLAIM MEANS, AND WHAT IT DOES NOT. It means the suite exercises the seam
 *  the row says stands on that credential — the cron guard's fail-closed branch, the
 *  token blob's auth tag, the lint fence refusing a driver import. It does not mean
 *  the flow is fully covered; coverage is a judgment and this is a pointer. What is
 *  mechanical is the pointer's integrity, and that is exactly the half that rots.
 *
 *  RUNG (docs/adr/0007-gate-rung-discipline.md): BLOCKING, and green on arrival —
 *  fourteen of the fifteen flows are claimed today and the fifteenth is on the
 *  untraced list below with the reason it cannot be. It runs inside
 *  `npm run test:unit` (test-unit/threat-flows.test.mjs) → `check:ci` →
 *  `.husky/pre-push`, so it costs a directory read and still refuses a push.
 *
 *  It fails when:
 *    · a flow the document declares is claimed by no suite and is not on UNTRACED;
 *    · UNTRACED grows past its ceiling, or excuses a flow that is now claimed;
 *    · a suite names a `TM-nn` the document no longer declares — a citation that
 *      rots while the test keeps passing is worse than no citation at all;
 *    · a repository path the document cites has moved, which is the ordinary way a
 *      flow stops matching the code;
 *    · or the document stops declaring flows in a shape this can read, which would
 *      otherwise turn the whole check green on every tree.
 *
 *  Usage:
 *    npm run threat:flows            # the matrix
 *    npm run threat:flows:check      # exit 1 on an unclaimed flow, a rotted id, a moved path
 *    node scripts/threat-flows.mjs --doc <file> --suite <dir>   # a fixture; the test
 *                                    # points the REAL gate at a broken model and
 *                                    # requires a red
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const THREAT_MODEL_REL = "docs/security/threat-model.md";
export const SUITE_DIR_REL = "test-unit";
/** The census names every id in its own assertions and its own exception list, so
 *  counting it as a claim would make every flow look traced by construction. */
export const CENSUS_REL = "threat-flows.test.mjs";

/** A flow id, anywhere. */
const FLOW_ID_RE = /\bTM-\d{2}\b/g;
/** A table row whose first cell is a flow id. */
const ROW_RE = /^\|\s*(TM-\d{2})\s*\|/;
/** A repository path the document cites in backticks. Only tokens carrying a known
 *  extension are checked: `src/lib/` is a directory, `src/lib/auth*` is a glob and
 *  `u_{userId}_proj_{projectId}` is a key shape — none of them is a file whose
 *  absence means anything. */
const CITED_PATH_RE = /`([\w.][\w./-]*\.(?:ts|tsx|mjs|js|json|md|yml|yaml))`/g;

/** Flows this document declares that NO suite claims, with the reason. An exception
 *  list, so it has a ceiling and it may only shrink: the way off it is an assertion,
 *  not a deletion from here. */
export const UNTRACED = {
  "TM-06":
    "`RESEND_API_KEY` reaches Resend only when mail is SENT, and sending is the one thing this repository " +
    "deliberately does not do unattended — `no-outbound-under-operator` in .github/constraint-map.json is an " +
    "honour rule with no fence, and the operator presses send from the schranka review gate. There is no " +
    "assertion to write that would not be asserting a path nothing here is allowed to take. The way off this " +
    "list is a fence on the outbound seam, at which point the test claims TM-06 too.",
};

/** What the list holds today. Raising it is the same two-line diff as every other
 *  pin here: the entry, and the number that pays for it, next to each other. */
export const UNTRACED_CEILING = 1;

/** The flows a document declares, parsed out of its own tables. */
export function parseFlows(markdown) {
  const flows = [];
  markdown.split(/\r?\n/).forEach((line, i) => {
    const m = ROW_RE.exec(line);
    if (!m) return;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    flows.push({
      id: m[1],
      line: i + 1,
      cells,
      credential: cells[1] ?? "",
      standsOn: cells[6] ?? "",
    });
  });
  return flows;
}

/** Every repository path the document cites, deduplicated. */
export function citedPaths(markdown) {
  return [...new Set([...markdown.matchAll(CITED_PATH_RE)].map((m) => m[1]))];
}

/** suite file → the flow ids it names. The census itself is excluded by name. */
export function claimsIn(suiteDir) {
  const claims = new Map();
  if (!existsSync(suiteDir) || !statSync(suiteDir).isDirectory()) return claims;
  for (const name of readdirSync(suiteDir)) {
    if (!name.endsWith(".test.mjs") || name === CENSUS_REL) continue;
    const ids = new Set(readFileSync(join(suiteDir, name), "utf8").match(FLOW_ID_RE) ?? []);
    if (ids.size) claims.set(`${SUITE_DIR_REL}/${name}`, [...ids].sort());
  }
  return claims;
}

/** The whole check, as data. Separated from the CLI so a test can call it, and so
 *  importing this module never runs anything. */
export function auditFlows({ docPath, suiteDir, root = ROOT } = {}) {
  const failures = [];
  const doc = resolve(root, docPath ?? THREAT_MODEL_REL);
  if (!existsSync(doc)) {
    return {
      failures: [`${docPath ?? THREAT_MODEL_REL} does not exist — there is no threat model to trace.`],
      flows: [],
      byFlow: new Map(),
      unclaimed: [],
    };
  }
  const markdown = readFileSync(doc, "utf8");
  const flows = parseFlows(markdown);

  if (flows.length < 10) {
    failures.push(
      `${docPath ?? THREAT_MODEL_REL} declares ${flows.length} flow(s) in a shape this gate can read, and the ` +
        "model names more credentials than that. Either a table lost its `TM-nn` column, or the ids were " +
        "removed — and a traceability check with nothing to trace is green on every tree."
    );
  }

  const seen = new Set();
  for (const flow of flows) {
    if (seen.has(flow.id)) failures.push(`${flow.id} is declared twice (line ${flow.line}); an id names one flow.`);
    seen.add(flow.id);
    if (flow.cells.length < 7) {
      failures.push(`${flow.id}: the row has ${flow.cells.length} cells, not the seven the table declares.`);
    }
    if (!flow.credential) failures.push(`${flow.id}: names no credential.`);
    if (!flow.standsOn) {
      failures.push(
        `${flow.id}: the "What stands on it" cell is empty. A flow with no fence named is the row a reader ` +
          "most needs an honest answer in — write **honour** and the reason, the way TM-06 does."
      );
    }
  }

  const claims = claimsIn(resolve(root, suiteDir ?? SUITE_DIR_REL));
  /** flow id → the suites claiming it. */
  const byFlow = new Map(flows.map((f) => [f.id, []]));
  for (const [file, ids] of claims) {
    for (const id of ids) {
      if (!byFlow.has(id)) {
        failures.push(
          `${file} names ${id}, which ${docPath ?? THREAT_MODEL_REL} does not declare. Either the flow was ` +
            "renumbered and the citation should follow it, or a test is telling a reader about a credential " +
            "path that no longer exists — a citation that rots while the test keeps passing is worse than none."
        );
        continue;
      }
      byFlow.get(id).push(file);
    }
  }

  const unclaimed = [...byFlow.entries()].filter(([, files]) => files.length === 0).map(([id]) => id);
  const excused = [];
  for (const id of unclaimed) {
    if (UNTRACED[id]) {
      excused.push(id);
      continue;
    }
    failures.push(
      `${id} is a credential flow this model declares and no suite asserts. Name it in the test that already ` +
        "exercises the seam its \"What stands on it\" cell points at, or record it in UNTRACED in " +
        "scripts/threat-flows.mjs with the reason no assertion is possible — and move the ceiling in the same diff."
    );
  }
  if (excused.length > UNTRACED_CEILING) {
    failures.push(
      `${excused.length} flow(s) are untraced, ceiling ${UNTRACED_CEILING}. This list may only shrink: write the ` +
        "assertion rather than widening what is allowed through."
    );
  }
  for (const id of Object.keys(UNTRACED)) {
    if (!byFlow.has(id)) {
      failures.push(`UNTRACED excuses ${id}, which the model no longer declares. An excuse for a flow nobody has is how the file stops being read.`);
    } else if (byFlow.get(id).length) {
      failures.push(
        `UNTRACED excuses ${id}, and ${byFlow.get(id).join(", ")} now claims it. Delete the excuse in the diff ` +
          "that earned it — an exception list nobody prunes stops meaning anything."
      );
    }
  }

  // Every path the page cites, checked against the tree. This is the ordinary way a
  // flow stops matching the code: the module moves and the row keeps naming it.
  for (const rel of citedPaths(markdown)) {
    if (!existsSync(join(root, rel))) {
      failures.push(
        `the model cites \`${rel}\`, which does not exist. A row pointing at a module that has moved describes ` +
          "a credential path nobody can follow — re-point it at where the code went."
      );
    }
  }

  return { failures, flows, byFlow, unclaimed: unclaimed.filter((id) => !UNTRACED[id]), excused };
}

// --- CLI ----------------------------------------------------------------------

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  const audit = auditFlows({ docPath: flag("--doc"), suiteDir: flag("--suite") });

  console.log("## Credential flows, and what asserts them\n");
  console.log("| Flow | Credential | Asserted by |");
  console.log("| --- | --- | --- |");
  for (const flow of audit.flows) {
    const files = audit.byFlow.get(flow.id) ?? [];
    const claimed = files.length ? files.map((f) => `\`${f}\``).join(", ") : UNTRACED[flow.id] ? "— (untraced, with a reason)" : "**— nothing**";
    console.log(`| ${flow.id} | ${flow.credential} | ${claimed} |`);
  }
  console.log("");
  console.log(
    `${audit.flows.length} flow(s), ${audit.flows.length - (audit.excused?.length ?? 0) - audit.unclaimed.length} ` +
      `claimed by a suite, ${audit.excused?.length ?? 0} untraced with a reason (ceiling ${UNTRACED_CEILING}).`
  );

  if (audit.failures.length) {
    console.error(`\n✗ threat-model traceability: ${audit.failures.length} finding(s)\n`);
    for (const f of audit.failures) console.error(`  • ${f}`);
    console.error(
      "\n  → what to do next (`threat:flows:check`):\n" +
        "      npm run threat:flows        # the matrix above\n" +
        `      ${THREAT_MODEL_REL} is the source of the flow list; a suite claims a flow by naming its id.\n` +
        "      Never renumber a flow to go green: the id is what a citation in the suite points at.\n" +
        "    rung discipline: docs/adr/0007-gate-rung-discipline.md\n"
    );
    process.exit(1);
  }
  console.log(
    `\n✓ every credential flow in ${THREAT_MODEL_REL} is either asserted by a suite that names it or recorded ` +
      "as untraced with a reason, every cited path exists, and no suite cites a flow the model has dropped."
  );
  process.exit(0);
}
