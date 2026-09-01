/** The blast radius of this pipeline, asserted rather than reviewed.
 *
 *  Rule P1 of scripts/actions-pin.mjs refuses a workflow with no `permissions:`
 *  block, which is the failure that hands a job the repository default token. It
 *  says nothing about what the block GRANTS. Nine workflows are least-privilege
 *  today and seven `write` grants exist across four of them — a number nobody
 *  could have known without opening nine files — and any one of them could be
 *  widened, or a tenth workflow could arrive holding `contents: write`, in a diff
 *  whose whole visible change is two words of YAML.
 *
 *  Rule P10 compares every grant against `.github/workflow-permissions.json` in
 *  both directions. This file is the other side of it:
 *
 *    1. the rule passes on the tree as it stands (so red is a regression, per
 *       docs/adr/0007-gate-rung-discipline.md);
 *    2. the write grants counted here INDEPENDENTLY of the gate's own parser
 *       match the ones the declaration justifies — a parser that quietly stopped
 *       seeing a `permissions:` block would otherwise pass by seeing nothing;
 *    3. the rule actually refuses a widening, proven by pointing the real gate at
 *       a fixture declaration rather than by trusting that it would.
 *
 *  Runs inside `npm run test:unit` → `npm run check:ci` → `.husky/pre-push`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WF_DIR = join(ROOT, ".github", "workflows");
const GATE = join(ROOT, "scripts", "actions-pin.mjs");
const DECL_PATH = join(ROOT, ".github", "workflow-permissions.json");
const declaration = JSON.parse(readFileSync(DECL_PATH, "utf8"));

const runGate = (args = []) =>
  spawnSync(process.execPath, [GATE, ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

const workflowFiles = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));

/** Every `<scope>: write` line in the workflows, found without the gate's parser.
 *  Deliberately dumber than P10: it cannot say which job a grant belongs to, and
 *  that is the point — it is a second opinion on the COUNT. */
function writeLines() {
  const found = [];
  for (const file of workflowFiles) {
    readFileSync(join(WF_DIR, file), "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        const m =
          /^\s+(contents|packages|deployments|security-events|statuses|id-token|pages|repository-projects|discussions|actions|checks|issues|pull-requests|attestations|models):\s*write\s*$/.exec(
            line
          );
        if (m) found.push(`${file}:${i + 1} ${m[1]}`);
      });
  }
  return found;
}

test("the actions policy passes on this tree, P10 included", () => {
  const res = runGate();
  assert.equal(
    res.status,
    0,
    `\`npm run actions:check\` is red:\n\n${res.stdout}\n${res.stderr}\n\n` +
      "P10 is blocking because it passes today — a red here is a grant that moved without its declaration."
  );
  assert.match(
    res.stdout,
    /write grants: \d+, each declared and justified/,
    "the gate no longer reports the write grants it checked, so a run that saw none looks like a clean one."
  );
});

test("the write grants the gate justifies are the ones the workflows actually hold", () => {
  const lines = writeLines();
  const justified = Object.keys(declaration.writes ?? {});
  assert.ok(lines.length > 0, "no write grant found at all — the second opinion has stopped matching the YAML.");
  assert.equal(
    justified.length,
    lines.length,
    `${lines.length} write grant(s) in .github/workflows and ${justified.length} justified in ` +
      `.github/workflow-permissions.json.\n  tree: ${lines.join("\n        ")}\n  file: ${justified.join(", ")}`
  );
});

test("every justified write says what needs it and what it was split away from", () => {
  for (const [key, entry] of Object.entries(declaration.writes ?? {})) {
    assert.ok(
      String(entry.why ?? "").trim().length > 20,
      `${key}: \`why\` has to name the API call that needs the scope, not restate the scope.`
    );
    assert.ok(
      String(entry.separatedFrom ?? "").trim().length > 20,
      `${key}: \`separatedFrom\` is missing. Least privilege is a claim about what was taken AWAY — a write ` +
        "grant with nothing recorded next to it is a scope nobody can argue is minimal."
    );
    assert.equal(
      typeof entry.runsRepositoryCode,
      "boolean",
      `${key}: \`runsRepositoryCode\` decides how much an injected instruction could be worth in that job.`
    );
  }
});

test("every workflow and every job is declared", () => {
  for (const file of workflowFiles) {
    assert.ok(
      declaration.workflows?.[file],
      `${file} has no entry in .github/workflow-permissions.json — a workflow arrives with a token.`
    );
  }
  for (const file of Object.keys(declaration.workflows ?? {})) {
    assert.ok(workflowFiles.includes(file), `.github/workflow-permissions.json declares ${file}, which is gone.`);
  }
});

// --- the rule, seen failing ---------------------------------------------------

/** The real declaration with one edit, written somewhere the gate can be pointed
 *  at. The workflows stay untouched: what is being proven is that P10 notices the
 *  tree and the declaration disagreeing, whichever side moved. */
function fixture(mutate) {
  const copy = JSON.parse(JSON.stringify(declaration));
  mutate(copy);
  const path = join(mkdtempSync(join(tmpdir(), "wf-perms-")), "workflow-permissions.json");
  writeFileSync(path, JSON.stringify(copy, null, 2));
  return path;
}

test("a grant the declaration narrows is refused as a widening", () => {
  // The declaration says `contents: read`, the tree says `contents: write` — which
  // is exactly what a diff that widens a grant looks like from the gate's side.
  const path = fixture((d) => {
    d.workflows["issue-dispatch.yml"].jobs.push.contents = "read";
  });
  const res = runGate(["--permissions", path]);
  assert.equal(res.status, 1, "a grant wider than its declaration must fail P10.");
  assert.match(`${res.stdout}${res.stderr}`, /widening/);
});

test("a write with no recorded reason is refused", () => {
  const path = fixture((d) => {
    delete d.writes["issue-dispatch.yml#push.contents"];
  });
  const res = runGate(["--permissions", path]);
  assert.equal(res.status, 1, "a `write` scope with no reason recorded must fail P10.");
  assert.match(`${res.stdout}${res.stderr}`, /least privilege is a claim about what was taken away/i);
});

test("an undeclared job is refused", () => {
  const path = fixture((d) => {
    delete d.workflows["agent-review.yml"].jobs.judgment;
  });
  const res = runGate(["--permissions", path]);
  assert.equal(res.status, 1, "a job the declaration does not list must fail P10.");
  assert.match(`${res.stdout}${res.stderr}`, /is not in \.github\/workflow-permissions\.json/);
});

test("a declaration describing a pipeline that no longer exists is refused", () => {
  const path = fixture((d) => {
    d.workflows["ci.yml"].jobs["a-job-that-never-existed"] = { contents: "read" };
  });
  const res = runGate(["--permissions", path]);
  assert.equal(res.status, 1, "a stale declaration reads exactly like a current one, so it has to fail too.");
  assert.match(`${res.stdout}${res.stderr}`, /which the workflow no longer/);
});
