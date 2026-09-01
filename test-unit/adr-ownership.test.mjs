/** The reverse lookup, held to the tree: from a file to the decision that governs it.
 *
 *  `docs/task-index.md` routes from a TASK to its record, and
 *  `test-unit/docs-task-index.test.mjs` keeps that direction honest. The direction
 *  this file protects is the one a reader actually has: a path. An agent that opens
 *  `src/lib/db.ts` cold knows the file and nothing else, and until
 *  `.github/adr-ownership.json` landed there was no way for the tree to tell it that
 *  ADR-0001 decides how that file may change.
 *
 *  Two properties, and both are the kind a written mapping needs or it rots:
 *
 *    • every record in docs/adr/ has a row — so a new ADR cannot land reachable only
 *      from the forward index;
 *    • every path a row claims still exists — so a renamed seam goes red here, which
 *      is exactly the moment nobody thinks to open a decision record.
 *
 *  Blocking, green on arrival (docs/adr/0007-gate-rung-discipline.md), pure: it reads
 *  files and runs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditOwnership, loadOwnership, normalise, recordsFor } from "../scripts/adr-owner.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const OWNERSHIP_REL = ".github/adr-ownership.json";

test("the reverse index is complete and every path it claims still exists", () => {
  const { problems } = auditOwnership(ROOT);
  assert.deepEqual(
    problems,
    [],
    `${OWNERSHIP_REL} no longer describes the tree:\n\n  ${problems.join("\n  ")}\n\n` +
      "Run `npm run adr:owner -- --check` for the same report."
  );
});

test("a file under a fenced seam names the decision that governs it", () => {
  // The worked example: the question is asked with a PATH, which is all a reader
  // three files into a change actually has.
  const ownership = loadOwnership(ROOT);
  const hits = recordsFor("src/lib/db.ts", ownership);
  assert.ok(
    hits.some((h) => h.record.adr.includes("0001-dual-store-seam")),
    "`src/lib/db.ts` no longer resolves to ADR-0001. The store seam is the decision most often reached for by " +
      "accident here, and this lookup is the only thing that surfaces it to a reader who did not go looking."
  );
  assert.ok(recordsFor("src/lib/llm/index.ts", ownership).some((h) => h.record.adr.includes("0003-single-llm")));
});

test("a path nobody governs answers plainly rather than guessing", () => {
  // Most code is not governed by a record, and an index that invents an answer for
  // those is worse than one that says so: the reader stops trusting the hits too.
  const ownership = loadOwnership(ROOT);
  assert.deepEqual(recordsFor("README.md", ownership), []);
});

test("prefix matching does not spill onto a neighbouring path", () => {
  const ownership = loadOwnership(ROOT);
  const spill = recordsFor("src/lib/projects-that-do-not-exist.ts", ownership);
  assert.deepEqual(
    spill,
    [],
    "an entry is matching on a string prefix rather than on path segments, so it claims files it has nothing " +
      "to do with — which is how a reverse index stops being believed."
  );
});

test("the audit goes red on a row whose seam has moved", () => {
  // A check nobody has watched fail is a check nobody knows is wired.
  const dir = mkdtempSync(join(tmpdir(), "adr-ownership-"));
  mkdirSync(join(dir, ".github"), { recursive: true });
  mkdirSync(join(dir, "docs", "adr"), { recursive: true });
  writeFileSync(join(dir, "docs", "adr", "0001-a-seam.md"), "# ADR-0001 — A seam\n");
  writeFileSync(join(dir, "docs", "adr", "0002-another.md"), "# ADR-0002 — Another\n");
  writeFileSync(
    join(dir, ".github", "adr-ownership.json"),
    JSON.stringify(
      {
        schema: 1,
        records: [
          {
            adr: "docs/adr/0001-a-seam.md",
            seam: "a seam",
            why: "because",
            governs: ["src/lib/renamed-away.ts"],
          },
        ],
      },
      null,
      2
    )
  );

  const { problems } = auditOwnership(dir);
  assert.ok(
    problems.some((p) => p.includes("renamed-away")),
    `a row governing a path that does not exist must be a finding. Got:\n  ${problems.join("\n  ")}`
  );
  assert.ok(
    problems.some((p) => p.includes("0002-another.md")),
    "a record with no row must be a finding — otherwise a new ADR lands reachable only from the forward index."
  );
});

test("the forward and reverse indexes point at each other", () => {
  const taskIndex = read("docs/task-index.md");
  assert.ok(
    taskIndex.includes("adr-ownership.json"),
    "docs/task-index.md no longer routes to the reverse index. A reader who knows the task finds the record " +
      "there; a reader who only knows the file has to be told where to ask."
  );
  const ownership = loadOwnership(ROOT);
  assert.equal(normalise(ownership.index), "docs/task-index.md");
});

test("the lookup is wired to a command", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["adr:owner"], "node scripts/adr-owner.mjs");
  assert.equal(pkg.scripts["adr:owner:check"], "node scripts/adr-owner.mjs --check");
});
