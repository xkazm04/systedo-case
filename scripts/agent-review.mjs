#!/usr/bin/env node
/** Mechanical half of the agent diff review — Part A of
 *  .github/agent-review-rubric.md (zero-dependency).
 *
 *  Runs on every push and pull request (.github/workflows/agent-review.yml) and
 *  locally as `npm run review:agent -- --base origin/master`. Exit non-zero fails
 *  the job; the report is written to the job summary either way.
 *
 *  It also runs as a stage of `npm run check:ci` — early, among the other
 *  zero-dependency checks and before `next build`, so a subject or an `Ack:` that
 *  has to be reworded is refused in seconds rather than after a build — via
 *  `npm run review:agent:gate` (this script with `--base origin/master`). That is
 *  not belt-and-braces, it is the only place the rubric can stop THIS repo's
 *  actual landing path. Master ships by direct push (docs/deploy.md § Delivery
 *  contract), so "required status check on a pull request" never fires for most
 *  changes, and agent-review.yml's verdict on a push arrives after Vercel has
 *  already started building. `.husky/pre-push` runs check:ci before any push that
 *  updates refs/heads/master — so with this stage inside it, a blocking finding
 *  refuses the push instead of commenting on the release.
 *
 *  In CI's `check` job the same stage is a deliberate no-op: that job checks out
 *  shallow, `origin/master` there is the pushed commit itself, the diff is empty
 *  and this exits 0 — while agent-review.yml's `mechanical` job does the real
 *  review with fetch-depth: 0. One command, correct on both machines.
 *  test-unit/delivery-contract.test.mjs asserts the wiring, so deleting the stage
 *  from check:ci turns the unit suite red rather than quietly disarming Part A.
 *
 *  Why it exists: almost every commit here is written by an agent and triaged by
 *  one person weekly, so for most of a change's life the only thing that has read
 *  it is CI. These six rules are the invariants where "a reviewer will probably
 *  notice" is not good enough — each one is a way a green build can be bought
 *  rather than earned, or (A5) a way the log stops being bisectable. The judgment half of the rubric is a model's job and only
 *  comments; see scripts/agent-review-llm.mjs.
 *
 *  WHERE THE VERDICT GOES. A pass/fail buried in one CI chain is a review nobody
 *  can answer. So this writes the same finding four ways, each for a different
 *  reader:
 *
 *    stdout          — the person running it locally, or reading the failed step.
 *    --summary FILE  — the run's job summary, where the weekly triage starts.
 *    --annotate      — GitHub check annotations (`::error file=…,line=…`). These
 *                      attach to the COMMIT, render inline on the diff and on a
 *                      PR's Files view, and outlive the run: past annotations are
 *                      queryable, which is what makes scripts/agent-review-history.mjs
 *                      able to answer "which rubric rules have actually been firing"
 *                      without re-running anything.
 *    --json FILE     — one machine-readable record of the verdict, uploaded next to
 *                      the report so a run's findings can be diffed and counted
 *                      later rather than re-derived from prose.
 *
 *  Usage:
 *    node scripts/agent-review.mjs [--base <ref>] [--body-file <f>] [--summary <f>]
 *                                  [--out <f>] [--json <f>] [--annotate]
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSubject } from "./commit-subject.mjs";
import { harnessOf, hasAttribution } from "./commit-attribution.mjs";
import { printRemedy } from "./gate-remedy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const SUMMARY_FILE = arg("--summary");
const OUT_FILE = arg("--out");
const BODY_FILE = arg("--body-file");
const JSON_FILE = arg("--json");
const ANNOTATE = argv.includes("--annotate");

const COMPONENT_LOC_LIMIT = 200;
const LARGE_DIFF_LINES = 800;

/** CODEOWNERS "law" paths — changes here need the maintainer's eyes. Kept in
 *  step with .github/CODEOWNERS by hand; this list only decides what the report
 *  puts at the TOP, it never blocks (CODEOWNERS already requires the review). */
