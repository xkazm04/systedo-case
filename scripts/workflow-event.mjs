#!/usr/bin/env node
/** Read the GitHub event payload from disk instead of splicing it into a workflow.
 *
 *  WHY THIS EXISTS. A workflow needs a few facts about the event that started it:
 *  which commit to diff against, whether there is a pull request, what its body
 *  says. The usual way to get them is `${{ github.event.… }}`, and the usual
 *  hardening advice is to bind that expression in the step's `env:` rather than
 *  splice it into `run:` — which is right, and is rule P7 in scripts/actions-pin.mjs.
 *
 *  But an `env:` binding fixes the SHAPE, not the exposure. The value still lands
 *  in the process environment of every program the step runs, it is still one
 *  unquoted expansion (`printf %s $BODY`) away from being parsed as shell words,
 *  and it is still copied into the YAML by a substitution that happens before
 *  anything can validate it. On this repository the jobs in question hold live
 *  Google Ads / Sklik / Resend credentials and a model key, so "safe as long as
 *  every reference stays quoted" is a weaker guarantee than the value never
 *  arriving at all.
 *
 *  GitHub already writes the entire event payload to a JSON file on the runner and
 *  names it in `GITHUB_EVENT_PATH`. Reading it there is the same data with none of
 *  the substitution: contributor text becomes a JSON string in this process, gets
 *  written to a file, and is read back by the reviewer as a file. It is never an
 *  argument, never an environment variable, never a line of YAML. That is what
 *  rule P9 requires of every workflow here — `github.event.*` and `github.head_ref`
 *  may not appear in one at all.
 *
 *  ANYTHING THAT LEAVES THIS SCRIPT AS A SHELL-VISIBLE VALUE IS VALIDATED. `--get`
 *  writes free text to a file, which is inert. `--base-ref` writes `key=value`
 *  lines to `$GITHUB_OUTPUT`, and a newline in a value there would forge a second
 *  output — so a ref must look like a ref and a PR number must be an integer, or
 *  this exits non-zero rather than emitting something a later step will trust.
 *
 *  Usage:
 *    node scripts/workflow-event.mjs --get <dotted.path> --out <file>   (repeatable)
 *    node scripts/workflow-event.mjs --base-ref --out <file>
 *
 *  `--get` writes the value as-is, and an empty file when the field is absent (a
 *  push event has no `pull_request`), so a consumer can always read the file.
 *  `--base-ref` writes `ref=<the revision to review against>` and, when the event
 *  is a pull request, `pr=<number>`; point `--out` at "$GITHUB_OUTPUT".
 *
 *  Zero-dependency, like every other script in scripts/ — it runs before `npm ci`.
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A git revision this script is willing to hand to a later step. Refname rules
 *  already forbid whitespace and most punctuation; this restates them so that a
 *  value which somehow carried a newline cannot forge a second `$GITHUB_OUTPUT`
 *  line. */
const REF_RE = /^[0-9A-Za-z][0-9A-Za-z._/-]*$/;

function die(message) {
  console.error(`✗ workflow-event: ${message}`);
  process.exit(1);
}

function payload() {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) die("GITHUB_EVENT_PATH is not set — this only runs inside a GitHub Actions job.");
  if (!existsSync(path)) die(`GITHUB_EVENT_PATH points at ${path}, which does not exist.`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    die(`could not parse the event payload at ${path}: ${err.message}`);
  }
}

/** `pull_request.base.sha` → the value, or undefined. No `eval`, no path built
 *  from anything the payload itself contains. */
function pick(obj, dotted) {
  return dotted.split(".").reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

const argv = process.argv.slice(2);
if (!argv.length) die("nothing to do — see the usage block at the top of this file.");

const event = payload();

// --- --base-ref --------------------------------------------------------------

function hasCommit(rev) {
  const res = spawnSync("git", ["cat-file", "-e", `${rev}^{commit}`], { cwd: ROOT, encoding: "utf8" });
  return res.status === 0;
}

if (argv.includes("--base-ref")) {
  const outIdx = argv.indexOf("--out");
  const out = outIdx !== -1 ? argv[outIdx + 1] : null;
  if (!out) die("--base-ref needs --out FILE (normally \"$GITHUB_OUTPUT\").");

  // A pull request has its own base. A push knows the tip it replaced, which is
  // only usable if this checkout actually has that object — the first push to a
  // branch reports the all-zero SHA, and a force-push can name a commit that no
  // longer exists. Otherwise fall back to the default branch.
  const prBase = pick(event, "pull_request.base.sha");
  const before = event.before;
  const defaultBranch = pick(event, "repository.default_branch") || "master";

  let ref;
  if (typeof prBase === "string" && REF_RE.test(prBase)) {
    ref = prBase;
  } else if (typeof before === "string" && REF_RE.test(before) && hasCommit(before)) {
    ref = before;
  } else {
    if (!REF_RE.test(defaultBranch)) die(`the repository's default branch is not a usable refname: ${defaultBranch}`);
    ref = `origin/${defaultBranch}`;
  }

  const lines = [`ref=${ref}`];
  const number = pick(event, "pull_request.number");
  if (Number.isInteger(number)) lines.push(`pr=${number}`);

  appendFileSync(out, `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
  process.exit(0);
}

// --- --get <path> --out <file>, repeatable -----------------------------------

let wrote = 0;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "--get") continue;
  const dotted = argv[i + 1];
  if (!dotted || dotted.startsWith("--")) die("--get needs a dotted field path, e.g. `--get pull_request.body`.");
  if (argv[i + 2] !== "--out" || !argv[i + 3] || argv[i + 3].startsWith("--")) {
    die(`--get ${dotted} must be followed by --out FILE.`);
  }
  const out = argv[i + 3];
  const value = pick(event, dotted);
  // Absent is normal (a push has no `pull_request`), and an empty file is easier
  // for a consumer than a missing one. Objects are refused rather than serialised:
  // asking for one is a mistake in the workflow, not something to paper over.
  if (value != null && typeof value === "object") die(`\`${dotted}\` is an object, not a value.`);
  writeFileSync(out, value == null ? "" : String(value));
  console.log(`${dotted} → ${out} (${value == null ? "absent" : `${String(value).length} chars`})`);
  wrote++;
  i += 3;
}

if (!wrote) die("no `--get <path> --out <file>` pair and no `--base-ref` — nothing was written.");
