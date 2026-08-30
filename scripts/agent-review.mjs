#!/usr/bin/env node
/** Mechanical half of the agent diff review — Part A of
 *  .github/agent-review-rubric.md (zero-dependency).
 *
 *  Runs on every push and pull request (.github/workflows/agent-review.yml) and
 *  locally as `npm run review:agent -- --base origin/master`. Exit non-zero fails
 *  the job; the report is written to the job summary either way.
 *
 *  It also runs as the LAST stage of `npm run check:ci`, via
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
 *  it is CI. These four rules are the invariants where "a reviewer will probably
 *  notice" is not good enough — each one is a way a green build can be bought
 *  rather than earned. The judgment half of the rubric is a model's job and only
 *  comments; see scripts/agent-review-llm.mjs.
 *
 *  Usage:
 *    node scripts/agent-review.mjs [--base <ref>] [--body-file <f>] [--summary <f>]
 *                                  [--out <f>]
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const SUMMARY_FILE = arg("--summary");
const OUT_FILE = arg("--out");
const BODY_FILE = arg("--body-file");

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
const nameStatus = (git(["diff", "--name-status", range]) ?? "").trim();
if (!nameStatus) {
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

/** Added lines of the patch, per file. */
const addedByFile = new Map();
{
  const patch = git(["diff", "--unified=0", range]) ?? "";
  let current = null;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).trim();
      current = p === "/dev/null" ? null : p.replace(/^b\//, "");
      if (current && !addedByFile.has(current)) addedByFile.set(current, []);
    } else if (current && line.startsWith("+") && !line.startsWith("+++")) {
      addedByFile.get(current).push(line.slice(1));
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
      detail:
        `${now} lines (was ${wasLoc || "new"}), over the ${COMPONENT_LOC_LIMIT}-line ceiling and growing. ` +
        "Extract a sub-component or a data hook. A file already over the line may shrink or stay put — it may not get worse.",
    });
  }
}

// --- A2 · route segment config ----------------------------------------------
for (const [path, lines] of addedByFile) {
  if (!path.startsWith("src/app/")) continue;
  for (const line of lines) {
    const m = /export\s+const\s+(dynamic|runtime|revalidate|fetchCache|dynamicParams)\b/.exec(line);
    if (m) {
      blocking.push({
        rule: "A2 route-segment-config",
        path,
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

// --- notes (reported, never blocking) ---------------------------------------

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
    for (const line of lines) {
      if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line)) todos.push(`${path}: ${line.trim().slice(0, 120)}`);
    }
  }
  if (todos.length) notes.push({ title: `Added TODO/FIXME markers (${todos.length})`, body: todos.slice(0, 15) });
}

{
  const gateSoftening = [];
  for (const [path, lines] of addedByFile) {
    for (const line of lines) {
      if (/eslint-disable|@ts-(expect-error|ignore)|\.skip\(|continue-on-error/.test(line)) {
        gateSoftening.push(`${path}: ${line.trim().slice(0, 120)}`);
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
console.log(text);

if (OUT_FILE) writeFileSync(OUT_FILE, text);
if (SUMMARY_FILE) {
  try {
    appendFileSync(SUMMARY_FILE, text + "\n");
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

process.exit(blocking.length ? 1 : 0);
