#!/usr/bin/env node
/** The commit-subject contract, on demand (zero-dependency).
 *
 *  The rules live in scripts/commit-subject.mjs and are enforced where they have
 *  teeth: rule A5 of .github/agent-review-rubric.md, run by scripts/agent-review.mjs
 *  on every push and pull request and inside `npm run check:ci` — which
 *  .husky/pre-push runs before any push that updates master. This file is the same
 *  rules pointed at something else:
 *
 *    • auditing history that already exists (`--range`), which is how you find out
 *      whether the rule is drawn where the log actually goes wrong;
 *    • a local `commit-msg` hook, where one is installed — the one moment a subject
 *      is still free to change without rewriting history.
 *
 *  Usage:
 *    npm run commit:check -- --range origin/master..HEAD
 *    node scripts/commit-check.mjs .git/COMMIT_EDITMSG      # commit-msg hook mode
 *    node scripts/commit-check.mjs --message "feat(x): …"
 *
 *  To install the hook in your own checkout (husky owns .husky/, so this is a
 *  one-liner rather than a committed file):
 *
 *    printf '#!/usr/bin/env sh\nnode scripts/commit-check.mjs "$1"\n' > .husky/commit-msg
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { GUIDANCE, checkSubject, subjectOf } from "./commit-subject.mjs";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};

function report(label, problems) {
  console.error("");
  console.error(`✗ commit-check: ${label}`);
  console.error("");
  for (const p of problems) console.error(`  • ${p}`);
  console.error("");
  for (const line of GUIDANCE) console.error(`  ${line}`);
  console.error("");
  console.error("  Rules: scripts/commit-subject.mjs · rubric A5 · bypass: git commit --no-verify");
  console.error("");
}

// --- --range: the same rules over history that already exists ----------------

if (argv.includes("--range")) {
  const range = arg("--range") || "origin/master..HEAD";
  // `%H %s`: a hash never contains a space, so the first one separates the two.
  const res = spawnSync("git", ["log", "--no-merges", "--format=%H %s", range], { encoding: "utf8" });
  if (res.error || res.status !== 0) {
    console.error(`commit-check: could not read \`git log ${range}\` — nothing to audit.`);
    process.exit(0);
  }
  const entries = res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const at = l.indexOf(" ");
      return at === -1 ? [l, ""] : [l.slice(0, at), l.slice(at + 1)];
    });

  let bad = 0;
  for (const [sha, subject] of entries) {
    const problems = checkSubject(subject);
    if (!problems.length) continue;
    bad += 1;
    console.log(`✗ ${sha.slice(0, 8)}  ${subject}`);
    for (const p of problems) console.log(`    • ${p}`);
  }
  console.log("");
  console.log(
    `commit-check: ${entries.length - bad} of ${entries.length} subject(s) in ${range} describe the change.`
  );
  process.exit(bad ? 1 : 0);
}

// --- a single message: a hook's file, or --message ---------------------------

const inline = arg("--message");
const file = argv.find((a) => !a.startsWith("--") && a !== inline);

let message = inline;
if (message == null) {
  if (!file) {
    console.error("commit-check: no message file and no --message. Nothing to check.");
    process.exit(1);
  }
  try {
    message = readFileSync(file, "utf8");
  } catch (err) {
    console.error(`commit-check: could not read ${file} — ${err.message}`);
    process.exit(1);
  }
}

const subject = subjectOf(message);
const problems = checkSubject(subject);
if (!problems.length) process.exit(0);

report(`this subject describes the session, not the change:\n\n    ${subject}`, problems);
process.exit(1);
