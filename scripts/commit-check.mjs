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
 *      whether the rule is drawn where the log actually goes wrong, and which also
 *      reports ATTRIBUTION coverage — how many of those commits say, in a form git
 *      can count, that an agent wrote them (scripts/commit-attribution.mjs);
 *    • a local `commit-msg` hook, where one is installed — the one moment a subject
 *      is still free to change without rewriting history.
 *
 *  Usage:
 *    npm run commit:check -- --range origin/master..HEAD
 *    node scripts/commit-check.mjs .git/COMMIT_EDITMSG      # commit-msg hook mode
 *    node scripts/commit-check.mjs --message "feat(x): …"
 *
 *  THE HOOKS INSTALL THEMSELVES. `.husky/commit-msg` (this file, plus the
 *  attribution check) and `.husky/prepare-commit-msg` (the trailer) used to be a
 *  `printf` a maintainer was expected to run by hand, documented here and never
 *  run — which is why the log shows ~97% agent authorship and about one commit in
 *  thirty that says so. `npm install` now writes both, every checkout, through
 *  `prepare` → scripts/install-commit-hooks.mjs. Verify yours with
 *  `npm run hooks:check`; a hook you have edited yourself is left alone.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { GUIDANCE, checkSubject, subjectOf } from "./commit-subject.mjs";
import { harnessOf, hasAttribution } from "./commit-attribution.mjs";
import { citesDecision, decisionProblems, decisionsOf, knownDecisions } from "./commit-decision.mjs";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};

// --- --decisions: what may be cited here -------------------------------------

