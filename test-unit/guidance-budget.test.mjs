/** What an agent must read before its first edit, bounded.
 *
 *  `npm run agents:surface` protects what the guidance SAYS — a generated region
 *  cannot smuggle in an instruction, a vendor reword is accepted on its own. It
 *  says nothing about how much of it there is, and every document in the read-first
 *  set was added for a reason somebody agreed with. That is how a surface with no
 *  limit grows: one justified paragraph at a time, and the cost is paid by a reader
 *  who cannot say which part they dropped.
 *
 *  `.github/guidance-budget.json` is the declaration and `scripts/guidance-budget.mjs`
 *  measures it. This file is the blocking half: it runs inside `npm run test:unit`
 *  → `check:ci` → `.husky/pre-push`, so growing the surface past its ceiling is red
 *  on the machine that did it rather than a note in a review.
 *
 *  The property worth the most here is not the ceilings — it is the BOUNDARY. A
 *  lookup that quietly becomes read-first moves the total without any ceiling being
 *  touched, so the set is asserted against the documents the guidance actually
 *  tells a reader to open first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const GATE = join(ROOT, "scripts", "guidance-budget.mjs");

const budget = JSON.parse(read(".github/guidance-budget.json"));
const agents = read("AGENTS.md");

const runGate = (args = []) =>
  spawnSync(process.execPath, [GATE, ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });

test("the read-first surface is inside its budget", () => {
  const res = runGate(["--check"]);
  assert.equal(
    res.status,
    0,
    `\`npm run guidance:budget:check\` is red:\n\n${res.stdout}\n${res.stderr}\n\n` +
      "The set of documents every run reads before its first edit has grown past what was agreed."
  );
  assert.match(res.stdout, /\*\*Total: \d+ lines\*\*/);
});

test("every read-first entry is a document the guidance actually points at first", () => {
  // The boundary, from the other side: the budget may not invent a read-first set,
  // and it may not quietly drop a document AGENTS.md sends every reader to.
  assert.ok(budget.readFirst?.length >= 4, "a read-first set this small is not describing this repository.");
  for (const entry of budget.readFirst) {
    assert.ok(
      agents.includes(entry.file),
      `${entry.file} is declared read-first and AGENTS.md never names it. The budget describes the surface the ` +
        "guidance builds — it does not get to define one."
    );
    assert.ok(typeof entry.maxLines === "number" && entry.maxLines > 0, `${entry.file}: no usable \`maxLines\`.`);
    assert.ok(String(entry.why ?? "").trim().length > 20, `${entry.file}: \`why\` must say what breaks if it is read late.`);
  }
});

test("the lookups are declared, and are not also read-first", () => {
  assert.ok(budget.lookups?.length >= 3, "if nothing is a lookup, the routing table is not doing its job.");
  const readFirst = new Set(budget.readFirst.map((e) => e.file));
  for (const entry of budget.lookups) {
    assert.ok(!readFirst.has(entry.file), `${entry.file} is declared both read-first and a lookup.`);
  }
  assert.ok(
    agents.includes(budget.routedBy),
    `the budget says lookups are reached through ${budget.routedBy}, which AGENTS.md does not name.`
  );
});

// --- the ceiling, seen refusing ----------------------------------------------

function fixture(mutate) {
  const copy = JSON.parse(JSON.stringify(budget));
  mutate(copy);
  const path = join(mkdtempSync(join(tmpdir(), "guidance-budget-")), "guidance-budget.json");
  writeFileSync(path, JSON.stringify(copy, null, 2));
  return path;
}

test("a document over its own ceiling is refused", () => {
  const path = fixture((b) => {
    b.readFirst[0].maxLines = 1;
  });
  const res = runGate(["--check", "--budget", path]);
  assert.equal(res.status, 1, "a read-first document past its ceiling must fail.");
  assert.match(res.stdout, /over its ceiling of 1/);
});

test("a set that is under every ceiling and over the total is still refused", () => {
  // The failure a per-document limit cannot see: nothing grew, and the surface did,
  // because another document joined the set.
  const path = fixture((b) => {
    b.maxTotalLines = 10;
  });
  const res = runGate(["--check", "--budget", path]);
  assert.equal(res.status, 1, "the total is the number that stops the set growing by addition.");
  assert.match(res.stdout, /over the total ceiling of 10/);
});

test("a read-first document that has moved is refused rather than skipped", () => {
  const path = fixture((b) => {
    b.readFirst.push({ file: "docs/a-document-that-never-existed.md", maxLines: 10, why: "a fixture entry, long enough to pass" });
  });
  const res = runGate(["--check", "--budget", path]);
  assert.equal(res.status, 1, "a budget naming a document that has moved measures nothing.");
  assert.match(res.stdout, /does not exist/);
});
