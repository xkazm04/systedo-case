/** The issue → draft-pull-request dispatch, held to the two things that make it
 *  admissible in a repository holding live advertiser credentials.
 *
 *  scripts/issue-dispatch.mjs turns a maintainer's label into a draft change: a
 *  model reads the issue and writes files, and a second job pushes a branch and
 *  opens a DRAFT pull request. The change itself is safe because every gate that
 *  judges a human's diff judges this one. What is NOT safe by construction is the
 *  proposal's reach — a model-authored change that could edit `.github/workflows/`,
 *  `scripts/` or `docs/adr/` would be editing the rules that judge it, and would
 *  pass every one of them by doing so.
 *
 *  So the fence is the allowlist in `safePath`, and this is what holds it:
 *
 *    • the roots stay narrow, and the surfaces that decide whether a change lands
 *      stay outside them;
 *    • traversal, absolute paths and the git directory are refused on the RESOLVED
 *      path, so `docs/../.github/workflows/ci.yml` is refused by the same rule that
 *      refuses `.github/workflows/ci.yml`;
 *    • the key-gated half announces its own absence on both branches, so a lapsed
 *      key does not turn this workflow into a green job that quietly proposes
 *      nothing.
 *
 *  `npm run test:unit` is inside check:ci, so widening the fence turns the suite
 *  red on the widener's own machine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ALLOWED_ROOTS, DENIED_PREFIXES, extractJson, safePath } from "../scripts/issue-dispatch.mjs";
import { CAPABILITIES } from "../scripts/harness-degradation.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = join(ROOT, ".github", "workflows", "issue-dispatch.yml");

test("a proposal may not write the surfaces that decide whether it lands", () => {
  const forbidden = [
    ".github/workflows/ci.yml",
    ".github/required-checks.json",
    ".github/security/sast-allowlist.json",
    "scripts/agent-review.mjs",
    "scripts/commit-subject.mjs",
    "eslint.config.mjs",
    "package.json",
    "AGENTS.md",
    "docs/adr/0007-gate-rung-discipline.md",
    // The same targets by another route: everything is decided on the resolved
    // path, so a traversal is not a second rule to remember.
    "docs/../.github/workflows/ci.yml",
    "src/../scripts/sast.mjs",
    "/etc/passwd",
    "../outside.txt",
  ];
  for (const path of forbidden) {
    assert.equal(
      safePath(path).ok,
      false,
      `a model proposal was allowed to write ${path}. A draft that can edit the gates that judge it is not a ` +
        "draft, it is a bypass — and it would pass every check by having changed them."
    );
  }
});

test("a proposal may write the things a change is actually made of", () => {
  for (const path of ["src/lib/leads/store.ts", "src/components/app/Modal.tsx", "test-unit/leads.test.mjs", "docs/deploy.md"]) {
    const verdict = safePath(path);
    assert.ok(verdict.ok, `${path} is ordinary content and the dispatch refused it: ${verdict.why}`);
    assert.equal(verdict.path, path, "the repo-relative path is what gets committed, so it must survive the check.");
  }
});

test("the allowlist stays narrow, and the decision records stay outside it", () => {
  assert.deepEqual(
    ALLOWED_ROOTS,
    ["src/", "test-unit/", "docs/"],
    "widening the roots is allowed and is a decision — but it belongs in a diff a reviewer reads, next to the " +
      "reason. Silently is how a fence stops being one."
  );
  assert.ok(
    DENIED_PREFIXES.includes("docs/adr/"),
    "`docs/` is writable so a draft can update a runbook, which puts the ADRs inside an allowed root. A " +
      "proposal may cite a decision record; it may not write one."
  );
});

test("a model's JSON survives the prose and the code fence it arrives wrapped in", () => {
  assert.deepEqual(extractJson('Here is the plan:\n```json\n{"read": ["src/a.ts"]}\n```\nHope that helps.'), {
    read: ["src/a.ts"],
  });
  assert.deepEqual(extractJson('{"subject": "feat(x): add}the thing"}'), { subject: "feat(x): add}the thing" });
  assert.equal(extractJson("no object here at all"), null);
});

test("the dispatch announces its own absence on both branches of the key check", () => {
  // Without ANTHROPIC_API_KEY this workflow does not fail, it stops proposing —
  // and a label that looks applied over a job that looks green is exactly the
  // silence scripts/harness-degradation.mjs exists to break.
  const cap = CAPABILITIES.find((c) => c.id === "issue-dispatch");
  assert.ok(cap, "the key-gated dispatch is not declared in scripts/harness-degradation.mjs.");
  assert.equal(cap.needs, "ANTHROPIC_API_KEY");
  assert.equal(cap.announces, true);

  const wf = readFileSync(WORKFLOW, "utf8")
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
  const statuses = [...wf.matchAll(/harness-degradation\.mjs --announce issue-dispatch --status (\w+)/g)].map(
    (m) => m[1]
  );
  assert.deepEqual(
    [...new Set(statuses)].sort(),
    ["absent", "ran"],
    "the announce call must sit on BOTH sides of the `if [ -z \"$ANTHROPIC_API_KEY\" ]`, so a run says which " +
      "strength it dispatched at either way."
  );
});

test("the model key and the write scope are never in the same job", () => {
  // The invariant agent-review.yml is built around, restated here because this
  // workflow is the second place in the repository that holds both.
  const text = readFileSync(WORKFLOW, "utf8");
  const jobs = text.split(/\n  (?=[a-z][a-z0-9-]*:\n)/).slice(1);
  assert.ok(jobs.length >= 2, "issue-dispatch.yml no longer splits proposing from pushing.");
  for (const job of jobs) {
    const body = job
      .split(/\r?\n/)
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");
    const holdsKey = /secrets\.ANTHROPIC_API_KEY/.test(body);
    const canWrite = /(contents|pull-requests):\s*write/.test(body);
    assert.ok(
      !(holdsKey && canWrite),
      "a job holds both the model key and a write scope. The proposal must cross between them as an artifact, " +
        "which is data — that split is what keeps a model's answer from being a token's."
    );
  }
});

test("no job holds both `contents: write` and `pull-requests: write`", () => {
  // The second cut, and the one this workflow was missing while every other
  // workflow here stayed narrow. They are two capabilities with two different
  // worst cases: `contents: write` can push any ref including master, and master
  // ships on push; `pull-requests: write` can speak in this repository's name.
  // Anything talked into one should not thereby have the other.
  const text = readFileSync(WORKFLOW, "utf8");
  const jobs = text.split(/\n  (?=[a-z][a-z0-9-]*:\n)/).slice(1);
  const broad = [];
  for (const job of jobs) {
    const body = job
      .split(/\r?\n/)
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");
    const name = /^\s*([a-z][a-z0-9-]*):/.exec(job)?.[1] ?? "(unnamed)";
    if (/contents:\s*write/.test(body) && /pull-requests:\s*write/.test(body)) broad.push(name);
  }
  assert.deepEqual(
    broad,
    [],
    `job(s) ${broad.join(", ")} hold both write scopes at once. Split the pushing half from the speaking ` +
      "half and pass the branch name, the subject and the body between them as an artifact."
  );
});

test("every workflow in the repository keeps the two write scopes in different jobs", () => {
  // Stated once for the tree rather than once per file, so the next workflow an
  // agent adds cannot quietly re-introduce the broadest token here by copying an
  // older one.
  const dir = join(ROOT, ".github", "workflows");
  const offenders = [];
  for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    const text = readFileSync(join(dir, file), "utf8");
    for (const job of text.split(/\n  (?=[a-z][a-z0-9-]*:\n)/).slice(1)) {
      const body = job
        .split(/\r?\n/)
        .filter((l) => !/^\s*#/.test(l))
        .join("\n");
      if (/contents:\s*write/.test(body) && /pull-requests:\s*write/.test(body)) {
        offenders.push(`${file}:${/^\s*([a-z][a-z0-9-]*):/.exec(job)?.[1] ?? "?"}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `these jobs hold both write scopes: ${offenders.join(", ")}`);
});