const LAW_PATHS = [
  "src/lib/plans.ts",
  "src/lib/usage.ts",
  "src/lib/ai/durable-limit.ts",
  "src/lib/llm/",
  "scripts/llm-gate.mjs",
  ".claude/",
  "CLAUDE.md",
  "AGENTS.md",
  ".github/workflows/",
  ".github/security/",
  ".github/agent-surface.lock.json",
  ".github/agent-review-rubric.md",
  ".github/required-checks.json",
  "scripts/merge-gate.mjs",
  "LICENSE",
  "CLA.md",
  "SECURITY.md",
];

function git(args, { allowFail = false } = {}) {
  const res = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) {
    if (allowFail) return null;
    console.error(`✗ agent review: git ${args.join(" ")} failed\n${res.stderr ?? ""}`);
    process.exit(1);
  }
  return res.stdout;
}

function resolveBase() {
  const explicit = arg("--base");
  const candidates = [explicit, process.env.AGENT_REVIEW_BASE, "origin/master", "master", "HEAD~1"].filter(Boolean);
  for (const c of candidates) {
    if (git(["rev-parse", "--verify", "--quiet", `${c}^{commit}`], { allowFail: true })) return c;
  }
  return null;
}

const BASE = resolveBase();
if (!BASE) {
  console.log("agent review: no base revision to diff against (single-commit history?) — nothing to review.");
  process.exit(0);
}

const range = `${BASE}...HEAD`;

/** A5 over `${BASE}..HEAD`, as [{ sha, subject, problems }]. Hoisted out of the
 *  rule below because it has to run on BOTH sides of the empty-diff exit. */
function subjectFindings() {
  const log = git(["log", "--no-merges", "--format=%H %s", `${BASE}..HEAD`], { allowFail: true }) ?? "";
  const found = [];
  for (const raw of log.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const at = line.indexOf(" ");
    const sha = at === -1 ? line : line.slice(0, at);
    const subject = at === -1 ? "" : line.slice(at + 1);
    const problems = checkSubject(subject);
    if (problems.length) found.push({ sha, subject, problems });
  }
  return found;
}

const nameStatus = (git(["diff", "--name-status", range]) ?? "").trim();
if (!nameStatus) {
  // AN EMPTY DIFF IS NOT AN EMPTY RANGE, and A5 still has to run.
  //
  // This early exit is what makes the same command correct in CI's shallow
  // `check` job, where `origin/master` IS the pushed commit — there the range is
  // empty too and there is genuinely nothing to say. But a diff can be empty
  // while the range is not: a change and its revert, a commit made with
  // `--allow-empty`, or a lane that committed a narration and then took the code
  // back out. Every one of those leaves a SUBJECT on master.
  //
  // And those are exactly the subjects this rule was drawn around. "The run
  // produced no change" is the situation that produces `fix: Agent session
  // exceeded 20 min and was stopped` — so returning early before the subject
  // check meant the one case A5 exists for was the one case it skipped, on a
  // repository where master ships on push. Nothing else here needs the diff, so
  // the rule runs and the rest does not.
  const findings = subjectFindings();
  if (findings.length) {
    console.error("");
    console.error(`✗ agent review — ${findings.length} blocking finding(s) [A5 commit-subject]`);
    console.error("");
    for (const f of findings) {
      console.error(`  • (commit ${f.sha.slice(0, 8)}) "${f.subject}"`);
      for (const p of f.problems) console.error(`      ${p}`);
    }
    console.error("");
    console.error(
      `The diff against ${BASE} is empty, so there is nothing else to review — but the subject reaches master ` +
        "either way, and a commit that changed nothing is the one a bisect can least afford to be lied to about. " +
        "Reword it (`git commit --amend`), or drop the commit: a run that produced no change does not owe the " +
        "log one."
    );
    printRemedy("review:agent:gate");
    process.exit(1);
  }
  console.log(`agent review: no changes against ${BASE} — nothing to review.`);
  process.exit(0);
}

