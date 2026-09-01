/** Every blocking gate, shown catching the thing it claims to catch.
 *
 *  THE PROBLEM. `npm run check:ci` chains fifteen stages and thirteen of them are
 *  first-party scripts in this repository. Every one of them is green today, and a
 *  green run is exactly what a gate looks like when it has stopped working: a
 *  regex that no longer matches, a loop that walks an empty list after a rename, a
 *  `--check` flag silently ignored. Nothing about the tree being clean can tell
 *  those apart from the tree being clean. Most of the existing wiring tests assert
 *  that a gate's SOURCE still contains its rule — which catches a deletion and
 *  misses a neutering.
 *
 *  So each gate gets a KNOWN-BAD FIXTURE: the smallest tree that breaks the rule
 *  it exists to enforce, and the real script — the same file `check:ci` runs — has
 *  to go red on it and say which rule fired. `test-unit/contract-ledger-ceiling.test.mjs`
 *  did this for one gate; this file does it for the rest.
 *
 *  HOW A FIXTURE IS BUILT. Nothing here writes to the working tree. Two shapes:
 *
 *    sandbox()    one copy of the directories the gates read (scripts/, src/,
 *                 docs/, test-llm/, .github/, .agent/, README.md) into a temp dir,
 *                 made once and reused. A fixture edits a file inside it, runs the
 *                 gate with that directory as the root, and restores the file. The
 *                 gates resolve their own ROOT from `import.meta.url`, so a copied
 *                 script reads the copied tree and nothing else.
 *    gitRepo()    a throwaway repository for the two gates that read a DIFF rather
 *                 than a tree (`context:decay:check`, `review:agent:gate`). Small
 *                 and purpose-built: a base commit, then a commit that breaks the
 *                 rule. `git add .` is safe here and only here — the repository is
 *                 three files in a temp directory, not the shared checkout.
 *
 *  AND THE LIST IS CLOSED. COVERAGE below has one row per stage of `check:ci`,
 *  read back from scripts/gate-remedy.mjs. A stage with neither a fixture nor a
 *  written exemption fails this suite, so the next gate added to the chain arrives
 *  with the proof that it bites, or with the reason it cannot have one.
 *
 *  Threat-model flow TM-01 (docs/security/threat-model.md § Credentials, by flow):
 *  `AUTH_SECRET` signs the session cookies and is the fallback key of both token-crypto
 *  seams, and what stands on it is `sast` `client-env` — a `"use client"` module may
 *  not read a server env var. The sast fixture below is where that rule is shown
 *  firing on exactly that shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAIN } from "../scripts/gate-remedy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

/** What the sandboxed gates read. Deliberately explicit: a gate that starts
 *  needing something else fails its own control run here, loudly, rather than
 *  going quiet. */
const SANDBOX_PATHS = ["scripts", "src", "docs", "test-llm", ".github", ".agent", "README.md"];

const temps = [];
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
process.on("exit", () => {
  for (const dir of temps) {
    try {
      // Drop the node_modules LINK first, with rmdir — which removes a Windows
      // junction and can never follow it. On POSIX it is a symlink and `rm -r`
      // unlinks it without descending, so a failure here is not a reason to skip
      // the delete below.
      try {
        rmdirSync(join(dir, "node_modules"));
      } catch {
        /* not a junction, or already gone */
      }
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* a temp directory that outlives the run is not worth failing over */
    }
  }
});

let SANDBOX = null;
/** One copy of the tree the file-reading gates need, made on first use. */
function sandbox() {
  if (SANDBOX) return SANDBOX;
  const dir = tempDir("gate-bite-");
  for (const entry of SANDBOX_PATHS) {
    const from = join(ROOT, entry);
    if (!existsSync(from)) continue;
    cpSync(from, join(dir, entry), { recursive: true });
  }
  // test-llm/registry.mjs imports `@google/genai` for its schema types, so the
  // two gates that read the registry need bare specifiers to resolve. A link is
  // the cheap way to give a temp directory this checkout's modules — `junction`
  // is what makes it work on Windows without elevation, and is ignored elsewhere.
  const modules = join(ROOT, "node_modules");
  if (existsSync(modules)) {
    try {
      symlinkSync(modules, join(dir, "node_modules"), "junction");
    } catch {
      /* the control test below says so, in the gate's own words */
    }
  }
  SANDBOX = dir;
  return dir;
}

