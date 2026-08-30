#!/usr/bin/env node
/** What the agent review has actually been catching — the trail, read back
 *  (zero-dependency; shells out to `gh`, which is preinstalled on the runner).
 *
 *  The rubric review has run on every change for months and, until this script,
 *  the only way to answer "which rubric rules have actually fired?" was to re-run
 *  it commit by commit. That is the difference between an automated reviewer you
 *  can improve and one you can only obey: a rule that never fires is dead weight
 *  in a blocking gate, and a rule that fires constantly is either a real problem
 *  or a badly drawn line — and both look identical from inside a single red build.
 *
 *  So this reads the trail back. scripts/agent-review.mjs emits its findings as
 *  GitHub check annotations (`--annotate`), which attach to the commit and survive
 *  the run; this walks the last N completed runs of .github/workflows/agent-review.yml,
 *  pulls the annotations of the BLOCKING job, and aggregates them into one table:
 *  rule, how often it fired, and the last change it fired on.
 *
 *  REPORTING RUNG (ADR-0007), on purpose and permanently. It needs the network and
 *  a token, so it can never be part of `check:ci` or the pre-push hook, and a
 *  reporting job that cannot fail is the honest shape for something whose output is
 *  a table for the weekly triage. It exits 0 even when it cannot reach the API.
 *
 *  Which job's annotations it reads is NOT hardcoded: it takes the display name
 *  from .github/required-checks.json — the same file that names the blocking half
 *  to branch protection — so renaming the job breaks `npm run merge-gate` first
 *  rather than making this quietly report on nothing.
 *
 *  Usage:
 *    npm run review:agent:history
 *    node scripts/agent-review-history.mjs [--runs 60] [--repo owner/name] [--summary FILE]
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = "agent-review.yml";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const SUMMARY_FILE = arg("--summary");
const RUNS = Math.min(Number(arg("--runs")) || 60, 100);
const REPO = arg("--repo") || process.env.GITHUB_REPOSITORY || "";

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

/** Write whatever was collected and leave without a verdict — see the rung note. */
function finish() {
  if (SUMMARY_FILE) {
    try {
      appendFileSync(SUMMARY_FILE, out.join("\n") + "\n");
    } catch (err) {
      console.error(`(could not write summary: ${err.message})`);
    }
  }
  process.exit(0);
}

/** The blocking job's DISPLAY name, taken from the enumeration of required checks
 *  so the two cannot drift apart in silence. */
function blockingJobName() {
  const path = join(ROOT, ".github", "required-checks.json");
  if (!existsSync(path)) return null;
  try {
    const spec = JSON.parse(readFileSync(path, "utf8"));
    const entry = (spec.required ?? []).find((r) => r.workflow === WORKFLOW);
    return entry?.check ?? null;
  } catch {
    return null;
  }
}

/** `gh api <path>` → parsed JSON, or null. Never throws. */
function api(path) {
  const res = spawnSync("gh", ["api", "-H", "Accept: application/vnd.github+json", path], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.error || res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

say("## Agent review — what it has been catching");
say("");

const JOB_NAME = blockingJobName();
if (!REPO) {
  say("_No repository to query (`GITHUB_REPOSITORY` unset and no `--repo`). Nothing to report._");
  finish();
}
if (!JOB_NAME) {
  say(`_No entry for \`${WORKFLOW}\` in .github/required-checks.json — cannot tell which job is the blocking half._`);
  finish();
}

const runs = api(`repos/${REPO}/actions/workflows/${WORKFLOW}/runs?status=completed&per_page=${RUNS}`);
if (!runs?.workflow_runs?.length) {
  say("_Could not read the workflow's run history (is `gh` authenticated?). Nothing to report._");
  finish();
}

/** rule → { count, lastSha, lastAt, paths:Set } */
const byRule = new Map();
const rows = [];
let annotationsReadable = 0;

for (const run of runs.workflow_runs) {
  const jobs = api(`repos/${REPO}/actions/runs/${run.id}/jobs?per_page=20`);
  const job = (jobs?.jobs ?? []).find((j) => j.name === JOB_NAME);
  if (!job) continue;

  // A job's id IS its check-run id, which is how the annotations it printed as
  // `::error file=…` workflow commands are addressable after the run.
  const annotations = api(`repos/${REPO}/check-runs/${job.id}/annotations`);
  const findings = Array.isArray(annotations) ? annotations.filter((a) => a.annotation_level === "failure") : [];
  if (Array.isArray(annotations)) annotationsReadable += 1;

  for (const a of findings) {
    const rule = String(a.title ?? "(untitled)").replace(/^Agent review · /, "");
    const seen = byRule.get(rule) ?? { count: 0, lastSha: null, lastAt: null, paths: new Set() };
    seen.count += 1;
    seen.lastSha = seen.lastSha ?? run.head_sha;
    seen.lastAt = seen.lastAt ?? run.created_at;
    if (a.path && a.path !== ".github") seen.paths.add(a.path);
    byRule.set(rule, seen);
  }

  rows.push({
    sha: String(run.head_sha ?? "").slice(0, 8),
    at: String(run.created_at ?? "").slice(0, 10),
    event: run.event,
    branch: run.head_branch,
    conclusion: job.conclusion,
    findings: findings.length,
    url: run.html_url,
  });
}

if (!rows.length) {
  say(`_No run in the last ${RUNS} carried a job named "${JOB_NAME}"._`);
  finish();
}

const blocked = rows.filter((r) => r.conclusion === "failure").length;
say(
  `Last **${rows.length}** completed runs of \`${WORKFLOW}\` · job "${JOB_NAME}" — ` +
    `**${blocked}** refused the change, ${rows.length - blocked} passed.`
);
say("");

if (byRule.size) {
  say("### Rules that actually fired");
  say("");
  say("| Rule | Times | Last seen | Files |");
  say("| --- | ---: | --- | --- |");
  for (const [rule, s] of [...byRule].sort((a, b) => b[1].count - a[1].count)) {
    const files = [...s.paths].slice(0, 3).join(", ") || "—";
    say(`| \`${rule}\` | ${s.count} | ${String(s.lastAt).slice(0, 10)} \`${String(s.lastSha).slice(0, 8)}\` | ${files} |`);
  }
  say("");
} else if (annotationsReadable) {
  say("### Rules that actually fired");
  say("");
  say(
    "None. Every run in the window was clean — which is the good outcome, and also the one worth " +
      "re-reading: a Part A rule that has never fired is either holding a line nobody crosses any more, " +
      "or drawn somewhere the work does not go. `.github/agent-review-rubric.md` is the place to say which."
  );
  say("");
} else {
  say("_Annotations were not readable for any run (needs `checks: read`); the verdict tally above still holds._");
  say("");
}

say("### Recent changes reviewed");
say("");
say("| Commit | Date | Event | Branch | Verdict | Findings |");
say("| --- | --- | --- | --- | --- | ---: |");
for (const r of rows.slice(0, 20)) {
  const verdict = r.conclusion === "failure" ? "✗ blocked" : r.conclusion === "success" ? "✓ clean" : (r.conclusion ?? "—");
  say(`| [\`${r.sha}\`](${r.url}) | ${r.at} | ${r.event} | ${r.branch ?? "—"} | ${verdict} | ${r.findings} |`);
}
say("");
say(
  "_Reporting rung — this table never fails a build. Read it on the weekly triage pass: a rule firing " +
    "constantly and a rule never firing are both questions for `.github/agent-review-rubric.md`._"
);

finish();