/** [{ status: 'A'|'M'|'D'|'R…', path }] — rename shows as the destination. */
const changed = nameStatus.split(/\r?\n/).map((line) => {
  const parts = line.split("\t");
  return { status: parts[0][0], path: parts[parts.length - 1] };
});

const numstat = (git(["diff", "--numstat", range]) ?? "").trim();
let addedTotal = 0;
let removedTotal = 0;
for (const line of numstat ? numstat.split(/\r?\n/) : []) {
  const [a, d] = line.split("\t");
  if (a !== "-") addedTotal += Number(a) || 0;
  if (d !== "-") removedTotal += Number(d) || 0;
}

/** Added lines of the patch, per file, as `{ line, text }` — `line` numbered in
 *  the NEW file, read off each hunk header. The number is what turns a finding
 *  into an annotation GitHub can anchor to the exact line of the diff, instead of
 *  a sentence in a job summary nobody opened. */
const addedByFile = new Map();
{
  const patch = git(["diff", "--unified=0", range]) ?? "";
  let current = null;
  let next = 0;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).trim();
      current = p === "/dev/null" ? null : p.replace(/^b\//, "");
      if (current && !addedByFile.has(current)) addedByFile.set(current, []);
      next = 0;
    } else if (line.startsWith("@@")) {
      // `@@ -a,b +c,d @@` — with --unified=0 every added line in the hunk runs
      // consecutively from c, so the counter needs no context bookkeeping.
      const m = /\+(\d+)/.exec(line);
      next = m ? Number(m[1]) : 0;
    } else if (current && line.startsWith("+")) {
      addedByFile.get(current).push({ line: next || 1, text: line.slice(1) });
      if (next) next += 1;
    }
  }
}

/** The change's own words: every commit message in the range, plus the PR body
 *  when the workflow passes one in. `Ack:` may live in either. */
const messages = [
  git(["log", "--format=%B", `${BASE}..HEAD`], { allowFail: true }) ?? "",
  BODY_FILE && existsSync(BODY_FILE) ? readFileSync(BODY_FILE, "utf8") : "",
].join("\n");
const ackLines = messages
  .split(/\r?\n/)
  .filter((l) => /^\s*Ack:\s*\S/.test(l))
  .map((l) => l.trim());
const hasAck = ackLines.length > 0;

const countLines = (text) => (text === "" ? 0 : text.split(/\r?\n/).length);

const blocking = [];
const notes = [];

// --- A1 · component growth ratchet ------------------------------------------
for (const f of changed) {
  if (f.status === "D") continue;
  if (!/^src\/components\/.+\.(tsx|ts)$/.test(f.path)) continue;
  const abs = join(ROOT, f.path);
  if (!existsSync(abs)) continue;
  const now = countLines(readFileSync(abs, "utf8").replace(/\n$/, ""));
  if (now <= COMPONENT_LOC_LIMIT) continue;
  const before = git(["show", `${BASE}:${f.path}`], { allowFail: true });
  const wasLoc = before === null ? 0 : countLines(before.replace(/\n$/, ""));
  if (now > wasLoc) {
    blocking.push({
      rule: "A1 component-growth",
      path: f.path,
      line: 1,
      detail:
        `${now} lines (was ${wasLoc || "new"}), over the ${COMPONENT_LOC_LIMIT}-line ceiling and growing. ` +
        "Extract a sub-component or a data hook. A file already over the line may shrink or stay put — it may not get worse.",
    });
  }
}

// --- A2 · route segment config ----------------------------------------------
for (const [path, lines] of addedByFile) {
  if (!path.startsWith("src/app/")) continue;
  for (const { line, text } of lines) {
    const m = /export\s+const\s+(dynamic|runtime|revalidate|fetchCache|dynamicParams)\b/.exec(text);
    if (m) {
      blocking.push({
        rule: "A2 route-segment-config",
        path,
        line,
        detail:
          `adds \`export const ${m[1]}\`. This app runs with cacheComponents — express a dynamic read as a ` +
          "<Suspense> boundary around the read, not as a segment-level opt-out that un-caches the whole route.",
      });
    }
  }
}

