/** The commands the guidance quotes still exist — asserted, not assumed.
 *
 *  `npm run agents:surface` protects what the generated regions of the guidance SAY;
 *  `test-unit/guidance-budget.test.mjs` protects how much of it there is. Neither
 *  reads the ~100 `npm run …` commands the hand-written half quotes, every one of
 *  which lives in `package.json` and can be renamed there without a single check
 *  going red. The sentence naming the old command keeps reading exactly as it did,
 *  in the canonical document, and the next run burns itself on it.
 *
 *  BLOCKING (docs/adr/0007-gate-rung-discipline.md): it passes on the tree as it
 *  stands, so a red one is the diff that renamed the script. It runs inside
 *  `npm run test:unit` → `check:ci` → `.husky/pre-push` rather than as its own stage
 *  of the chain, so it costs a handful of file reads and still refuses a push.
 *
 *  The last two tests are the ones that make the first believable: the real gate is
 *  pointed at a fixture document that quotes a command nobody defines and must go
 *  RED, and at one that quotes a real command and must stay GREEN. A check that
 *  passes either way is decoration.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ENTRY_POINTS, commandsIn, guidanceDocuments } from "../scripts/guidance-commands.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const GATE = join(ROOT, "scripts", "guidance-commands.mjs");

const run = (args) =>
  spawnSync(process.execPath, [GATE, ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const output = (res) => `${res.stdout ?? ""}${res.stderr ?? ""}`;

/** A fixture document, written outside the repository so a crashed run cannot leave
 *  a stray file in a tree somebody is about to commit. */
function fixture(text) {
  const path = join(mkdtempSync(join(tmpdir(), "guidance-commands-")), "GUIDE.md");
  writeFileSync(path, text);
  return path;
}

test("every `npm run` command the guidance quotes resolves to a script package.json defines", () => {
  const res = run(["--check"]);
  assert.equal(
    res.status,
    0,
    `\`npm run guidance:commands:check\` is red:\n\n${output(res).slice(-4000)}\n\n` +
      "A document an agent is told to read names a command that no longer exists."
  );
  assert.match(output(res), /resolves to a script package\.json defines/);
});

test("the covered set is derived from the budget's own lists, so it cannot fall behind", () => {
  const budget = JSON.parse(read(".github/guidance-budget.json"));
  const covered = guidanceDocuments(ROOT);
  for (const entry of [...(budget.readFirst ?? []), ...(budget.lookups ?? [])]) {
    assert.ok(
      covered.includes(entry.file),
      `${entry.file} is declared in .github/guidance-budget.json and is not in the set this gate reads. The ` +
        "covered set is derived on purpose — a document promoted from lookup to read-first must be covered the " +
        "moment it is declared."
    );
  }
  for (const rel of ENTRY_POINTS) {
    assert.ok(
      existsSync(join(ROOT, rel)),
      `scripts/guidance-commands.mjs names ${rel} as an entry point and it does not exist. A covered set naming ` +
        "a document that has moved reads exactly like one that is being checked."
    );
  }
});

test("the extractor still finds the commands that are there", () => {
  // The failure this guards is the quiet one: a regex that stops matching turns the
  // whole gate green on every tree, for as long as nobody looks.
  const found = commandsIn("Run `npm run check:ci` first, then `npm run test:unit -- --watch`.\nAnd npm run gates.");
  assert.deepEqual(
    found.map((f) => f.command),
    ["check:ci", "test:unit", "gates"]
  );
  // A permission pattern's trailing colon is not part of the script name.
  assert.deepEqual(
    commandsIn('"Bash(npm run test:unit:*)"').map((f) => f.command),
    ["test:unit"]
  );
  assert.ok(commandsIn("nothing here").length === 0);
});

test("the gate goes red on a document quoting a command nobody defines", () => {
  const path = fixture("# A guide\n\nRun `npm run definitely-not-a-real-script` before you start.\n");
  const res = run(["--check", "--docs", path]);
  assert.equal(res.status, 1, "a command that does not resolve must fail, or this gate is measuring nothing.");
  assert.match(output(res), /definitely-not-a-real-script/);
  assert.match(output(res), /package\.json defines no such script/);
});

test("…and stays green on a document quoting a real one", () => {
  // The control. A gate that reports everything is a gate somebody switches off.
  const path = fixture("# A guide\n\nRun `npm run test:unit` before you push.\n");
  const res = run(["--check", "--docs", path]);
  assert.equal(res.status, 0, `a real command must pass:\n${output(res)}`);
});

test("the gate is wired as an npm script and named where a reader will find it", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.scripts["guidance:commands"], "package.json has no `guidance:commands` script.");
  assert.ok(pkg.scripts["guidance:commands:check"], "package.json has no `guidance:commands:check` script.");
  assert.match(
    read("docs/task-index.md"),
    /guidance-commands\.mjs/,
    "docs/task-index.md no longer routes to this check. A gate nobody is routed to is one nobody runs before " +
      "renaming a script."
  );
});