/** Run a gate script with `dir` as its repository root. */
function runGate(dir, script, args = []) {
  return spawnSync(process.execPath, [join(dir, "scripts", script), ...args], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

const output = (res) => `${res.stdout ?? ""}${res.stderr ?? ""}`;

/** Apply edits, run `fn`, then put the files back exactly as they were. */
function withEdits(dir, edits, fn) {
  const saved = edits.map(({ file }) => {
    const path = join(dir, file);
    const existed = existsSync(path);
    return { path, existed, text: existed ? readFileSync(path, "utf8") : null };
  });
  try {
    for (const { file, write } of edits) {
      const path = join(dir, file);
      mkdirSync(dirname(path), { recursive: true });
      const before = existsSync(path) ? readFileSync(path, "utf8") : "";
      const after = typeof write === "function" ? write(before) : write;
      assert.notEqual(after, before, `the fixture edit to ${file} changed nothing — it would prove nothing.`);
      writeFileSync(path, after);
    }
    return fn();
  } finally {
    for (const s of saved) {
      if (s.existed) writeFileSync(s.path, s.text);
      else rmSync(s.path, { force: true });
    }
  }
}

// --- git fixtures ------------------------------------------------------------

function git(dir, args) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

/** A throwaway repository with this repo's scripts/ in it, so the real gate runs
 *  against a diff we authored. */
function gitRepo(prefix) {
  const dir = tempDir(prefix);
  cpSync(join(ROOT, "scripts"), join(dir, "scripts"), { recursive: true });
  const init = git(dir, ["init", "--quiet"]);
  assert.equal(init.status, 0, `could not create the fixture repository: ${init.stderr ?? init.error?.message}`);
  git(dir, ["config", "user.email", "gate-bite@example.invalid"]);
  git(dir, ["config", "user.name", "Gate bite fixture"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  return dir;
}

/** Write files, stage the whole fixture repo, commit under `subject`, return the SHA. */
function commit(dir, files, subject) {
  for (const [rel, text] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  // A temp directory holding three authored files: `add .` here is not the
  // pathspec rule AGENTS.md draws around the shared checkout.
  git(dir, ["add", "."]);
  const res = git(dir, ["commit", "--no-verify", "--quiet", "-m", subject]);
  assert.equal(res.status, 0, `fixture commit failed: ${res.stderr ?? res.error?.message}`);
  return git(dir, ["rev-parse", "HEAD"]).stdout.trim();
}

// --- the gates run, and they are green on this tree ---------------------------

const SANDBOXED = [
  { stage: "docs:parity", script: "docs-parity.mjs", args: [] },
  { stage: "checkpoint:check", script: "agent-checkpoint.mjs", args: ["--check"] },
  { stage: "actions:check", script: "actions-pin.mjs", args: [] },
  { stage: "sast", script: "sast.mjs", args: [] },
  { stage: "merge-gate", script: "merge-gate.mjs", args: [] },
  { stage: "llm:gate:check", script: "llm-gate.mjs", args: ["--check"] },
  { stage: "llm:quality:check", script: "quality-gate.mjs", args: ["--check"] },
  { stage: "llm:budget:check", script: "llm-budget.mjs", args: ["--check"] },
  { stage: "seed:check", script: "generate-data.mjs", args: ["--check"] },
];

test("every sandboxed gate is green on an unmodified copy of this tree", () => {
  const dir = sandbox();
  for (const { stage, script, args } of SANDBOXED) {
    const res = runGate(dir, script, args);
    assert.equal(
      res.status,
      0,
      `\`${stage}\` is red on a clean copy of this tree:\n\n${output(res).slice(-4000)}\n\n` +
        "Either the gate found a real regression (fix it — check:ci is red too), or it needs a file this " +
        "fixture does not copy (add it to SANDBOX_PATHS)."
    );
  }
});

// --- docs:parity --------------------------------------------------------------

test("docs:parity fails when the two editions state different licences", () => {
  const dir = sandbox();
  const res = withEdits(
    dir,
    [{ file: "docs/README.cs.md", write: (t) => t.replace("AGPL-3.0-only", "AGPL-2.0-only") }],
    () => runGate(dir, "docs-parity.mjs")
  );
  assert.equal(res.status, 1, "a bilingual pair disagreeing on the licence has to fail, or the pairing is prose.");
  assert.match(output(res), /license/);
  assert.match(output(res), /DIFFERENT values/);
});

// --- checkpoint:check ---------------------------------------------------------

test("checkpoint:check fails on a handoff that no longer parses", () => {
  const dir = sandbox();
  const res = withEdits(
    dir,
    [{ file: ".agent/checkpoints/gate-bite-fixture.json", write: '{ "session": "gate-bite", ' }],
    () => runGate(dir, "agent-checkpoint.mjs", ["--check"])
  );
  assert.equal(res.status, 1, "an unreadable checkpoint hands the next run nothing — silently, unless this fires.");
  assert.match(output(res), /not valid JSON/);
});

// --- actions:check ------------------------------------------------------------

test("actions:check refuses a privileged trigger, an unscoped token and a spliced expression", () => {
  const dir = sandbox();
  const workflow = [
    "name: Gate bite fixture",
    "on:",
    "  pull_request_target:",
    "jobs:",
    "  fixture:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    '      - run: echo "${{ github.event.pull_request.title }}"',
    "",
  ].join("\n");
  const res = withEdits(dir, [{ file: ".github/workflows/zz-gate-bite-fixture.yml", write: workflow }], () =>
    runGate(dir, "actions-pin.mjs")
  );
  assert.equal(res.status, 1, "this is the whole shape of a stolen-secrets workflow — it must not pass.");
  const text = output(res);
  assert.match(text, /pull_request_target/, "P2 (privileged trigger) no longer fires.");
  assert.match(text, /permissions/, "P1 (no top-level token scope) no longer fires.");
  assert.match(text, /github\.event\.\*/, "P9 (an attacker-shaped context in a workflow) no longer fires.");
});

// --- sast ---------------------------------------------------------------------

test("sast fails on dynamic code execution and a server env var in a client module", () => {
  const dir = sandbox();
  // One file, two rules, both of them things an agent writes without meaning
  // anything by it: a string turned into code, and a server secret read from a
  // module that ships to the browser.
  const fixtureSource = [
    '"use client";',
    "",
    "// A gate-bite fixture. Nothing imports it; it exists to be scanned.",
    "export function gateBiteFixture(input: string) {",
    "  return eval(process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? input);",
    "}",
    "",
  ].join("\n");
  const res = withEdits(dir, [{ file: "src/lib/gate-bite-sast-fixture.ts", write: fixtureSource }], () =>
    runGate(dir, "sast.mjs")
  );
  assert.equal(
    res.status,
    1,
    "a security finding has to be able to fail the build — this gate spent months on `continue-on-error`, " +
      "which is the state this fixture exists to make loud."
  );
  const text = output(res);
  assert.match(text, /eval-sink/, "the dynamic-execution rule no longer fires.");
  assert.match(text, /client-env/, "the client/server env boundary rule no longer fires.");
  assert.match(text, /sast-allowlist\.json/, "the finding no longer says where a reviewed exception is written down.");
});

// --- merge-gate ---------------------------------------------------------------

test("merge-gate fails when a required check is softened so it cannot fail", () => {
  const dir = sandbox();
  const spec = JSON.parse(read(".github/required-checks.json"));
  const first = spec.required[0];
  const res = withEdits(
    dir,
    [
      {
        file: `.github/workflows/${first.workflow}`,
        write: (text) => {
          const lines = text.split(/\r?\n/);
          const jobsAt = lines.findIndex((l) => /^jobs\s*:/.test(l));
          assert.ok(jobsAt !== -1, `${first.workflow} has no \`jobs:\` block.`);
          const at = lines.findIndex((l, i) => i > jobsAt && new RegExp(`^ {2}${first.job}\\s*:`).test(l));
          assert.ok(at !== -1, `${first.workflow} has no job \`${first.job}\` to soften.`);
          lines.splice(at + 1, 0, "    continue-on-error: true");
          return lines.join("\n");
        },
      },
    ],
    () => runGate(dir, "merge-gate.mjs")
  );
  assert.equal(res.status, 1, "a required check that cannot fail is a comment — the gate has to say so.");
  assert.match(output(res), /JOB level/);
});

// --- llm:gate:check -----------------------------------------------------------

test("llm:gate:check refuses an untagged chokepoint call site", () => {
  const dir = sandbox();
  const fixtureSource = [
    "// A gate-bite fixture: a wrapper call with no `// llm-tool:` tag and no registry",
    "// entry, i.e. an AI operation with no test behind it.",
    'import { generateStructured } from "@/lib/llm";',
    "",
    "export async function gateBiteFixture() {",
    "  return generateStructured({} as never);",
    "}",
    "",
  ].join("\n");
  const res = withEdits(dir, [{ file: "src/lib/gate-bite-fixture.ts", write: fixtureSource }], () =>
    runGate(dir, "llm-gate.mjs", ["--check"])
  );
  assert.equal(res.status, 1, "an untagged call site is an AI operation nothing proves — it must not pass.");
  assert.match(output(res), /UNTAGGED|coverage check failed/);
});

// --- llm:quality:check --------------------------------------------------------

test("llm:quality:check fails when a served operation drops below its recorded baseline", () => {
  const dir = sandbox();
  const res = withEdits(
    dir,
    [
      {
        file: "test-llm/quality/baseline.json",
        write: (text) => {
          const baseline = JSON.parse(text);
          const ops = baseline.operations ?? {};
          const op = Object.keys(ops).find((k) => Object.values(ops[k]).some((v) => typeof v === "number"));
          assert.ok(op, "the quality baseline records no numeric cell to regress.");
          const model = Object.keys(ops[op]).find((m) => typeof ops[op][m] === "number");
          // Raising the RECORDED score by 5 is the same arithmetic as the bake
          // losing 5 points: the cell is now far below what was accepted.
          ops[op][model] += 5;
          return `${JSON.stringify(baseline, null, 2)}\n`;
        },
      },
    ],
    () => runGate(dir, "quality-gate.mjs", ["--check"])
  );
  assert.equal(res.status, 1, "output getting worse on a surface users read has to fail the build.");
  assert.match(output(res), /from the baseline of/);
});

// --- llm:budget:check ---------------------------------------------------------

test("llm:budget:check fails when an operation costs more than its recorded ceiling", () => {
  const dir = sandbox();
  const res = withEdits(
    dir,
    [
      {
        file: "test-llm/budget.json",
        write: (text) => {
          const budget = JSON.parse(text);
          const id = Object.keys(budget.tools ?? {})[0];
          assert.ok(id, "test-llm/budget.json records no tool ceiling to breach.");
          // A ceiling of 1 character is the same finding as a prompt that doubled.
          budget.tools[id].maxInputChars = 1;
          return `${JSON.stringify(budget, null, 2)}\n`;
        },
      },
    ],
    () => runGate(dir, "llm-budget.mjs", ["--check"])
  );
  assert.equal(res.status, 1, "a prompt over its recorded ceiling is the whole point of the budget file.");
  assert.match(output(res), /over its ceiling/);
});

// --- seed:check ---------------------------------------------------------------

test("seed:check fails on a hand-edited demo dataset", () => {
  const dir = sandbox();
  const res = withEdits(
    dir,
    [
      {
        file: "src/data/performance.json",
        write: (text) => {
          const edited = text.replace(/("visits":\s*)(\d+)/, (_m, key, n) => `${key}${Number(n) + 1}`);
          return edited === text ? text.replace(/^\{/, '{\n  "gateBiteFixture": true,') : edited;
        },
      },
    ],
    () => runGate(dir, "generate-data.mjs", ["--check"])
  );
  assert.equal(res.status, 1, "a hand-edited dataset diverging from its generator is what this guard is for.");
  assert.match(output(res), /out of sync with generate-data/);
});

// --- context:decay:check ------------------------------------------------------

const DECAY_MAP = JSON.stringify(
  {
    groups: [
      { name: "Alpha", domain: "feature" },
      { name: "Beta", domain: "feature" },
    ],
    contexts: [
      { name: "alpha-ctx", group: "Alpha", file_paths: ["src/alpha/a.ts"], cross_refs: [] },
      { name: "beta-ctx", group: "Beta", file_paths: ["src/beta/b.ts"], cross_refs: [] },
    ],
  },
  null,
  2
);

test("context:decay:check fails on an undeclared cross-group import this change introduced", () => {
  const dir = gitRepo("gate-bite-decay-");
  const base = commit(
    dir,
    {
      "context-map.json": `${DECAY_MAP}\n`,
      "src/alpha/a.ts": "export const a = 1;\n",
      "src/beta/b.ts": "export const b = 2;\n",
    },
    "chore(fixture): two feature groups that do not touch"
  );

  // Control: a change inside the group is not a crossing.
  const inGroup = commit(
    dir,
    { "src/alpha/a.ts": "export const a = 1;\nexport const a2 = a + 1;\n" },
    "chore(fixture): extend alpha without leaving it"
  );
  const clean = runGate(dir, "context-decay.mjs", ["--check", "--base", base]);
  assert.equal(clean.status, 0, `an in-group change must stay green:\n${output(clean)}`);

  // The breach: Alpha now reaches into Beta, and nothing declares it.
  commit(
    dir,
    { "src/alpha/a.ts": 'import { b } from "@/beta/b";\nexport const a = b;\n' },
    "chore(fixture): reach into another feature group"
  );
  const res = runGate(dir, "context-decay.mjs", ["--check", "--base", inGroup]);
  assert.equal(res.status, 1, "a boundary the map declares has to be a constraint on the diff, not a description.");
  assert.match(output(res), /undeclared boundary crossing/);

  // …and declaring it in cross_refs is the documented way out, so it must work.
  const declared = JSON.parse(DECAY_MAP);
  declared.contexts[0].cross_refs = ["beta-ctx"];
  writeFileSync(join(dir, "context-map.json"), `${JSON.stringify(declared, null, 2)}\n`);
  commit(dir, {}, "chore(fixture): declare the crossing in cross_refs");
  const allowed = runGate(dir, "context-decay.mjs", ["--check", "--base", inGroup]);
  assert.equal(
    allowed.status,
    0,
    `a crossing declared in cross_refs must pass, or the escape hatch the message advertises does not exist:\n${output(allowed)}`
  );
});

// --- review:agent:gate (rubric Part A) ----------------------------------------

test("review:agent:gate fails on an oversized component, a route opt-out and a narrating subject", () => {
  const dir = gitRepo("gate-bite-review-");
  const base = commit(
    dir,
    {
      "package.json": `${JSON.stringify({ name: "gate-bite-fixture", private: true, dependencies: {} }, null, 2)}\n`,
      "src/components/Small.tsx": "export function Small() {\n  return null;\n}\n",
    },
    "chore(fixture): a component under the ceiling"
  );

  // Control: an ordinary change with an ordinary subject.
  commit(
    dir,
    { "src/components/Small.tsx": "export function Small() {\n  return null;\n}\n\nexport const SMALL = 1;\n" },
    "fix(fixture): export a constant from the sample component"
  );
  const clean = runGate(dir, "agent-review.mjs", ["--base", base]);
  assert.equal(clean.status, 0, `an ordinary change must pass Part A:\n${output(clean)}`);
  assert.match(output(clean), /Part A \(mechanical\) — clean/);

  // The breach: all three mechanical rules a diff can break on its own.
  const huge = ["export function Huge() {", ...Array.from({ length: 250 }, (_, i) => `  const v${i} = ${i};`), "  return null;", "}", ""].join("\n");
  commit(
    dir,
    {
      "src/components/Huge.tsx": huge,
      "src/app/thing/page.tsx": 'export const dynamic = "force-dynamic";\n\nexport default function Page() {\n  return null;\n}\n',
    },
    "fix: Done. Here's what I found and changed"
  );
  const res = runGate(dir, "agent-review.mjs", ["--base", base]);
  assert.equal(res.status, 1, "Part A is the half that blocks — a diff breaking three of its five rules must not pass.");
  const text = output(res);
  assert.match(text, /A1 component-growth/);
  assert.match(text, /A2 route-segment-config/);
  assert.match(text, /A5 commit-subject/);
});

test("review:agent:gate still checks the subject when the diff nets out to nothing", () => {
  // THE HOLE THIS CLOSES. The reviewer returns early when `BASE...HEAD` has no
  // changed files — correctly, because CI's shallow `check` job diffs the pushed
  // commit against itself. But an empty DIFF is not an empty RANGE: a change and
  // its revert, or an `--allow-empty` commit, leave subjects on master with no
  // net change behind them. Those are precisely the subjects A5 was drawn around
  // — "the run produced no change" is what produces `fix: Agent session exceeded
  // 20 min and was stopped` — so the one case the rule exists for was the one
  // case it skipped, on a repository where master ships on push.
  const dir = gitRepo("gate-bite-review-empty-");
  const base = commit(
    dir,
    {
      "package.json": `${JSON.stringify({ name: "gate-bite-fixture", private: true, dependencies: {} }, null, 2)}\n`,
      "src/lib/thing.ts": "export const THING = 1;\n",
    },
    "chore(fixture): add a module to change and change back"
  );
  commit(dir, { "src/lib/thing.ts": "export const THING = 2;\n" }, "fix(fixture): bump the sample constant");
  commit(dir, { "src/lib/thing.ts": "export const THING = 1;\n" }, "fix: Agent session exceeded 20 min and was stopped");

  const res = runGate(dir, "agent-review.mjs", ["--base", base]);
  const text = output(res);
  assert.equal(
    res.status,
    1,
    `a narrating subject must fail Part A even when the diff nets out to nothing — it reaches master either ` +
      `way, and a bisect landing on it learns only that somebody's clock ran out:\n${text}`
  );
  assert.match(text, /A5 commit-subject/);
  assert.match(text, /exceeded 20 min/);

  // And the control, which is the half that makes the early exit still correct:
  // an empty range says nothing and exits 0, the way CI's shallow checkout does.
  const head = git(dir, ["rev-parse", "HEAD"]).stdout.trim();
  const empty = runGate(dir, "agent-review.mjs", ["--base", head]);
  assert.equal(
    empty.status,
    0,
    `a range with no commits in it must stay a no-op — that is what makes one command correct in CI's shallow ` +
      `check job as well as in the full review:\n${output(empty)}`
  );
});

// --- the list is closed -------------------------------------------------------

/** One row per `check:ci` stage. `fixture` names the test above that proves it
 *  bites; `coveredBy` points at a suite that already did; `exempt` says why there
 *  is no known-bad fixture, in enough words to argue with. */
const COVERAGE = [
  {
    stage: "adr:check",
    exempt:
      "Rule 5 walks every repository path cited in an ADR, so a fixture that is not a false red needs the whole " +
      "tracked tree — including public/ and the .claude/ skill directories, which are links into the shared AI " +
      "registry and cannot be copied on every machine. The nearest existing proof is " +
      "test-unit/docs-task-index.test.mjs, which goes red when an ADR lands with no route to it.",
  },
  { stage: "docs:parity", fixture: "docs:parity fails when the two editions state different licences" },
  {
    stage: "agents:surface",
    exempt:
      "Its unmapped-file count comes from `git ls-files` over the tracked tree, so the smallest honest fixture " +
      "is a second checkout rather than a copied directory. Its lock half is proven from the other side by " +
      "test-unit/docs-task-index.test.mjs (the manifest pointers must resolve), and its content half — an " +
      "instruction-shaped line inside a generated region — is exercised directly against injected text in " +
      "test-unit/agent-surface-instructions.test.mjs. This is the weakest row here and its ratchet half should " +
      "get a fixture the next time the script is touched.",
  },
  { stage: "checkpoint:check", fixture: "checkpoint:check fails on a handoff that no longer parses" },
  {
    stage: "actions:check",
    fixture: "actions:check refuses a privileged trigger, an unscoped token and a spliced expression",
  },
  { stage: "sast", fixture: "sast fails on dynamic code execution and a server env var in a client module" },
  { stage: "merge-gate", fixture: "merge-gate fails when a required check is softened so it cannot fail" },
  { stage: "contract:ledger:check", coveredBy: "test-unit/contract-ledger-ceiling.test.mjs" },
  {
    stage: "context:decay:check",
    fixture: "context:decay:check fails on an undeclared cross-group import this change introduced",
  },
  {
    stage: "review:agent:gate",
    fixture: "review:agent:gate fails on an oversized component, a route opt-out and a narrating subject",
  },
  { stage: "llm:gate:check", fixture: "llm:gate:check refuses an untagged chokepoint call site" },
  {
    stage: "llm:quality:check",
    fixture: "llm:quality:check fails when a served operation drops below its recorded baseline",
  },
  { stage: "llm:budget:check", fixture: "llm:budget:check fails when an operation costs more than its recorded ceiling" },
  { stage: "seed:check", fixture: "seed:check fails on a hand-edited demo dataset" },
  {
    stage: "check",
    exempt:
      "This stage is tsc, eslint and `next build` — third-party tools with their own test suites. What this " +
      "repository adds to them is the three seam fences in eslint.config.mjs, and those are asserted from the " +
      "other side by test-unit/lint-fences.test.mjs.",
  },
  {
    stage: "test:unit",
    exempt:
      "The stage IS this suite. A fixture proving that node:test fails on a failing test proves nothing about " +
      "this repository; what makes the stage load-bearing is that check:ci runs it, which every wiring test " +
      "here (this one included) depends on to have any teeth at all.",
  },
];

test("every blocking stage of check:ci either has a known-bad fixture or a written exemption", () => {
  const rows = new Map(COVERAGE.map((r) => [r.stage, r]));
  for (const entry of CHAIN) {
    const row = rows.get(entry.stage);
    assert.ok(
      row,
      `\`${entry.stage}\` is a stage of check:ci with no row in test-unit/gate-bite.test.mjs. A new gate arrives ` +
        "with the fixture that proves it bites, or with the reason it cannot have one."
    );
    const kinds = ["fixture", "coveredBy", "exempt"].filter((k) => row[k]);
    assert.equal(kinds.length, 1, `${entry.stage}: a row states exactly one of fixture / coveredBy / exempt.`);
    if (row.exempt) {
      assert.ok(
        row.exempt.length > 120,
        `${entry.stage}: an exemption needs a reason a reviewer can disagree with, not a phrase.`
      );
    }
  }
  for (const stage of rows.keys()) {
    assert.ok(
      CHAIN.some((e) => e.stage === stage),
      `test-unit/gate-bite.test.mjs claims to cover \`${stage}\`, which is no longer a stage of check:ci.`
    );
  }
});

test("a delegated row points at a suite that really runs the gate against a bad tree", () => {
  for (const row of COVERAGE.filter((r) => r.coveredBy)) {
    const path = join(ROOT, row.coveredBy);
    assert.ok(existsSync(path), `${row.stage}: ${row.coveredBy} does not exist.`);
    const text = readFileSync(path, "utf8");
    assert.match(
      text,
      /spawnSync/,
      `${row.stage}: ${row.coveredBy} no longer spawns the gate, so it asserts source text rather than behaviour.`
    );
  }
});

test("the fixture names in COVERAGE are tests that exist in this file", () => {
  const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
  for (const row of COVERAGE.filter((r) => r.fixture)) {
    assert.ok(
      self.includes(`test("${row.fixture}"`),
      `${row.stage}: COVERAGE names a fixture test "${row.fixture}" that this file does not define.`
    );
  }
});