if (argv.includes("--decisions")) {
  const known = knownDecisions();
  console.log("Decisions a commit may cite in a `Decision:` trailer:");
  console.log("");
  console.log(`  decision records (docs/adr/):     ${[...known.adrs].sort().join(", ") || "(none)"}`);
  console.log(`  rubric rules (.github/…rubric.md): ${[...known.rules].sort().join(", ") || "(none)"}`);
  console.log("");
  console.log("  Decision: ADR-0001                 one decision this change acted on");
  console.log("  Decision: rubric-A6, ADR-0007      more than one, or a finding and the record behind it");
  console.log("");
  console.log("  Citing nothing is the common and correct case — most changes act on no recorded decision, and a");
  console.log("  log where every commit cites ADR-0007 would say less than one where none does. What is refused is");
  console.log("  a citation that does not RESOLVE: rules in scripts/commit-decision.mjs.");
  process.exit(0);
}

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
  // Unit-separated fields and a record separator, so a body containing newlines
  // (which every body does) cannot be mistaken for the next commit.
  const res = spawnSync("git", ["log", "--no-merges", "--format=%H%x1f%s%x1f%B%x1e", range], { encoding: "utf8" });
  if (res.error || res.status !== 0) {
    console.error(`commit-check: could not read \`git log ${range}\` — nothing to audit.`);
    process.exit(0);
  }
  const entries = res.stdout
    .split("\x1e")
    .map((r) => r.replace(/^\s+/, ""))
    .filter((r) => r.includes("\x1f"))
    .map((r) => {
      const [sha, subject, body = ""] = r.split("\x1f");
      return { sha, subject, body };
    });

  let bad = 0;
  for (const { sha, subject } of entries) {
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

  // Attribution — the other half of "what does this log tell a future reader?".
  // REPORTING rung (docs/adr/0007-gate-rung-discipline.md): it does not pass over
  // this repository's history, so it prints and never decides the exit code. The
  // subject rules above are what block.
  const unattributed = entries.filter((e) => !hasAttribution(e.body));
  console.log(
    `commit-check: ${entries.length - unattributed.length} of ${entries.length} carry a machine-readable ` +
      "authorship trailer (Co-Authored-By / Assisted-by / Generated-by)."
  );
  if (unattributed.length) {
    for (const e of unattributed.slice(0, 15)) console.log(`    ? ${e.sha.slice(0, 8)}  ${e.subject}`);
    if (unattributed.length > 15) console.log(`    … and ${unattributed.length - 15} more`);
    console.log(
      "    Nearly every commit here is agent-written and the log cannot say which. `npm install` wires the" +
        " hook that adds it (npm run hooks:check) — commits made outside a wired checkout stay unattributed."
    );
  }

  // And WHICH LANE — the question "an assistant wrote it" does not answer. Same
  // reporting rung as attribution: this does not pass over history either, and it
  // is the number that says whether the harness trailers are actually arriving.
  const byHarness = new Map();
  for (const e of entries) {
    const h = harnessOf(e.body);
    if (h) byHarness.set(h, (byHarness.get(h) ?? 0) + 1);
  }
  const named = [...byHarness.values()].reduce((a, b) => a + b, 0);
  console.log(
    `commit-check: ${named} of ${entries.length} name the lane that wrote them (\`Agent-Harness\`).` +
      (byHarness.size ? `  ${[...byHarness].map(([h, n]) => `${h}: ${n}`).join(", ")}` : "")
  );
  if (named < entries.length) {
    console.log(
      "    A regression traced back to a commit here cannot be traced to the harness that produced it." +
        " The hook adds it (npm run hooks:check); a lane that commits for itself should write it itself."
    );
  }

  // And WHICH DECISION — the third fact, after shape and origin. Two rungs, and
  // they are different questions (scripts/commit-decision.mjs):
  //
  //   BLOCKING   a `Decision:` that does not resolve. A citation to a record this
  //              repository does not have is worse than no citation, because it is
  //              read with confidence.
  //   REPORTING  coverage. Most commits act on no recorded decision and should carry
  //              nothing; a log where every commit cites ADR-0007 says less than one
  //              where none does.
  const known = knownDecisions();
  const WANTED = arg("--decision");
  let unresolved = 0;
  const cited = new Map();
  for (const e of entries) {
    const values = decisionsOf(e.body);
    if (!values.length) continue;
    for (const v of values) cited.set(v, (cited.get(v) ?? 0) + 1);
    const problems = decisionProblems(values, known);
    if (!problems.length) continue;
    unresolved += 1;
    console.log(`✗ ${e.sha.slice(0, 8)}  ${e.subject}`);
    for (const p of problems) console.log(`    • ${p}`);
  }
  const withDecision = entries.filter((e) => decisionsOf(e.body).length).length;
  console.log(
    `commit-check: ${withDecision} of ${entries.length} name the decision they acted on (\`Decision:\`).` +
      (cited.size ? `  ${[...cited].map(([d, n]) => `${d}: ${n}`).join(", ")}` : "")
  );

  // The reverse query, which is the whole reason the trailer is worth writing:
  // "which changes were actually made under ADR-0001?" — unanswerable from a log
  // that records only shape and origin.
  if (WANTED) {
    const hits = entries.filter((e) => citesDecision(e.body, WANTED));
    console.log("");
    console.log(`Commits in ${range} acting on ${WANTED}: ${hits.length}`);
    for (const e of hits) console.log(`    ${e.sha.slice(0, 8)}  ${e.subject}`);
    if (!hits.length) {
      console.log(
        "    None. Either nothing here touched that decision, or the commits that did were written before the" +
          " trailer existed — `npm run commit:check -- --decisions` lists what may be cited."
      );
    }
  }

  process.exit(bad || unresolved ? 1 : 0);
}

// --- a single message: a hook's file, or --message ---------------------------

const inline = arg("--message");
const wanted = arg("--decision");
const file = argv.find((a) => !a.startsWith("--") && a !== inline && a !== wanted);

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
if (problems.length) {
  report(`this subject describes the session, not the change:\n\n    ${subject}`, problems);
  process.exit(1);
}

// A `Decision:` trailer is optional — most changes act on no recorded decision. One
// that is PRESENT and does not resolve is refused here, at the one moment the
// message is still free to change: a citation to a record this repository does not
// have is read with confidence and is worse than no citation at all.
const cited = decisionsOf(message);
if (cited.length) {
  const bad = decisionProblems(cited);
  if (bad.length) {
    console.error("");
    console.error("✗ commit-check: this commit cites a decision that does not resolve.");
    console.error("");
    for (const p of bad) console.error(`  • ${p}`);
    console.error("");
    console.error("  Rules: scripts/commit-decision.mjs · what may be cited: npm run commit:check -- --decisions");
    console.error("");
    process.exit(1);
  }
}
process.exit(0);