// --- A3 · deleted tests ------------------------------------------------------
const deletedTests = changed
  .filter((f) => f.status === "D" && /^(test-unit|test-llm|tests)\/.+\.(mjs|ts|tsx)$/.test(f.path))
  .map((f) => f.path);
if (deletedTests.length && !hasAck) {
  blocking.push({
    rule: "A3 test-deletion",
    path: deletedTests.join(", "),
    detail:
      `${deletedTests.length} test file(s) deleted with no \`Ack:\` line in the commit message or PR body. ` +
      "A deleted test looks exactly like a test that never existed. Say what it was and why it should go.",
  });
}

// --- A4 · new runtime dependency --------------------------------------------
{
  const readDeps = (text) => {
    if (!text) return null;
    try {
      return Object.keys(JSON.parse(text).dependencies ?? {});
    } catch {
      return null;
    }
  };
  const now = readDeps(existsSync(join(ROOT, "package.json")) ? readFileSync(join(ROOT, "package.json"), "utf8") : "");
  const before = readDeps(git(["show", `${BASE}:package.json`], { allowFail: true }));
  if (now && before) {
    const added = now.filter((d) => !before.includes(d));
    if (added.length && !hasAck) {
      blocking.push({
        rule: "A4 new-dependency",
        path: "package.json",
        detail:
          `adds runtime dependenc(y/ies): ${added.join(", ")} — with no \`Ack:\` line. ` +
          "This repo holds live ad-platform credentials and keeps a deliberately small dependency list (ADR-0008). " +
          "One sentence on why a built-in will not do.",
      });
    }
  }
}

