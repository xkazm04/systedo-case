#!/usr/bin/env node
/** Judgment half of the agent diff review — Part B of
 *  .github/agent-review-rubric.md (zero-dependency; uses global fetch).
 *
 *  Hands the diff and the repo's own rubric to a model and prints what comes
 *  back. It COMMENTS, it never blocks: a model's opinion about whether a change
 *  earns its keep should not be able to stop a merge, and a reviewer that can
 *  fail a build has to be one whose false-positive rate is known. The mechanical
 *  half (scripts/agent-review.mjs) is the part with an exit code.
 *
 *  Runs in .github/workflows/agent-review.yml when ANTHROPIC_API_KEY is
 *  configured; the workflow skips this step cleanly when it is not, so a fork or
 *  a keyless clone still gets Part A.
 *
 *  Deliberately not an action: this is one HTTPS call and one `gh` call, and a
 *  marketplace action would be a third-party dependency in a workflow that reads
 *  the diff of a repository holding live ad-platform credentials.
 *
 *  `--head` exists because of where this runs. The workflow's `judgment` job is
 *  the only place in the repository holding a model key and `pull-requests: write`
 *  at once, so it moves its working tree to the BASE revision and keeps the change
 *  reachable as a git object instead — the change reaches this script as `git diff`
 *  output, never as files it might load. Then HEAD is the base, and the ref to
 *  diff against has to be named. Defaults to `HEAD`, which is what a local
 *  `npm run review:agent`-style invocation wants.
 *
 *  UNTRUSTED INPUT IS FENCED. Everything this hands the model except the rubric is
 *  written by whoever wrote the change — the commit messages, the pull request
 *  body, Part A's report (which quotes added lines), and the diff. They are wrapped
 *  in per-run nonce delimiters and the system prompt says an instruction found
 *  inside one is a finding, not a command: scripts/lib/review-prompt.mjs, proven
 *  offline by test-unit/prompt-injection.test.mjs and against a real model by
 *  `npm run injection:drill -- --live`.
 *
 *  Usage:
 *    ANTHROPIC_API_KEY=… node scripts/agent-review-llm.mjs \
 *        [--base <ref>] [--head <ref>] [--mechanical <file>] [--body-file <file>] \
 *        [--summary <file>] [--pr <number>]
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrompt, newNonce, REVIEW_SYSTEM } from "./lib/review-prompt.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUBRIC = join(ROOT, ".github", "agent-review-rubric.md");

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const SUMMARY_FILE = arg("--summary");
const MECHANICAL = arg("--mechanical");
const PR = arg("--pr");
const OUT_FILE = arg("--out");

const MODEL = process.env.AGENT_REVIEW_MODEL || "claude-sonnet-5";
/** A diff bigger than this is a review-bandwidth problem in its own right, and
 *  Part A already says so. Truncate rather than fail — half a review beats none. */
const MAX_DIFF_CHARS = 180_000;

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.log("agent review (model): ANTHROPIC_API_KEY not set — skipping. Part A already ran.");
  process.exit(0);
}

function git(args) {
  const res = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return res.status === 0 ? res.stdout : null;
}

const BASE = arg("--base") || process.env.AGENT_REVIEW_BASE || "origin/master";
if (!git(["rev-parse", "--verify", "--quiet", `${BASE}^{commit}`])) {
  console.log(`agent review (model): base ${BASE} does not resolve — skipping.`);
  process.exit(0);
}
const HEAD = arg("--head") || process.env.AGENT_REVIEW_HEAD || "HEAD";
if (!git(["rev-parse", "--verify", "--quiet", `${HEAD}^{commit}`])) {
  console.log(`agent review (model): head ${HEAD} does not resolve — skipping.`);
  process.exit(0);
}

let diff = git(["diff", `${BASE}...${HEAD}`]) ?? "";
if (!diff.trim()) {
  console.log(`agent review (model): no changes against ${BASE}.`);
  process.exit(0);
}
let truncated = false;
if (diff.length > MAX_DIFF_CHARS) {
  diff = diff.slice(0, MAX_DIFF_CHARS);
  truncated = true;
}

const rubric = existsSync(RUBRIC) ? readFileSync(RUBRIC, "utf8") : "";
const mechanical = MECHANICAL && existsSync(MECHANICAL) ? readFileSync(MECHANICAL, "utf8") : "";
const messages = git(["log", "--format=%B%n---", `${BASE}..${HEAD}`]) ?? "";
const BODY_FILE = arg("--body-file");
const prBody = BODY_FILE && existsSync(BODY_FILE) ? readFileSync(BODY_FILE, "utf8") : "";

const system = REVIEW_SYSTEM;

// The commit messages, the PR body, Part A's report and the diff are all written
// by whoever wrote the change, and this job holds a model key and
// `pull-requests: write`. They go in fenced, keyed to a nonce minted here, with
// the system rules above saying what the fence means — see scripts/lib/review-prompt.mjs.
const NONCE = newNonce();
const prompt = buildPrompt({
  rubric,
  messages,
  prBody,
  mechanical,
  diff,
  nonce: NONCE,
  truncated,
  maxDiffChars: MAX_DIFF_CHARS,
});

let review;
try {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.log(`agent review (model): API ${res.status} — ${body.slice(0, 400)}`);
    process.exit(0); // never fail the build on the commenting half
  }
  const body = await res.json();
  review = (body.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
} catch (err) {
  console.log(`agent review (model): call failed — ${err.message}`);
  process.exit(0);
}

if (!review) {
  console.log("agent review (model): empty response.");
  process.exit(0);
}

const out = [`## Agent diff review — judgment (${MODEL})`, "", review, "", "---", "", "_Part B of `.github/agent-review-rubric.md`. This half comments; it does not block._"].join("\n");

console.log(out);
if (OUT_FILE) writeFileSync(OUT_FILE, out);
if (SUMMARY_FILE) {
  try {
    appendFileSync(SUMMARY_FILE, out + "\n");
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

if (PR) {
  const tmp = join(tmpdir(), "agent-review-comment.md");
  writeFileSync(tmp, out);
  const res = spawnSync("gh", ["pr", "comment", PR, "--body-file", tmp], { cwd: ROOT, encoding: "utf8" });
  if (res.status === 0) console.log(`\n(posted to PR #${PR})`);
  else console.log(`\n(could not post to PR #${PR}: ${(res.stderr || "").trim().slice(0, 200)})`);
}