// --- A6 · a pin may be tightened silently, never loosened --------------------
//
// THE ASYMMETRY IS THE RULE. Every fence in this repository is a file the agents
// it constrains can edit, and .github/contract-ledger.json is the one that holds
// the numbers: the ceiling on each exception list, the floor under each threshold,
// the baseline each ratchet may not pass. `contract:ledger:check` compares the
// TREE against those pins on every build — and it cannot see the pin itself move,
// because after the move the tree agrees with it again. So the cheapest green in
// this repository was never editing a gate; it was editing the number the gate is
// measured against, in a diff whose whole visible change is one digit.
//
// Nothing went red for that. Rubric B3 asks the question — and B3 is the JUDGMENT
// half, which needs a model key to be written at all and never blocks, so on a
// keyless run the question is not asked. This is B3's mechanical half, and it is
// mechanical precisely because "did this number move, and in which direction?" is
// not a judgement.
//
// TIGHTENING IS FREE, and that asymmetry is deliberate: a ceiling that falls is
// debt being paid and a floor that rises is a gate getting sharper, and neither
// should cost anybody a sentence. What is refused is a pin that got LOOSER — or
// that disappeared, which is the same thing with nothing left to read — unless
// the diff also re-dates it. Re-dating is what turns "somebody edited a digit"
// into "somebody re-argued the number today", which is the record this rule
// exists to leave behind: `accepted.on` is what a reader six months from now uses
// to tell a considered exception from a shortcut that outlived its cause.
//
// WHAT IT CANNOT DO: require a human. On a repository that ships master by push,
// nothing an automated gate does can. What it does is make the loosening a NAMED,
// BLOCKING finding on the review that runs on every push, every pull request and
// inside check:ci — and leave a dated record next to the number, where CODEOWNERS
// puts the file in front of the maintainer on any path that goes through a PR.
{
  const LEDGER = ".github/contract-ledger.json";
  const parse = (text) => {
    if (!text) return null;
    try {
      const rules = JSON.parse(text).rules ?? [];
      return new Map(rules.filter((r) => r.id).map((r) => [r.id, r]));
    } catch {
      return null;
    }
  };
  const after = parse(existsSync(join(ROOT, LEDGER)) ? readFileSync(join(ROOT, LEDGER), "utf8") : "");
  const before = parse(git(["show", `${BASE}:${LEDGER}`], { allowFail: true }));

  if (after && before) {
    /** A pin's number and the argument attached to it, or null when it has none. */
    const pinOf = (rule, kind) => {
      const pin = rule?.[kind];
      if (!pin) return null;
      const value = kind === "ceiling" ? pin.max : pin.min;
      return typeof value === "number"
        ? { value, on: pin.accepted?.on ?? null, reason: String(pin.reason ?? "") }
        : null;
    };

    for (const [id, wasRule] of before) {
      const isRule = after.get(id);
      for (const kind of ["ceiling", "floor"]) {
        const was = pinOf(wasRule, kind);
        if (!was) continue;
        const is = isRule ? pinOf(isRule, kind) : null;

        // The pin is gone — the rule was deleted, or its number was. A fence whose
        // pin nobody can read is a fence with no pin.
        if (!is) {
          blocking.push({
            rule: "A6 pin-loosening",
            path: LEDGER,
            detail:
              `\`${id}\` had a ${kind} of ${was.value} and no longer has one. Removing a pin is the widest ` +
              "loosening available here: the number it refused can now be anything. Restore it, or say in the " +
              "same diff what replaced the rule it pinned.",
          });
          continue;
        }

        const looser = kind === "ceiling" ? is.value > was.value : is.value < was.value;
        if (!looser) continue; // tightening, or unchanged — free, and deliberately so

        const reDated = is.on && is.on !== was.on;
        const reArgued = is.reason && is.reason !== was.reason;
        if (reDated && reArgued) continue; // the number was re-argued today, with a date on it

        blocking.push({
          rule: "A6 pin-loosening",
          path: LEDGER,
          detail:
            `\`${id}\`: the ${kind} moved from ${was.value} to ${is.value}, which is the loosening direction, ` +
            `and ${!reDated ? "`accepted.on` did not move" : "the `reason` did not change"}. ` +
            "Tightening a pin costs nothing and needs no sentence; loosening one is a decision, and the two " +
            "things that make it readable later are the date it was taken and the argument it was taken on. " +
            "Move `accepted.on` to today and rewrite `reason` to say what changed — or fix the finding the " +
            "gate was reporting instead of raising the number it reports against.",
        });
      }
    }
  }
}

// --- A5 · a commit subject describes the change, not the session -------------
//
// The log is the artifact a future agent bisects, and ~97% of the subjects in it
// were written by an agent finishing a run. The conventional SHAPE is already at
// 100%, so shape is not the rule worth having; what has actually landed is
// "fix: Done. Here's what I found and changed" and "fix: Agent session exceeded
// 20 min and was stopped" — well-formed, and useless to anyone deciding six
// months later whether that commit is the one that broke something.
//
// This runs here rather than in a commit-msg hook because a hook only binds the
// checkout that installed it, and this repository's commits arrive from several
// (agents, worktrees, CI). Rules: scripts/commit-subject.mjs. Merge, revert and
// fixup subjects are exempt — git writes those.
// One definition of the check, used here and by the empty-diff branch above —
// because the two used to disagree about whether the rule applied at all.
for (const { sha, subject, problems } of subjectFindings()) {
  blocking.push({
    rule: "A5 commit-subject",
    path: `(commit ${sha.slice(0, 8)})`,
    detail: `"${subject}" — ${problems.join(" ")} Reword it before pushing (\`git commit --amend\`).`,
  });
}

// --- notes (reported, never blocking) ---------------------------------------

// Attribution — reported, never blocking (ADR-0007: it does not pass over this
// repository's history, so it prints). A5 above asks what a subject SAYS; this asks
// whether the log can answer "how much of this was written unattended?" in a form
// `git shortlog --group=trailer:co-authored-by` can count. Five of the last thirty
// commits could. The fix is a hook, not a rewrite: scripts/commit-attribution.mjs.
{
  const log = git(["log", "--no-merges", "--format=%H%x1f%s%x1f%B%x1e", `${BASE}..HEAD`], { allowFail: true }) ?? "";
  const commits = log
    .split("\x1e")
    .map((r) => r.replace(/^\s+/, ""))
    .filter((r) => r.includes("\x1f"))
    .map((r) => r.split("\x1f"));

  const unattributed = commits
    .filter(([, , body = ""]) => !hasAttribution(body))
    .map(([sha, subject]) => `${sha.slice(0, 8)} ${subject}`);
  if (unattributed.length) {
    notes.push({
      title: `Commits with no machine-readable authorship trailer (${unattributed.length})`,
      body: unattributed
        .slice(0, 10)
        .concat([
          "→ `Co-Authored-By: <who> <email>` below a blank line makes the loop's footprint countable.",
          "→ `npm install` wires the hook that adds it; `npm run hooks:check` says whether yours is wired.",
        ]),
    });
  }

  // And WHICH LANE — the question "an assistant wrote it" does not answer, on a
  // repository where nearly every commit has that property. A commit that says an
  // agent wrote it and does not say WHICH HARNESS is the one that costs an hour six
  // weeks later, when a regression is traced back and the only lead is "an agent".
  // Scoped to commits that already claim agent authorship, so a person's commit is
  // never asked to name a harness it did not have.
  const noHarness = commits
    .filter(([, , body = ""]) => hasAttribution(body) && !harnessOf(body))
    .map(([sha, subject]) => `${sha.slice(0, 8)} ${subject}`);
  if (noHarness.length) {
    notes.push({
      title: `Agent commits that do not name the lane that wrote them (${noHarness.length})`,
      body: noHarness
        .slice(0, 10)
        .concat([
          "→ `Agent-Harness: <loop>` (plus Agent-Model / Agent-Spec / Agent-Session / Agent-Lane when the",
          "   environment states them) is what `git log --format='%(trailers:key=Agent-Harness,valueonly)'` counts.",
          "→ The same hook writes them; a lane that commits for itself writes them itself —",
          "   scripts/issue-dispatch.mjs is the worked example. Rules: scripts/commit-attribution.mjs.",
        ]),
    });
  }
}

const lawTouched = changed.filter((f) => LAW_PATHS.some((p) => (p.endsWith("/") ? f.path.startsWith(p) : f.path === p)));
if (lawTouched.length) {
  notes.push({
    title: "Law files touched — read these first",
    body: lawTouched.map((f) => `${f.status} ${f.path}`),
  });
}

{
  const mapPath = join(ROOT, "context-map.json");
  if (existsSync(mapPath)) {
    const mapText = readFileSync(mapPath, "utf8");
    const unmapped = changed
      .filter((f) => f.status === "A" && f.path.startsWith("src/") && !mapText.includes(`"${f.path}"`))
      .map((f) => f.path);
    if (unmapped.length) {
      notes.push({
        title: `New source file(s) no context maps (${unmapped.length})`,
        body: unmapped.concat(["→ re-run the context scan, or add them to context-map.json's file_paths"]),
      });
    }
  }
}

{
  const todos = [];
  for (const [path, lines] of addedByFile) {
    for (const { line, text } of lines) {
      if (/\b(TODO|FIXME|XXX|HACK)\b/.test(text)) todos.push(`${path}:${line}: ${text.trim().slice(0, 120)}`);
    }
  }
  if (todos.length) notes.push({ title: `Added TODO/FIXME markers (${todos.length})`, body: todos.slice(0, 15) });
}

{
  const gateSoftening = [];
  for (const [path, lines] of addedByFile) {
    for (const { line, text } of lines) {
      if (/eslint-disable|@ts-(expect-error|ignore)|\.skip\(|continue-on-error/.test(text)) {
        gateSoftening.push(`${path}:${line}: ${text.trim().slice(0, 120)}`);
      }
    }
  }
  if (gateSoftening.length) {
    notes.push({
      title: `Gate softening in the diff (${gateSoftening.length}) — fixed, or absorbed?`,
      body: gateSoftening.slice(0, 15),
    });
  }
}

if (addedTotal + removedTotal > LARGE_DIFF_LINES) {
  notes.push({
    title: `Large change: +${addedTotal} / −${removedTotal} across ${changed.length} files`,
    body: [
      "Past ~800 changed lines a weekly human triage stops being a review and starts being a skim.",
      "If this is several changes, it is cheaper to land them separately.",
    ],
  });
}

// --- report -----------------------------------------------------------------

const md = [];
md.push(`## Agent diff review — \`${BASE}...HEAD\``);
md.push("");
md.push(`${changed.length} file(s), +${addedTotal} / −${removedTotal}. Rubric: \`.github/agent-review-rubric.md\`.`);
if (ackLines.length) {
  md.push("");
  md.push(`Acknowledged: ${ackLines.map((l) => `\`${l}\``).join(" · ")}`);
}
md.push("");

if (blocking.length) {
  md.push(`### ✗ ${blocking.length} blocking finding(s)`);
  md.push("");
  for (const b of blocking) {
    md.push(`- **${b.rule}** — \`${b.path}\``);
    md.push(`  ${b.detail}`);
  }
  md.push("");
} else {
  md.push("### ✓ Part A (mechanical) — clean");
  md.push("");
}

for (const n of notes) {
  md.push(`### ${n.title}`);
  md.push("");
  for (const line of n.body) md.push(`- ${line}`);
  md.push("");
}

const text = md.join("\n");

// --- the trail on the change itself -----------------------------------------
//
// Annotations, not just a summary. A job summary belongs to the run; an
// annotation belongs to the COMMIT — it renders inline on the diff and on a PR's
// Files view, so a finding lands where it can be answered, and it is still there
// weeks later when the weekly triage asks what the review said about the change
// that shipped on the 3rd. `--annotate` is opt-in so a local run and the pre-push
// gate stay quiet; agent-review.yml passes it.
if (ANNOTATE) {
  const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const escProp = (s) => esc(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
  for (const b of blocking) {
    const props = [`title=${escProp(`Agent review · ${b.rule}`)}`];
    // A deleted test has no file to hang an annotation on, and A3 reports the
    // whole list in one finding — those become repository-level annotations.
    if (b.path && !b.path.includes(",") && existsSync(join(ROOT, b.path))) {
      props.push(`file=${escProp(b.path)}`);
      if (b.line) props.push(`line=${b.line}`);
    }
    console.log(`::error ${props.join(",")}::${esc(`${b.path} — ${b.detail}`)}`);
  }
  for (const n of notes) {
    console.log(`::notice title=${escProp("Agent review · note")}::${esc(`${n.title} — ${n.body.slice(0, 3).join(" · ")}`)}`);
  }
}

console.log(text);

if (OUT_FILE) writeFileSync(OUT_FILE, text);
if (SUMMARY_FILE) {
  try {
    appendFileSync(SUMMARY_FILE, text + "\n");
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

// One machine-readable record per reviewed change, so the history of what the
// review caught can be counted rather than re-derived from prose.
if (JSON_FILE) {
  const head = (git(["rev-parse", "HEAD"], { allowFail: true }) ?? "").trim();
  const record = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    base: BASE,
    head,
    files: changed.length,
    added: addedTotal,
    removed: removedTotal,
    ack: ackLines,
    verdict: blocking.length ? "blocked" : "clean",
    blocking: blocking.map((b) => ({ rule: b.rule, path: b.path, line: b.line ?? null, detail: b.detail })),
    notes: notes.map((n) => ({ title: n.title, items: n.body.length })),
  };
  try {
    writeFileSync(JSON_FILE, JSON.stringify(record, null, 2) + "\n");
  } catch (err) {
    console.error(`(could not write ${JSON_FILE}: ${err.message})`);
  }
}

if (blocking.length) {
  printRemedy("review:agent:gate");
  process.exit(1);
}
process.exit(0);
