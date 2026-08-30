#!/usr/bin/env node
/** Merge gate — the enumerated required checks, kept honest (zero-dependency).
 *
 *  The problem this solves is not "does CI run". It runs. The problem is that
 *  which of those jobs is allowed to stop a change lived in one person's GitHub
 *  settings page and nowhere in the repository, so an agent reading this tree
 *  could not tell a gate from a comment — and neither could a reviewer.
 *
 *  .github/required-checks.json is now that answer, and this script is what
 *  stops it drifting into paperwork. For every enumerated check it verifies:
 *
 *    1. the workflow file exists;
 *    2. it is triggered by `pull_request`, so the check appears on a PR at all;
 *    3. the job id exists;
 *    4. the job's display `name:` still equals the `check` string — that string
 *       is what GitHub matches branch protection against, so a rename that is
 *       not mirrored here silently un-requires the check;
 *    5. nothing inside the job carries `continue-on-error: true` except the
 *       steps listed in its `softenedSteps` — a required job whose failing step
 *       is allowed to pass is a gate that cannot fail (ADR-0007).
 *
 *  Runs blocking as part of `npm run check:ci`. That matters here more than the
 *  CI run does: .husky/pre-push runs `check:ci` before any push that updates
 *  master, and Vercel ships master on push — so softening a required check
 *  blocks the release act itself, on the machine of whoever did the softening.
 *
 *  What it deliberately does NOT do: reach for the GitHub API to compare against
 *  the live branch-protection settings. That needs a token, so it could not run
 *  in the pre-push hook or in a fork's CI, and a gate that only works for the
 *  maintainer is the shape of gate this file exists to replace. The settings
 *  page is the copy; this file is the source, and CONTRIBUTING.md says so.
 *
 *  Usage:
 *    node scripts/merge-gate.mjs
 *    node scripts/merge-gate.mjs --summary FILE
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WF_DIR = join(ROOT, ".github", "workflows");
const SPEC_PATH = join(ROOT, ".github", "required-checks.json");

const argv = process.argv.slice(2);
const summaryIdx = argv.indexOf("--summary");
const SUMMARY_FILE = summaryIdx !== -1 ? argv[summaryIdx + 1] : null;

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};
const failures = [];

/** Strip one layer of matching quotes from a scalar. */
function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

const indentOf = (l) => l.length - l.replace(/^\s*/, "").length;
const isBlank = (l) => l.trim() === "" || l.trim().startsWith("#");

/** Lines of a top-level block (`on:`, `jobs:`), excluding the key line itself. */
function topBlock(lines, key) {
  const start = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!isBlank(l) && indentOf(l) === 0) break;
    body.push({ line: i + 1, text: l });
  }
  return { keyLine: lines[start], body };
}

function triggersOnPullRequest(lines) {
  const block = topBlock(lines, "on");
  if (!block) return false;
  // `on: [push, pull_request]` — the whole trigger list on the key line.
  const inline = block.keyLine.replace(/^on\s*:/, "").trim();
  if (inline && inline !== "|" && inline !== ">") {
    return /\bpull_request\b(?!_target)/.test(inline);
  }
  return block.body.some((b) => /^\s+pull_request\s*:/.test(b.text));
}

/** [{ id, name, line, steps: [{ label, line }], softened: [{ owner, line }] }] */
function parseJobs(lines) {
  const block = topBlock(lines, "jobs");
  if (!block) return [];

  const jobs = [];
  let current = null;
  let inSteps = false;
  let step = null;

  const closeStep = () => {
    if (step && current) current.steps.push(step);
    step = null;
  };

  for (const { line, text } of block.body) {
    if (isBlank(text)) continue;
    const indent = indentOf(text);

    // A job id sits at indent 2.
    const jobKey = /^ {2}([A-Za-z0-9_-]+)\s*:\s*(#.*)?$/.exec(text);
    if (indent === 2 && jobKey) {
      closeStep();
      current = { id: jobKey[1], name: null, line, steps: [], softened: [] };
      jobs.push(current);
      inSteps = false;
      continue;
    }
    if (!current) continue;

    if (indent === 4) {
      closeStep();
      inSteps = /^ {4}steps\s*:/.test(text);
      const nameKey = /^ {4}name\s*:\s*(.+)$/.exec(text);
      if (nameKey && current.name === null) current.name = unquote(nameKey[1]);
      if (/^ {4}continue-on-error\s*:\s*true\s*$/.test(text)) {
        current.softened.push({ owner: null, line }); // job level — never allowed
      }
      continue;
    }

    if (!inSteps) continue;

    // A step item: `      - <first key>`.
    const item = /^ {6}-\s+(.*)$/.exec(text);
    if (item) {
      closeStep();
      step = { label: null, line };
      const firstKey = /^(name|uses|run)\s*:\s*(.*)$/.exec(item[1]);
      if (firstKey && firstKey[1] === "name") step.label = unquote(firstKey[2]);
      else if (firstKey) step.label = `${firstKey[1]}: ${firstKey[2].trim()}`.slice(0, 60);
      if (/^continue-on-error\s*:\s*true\s*$/.test(item[1])) current.softened.push({ step, line });
      continue;
    }

    if (!step) continue;
    const nameKey = /^ {8}name\s*:\s*(.+)$/.exec(text);
    if (nameKey) step.label = unquote(nameKey[1]);
    if (/^ {8}continue-on-error\s*:\s*true\s*$/.test(text)) current.softened.push({ step, line });
  }
  closeStep();
  return jobs;
}

// --- read the enumeration ----------------------------------------------------

if (!existsSync(SPEC_PATH)) {
  console.error(`✗ merge gate: ${SPEC_PATH} does not exist — nothing declares which checks may stop a merge.`);
  process.exit(1);
}
let spec;
try {
  spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
} catch (err) {
  console.error(`✗ merge gate: .github/required-checks.json is not valid JSON — ${err.message}`);
  process.exit(1);
}
const required = Array.isArray(spec.required) ? spec.required : [];
if (!required.length) {
  console.error("✗ merge gate: .github/required-checks.json enumerates no required checks.");
  process.exit(1);
}

const parsed = new Map(); // workflow file → { pr, jobs }
function workflow(file) {
  if (parsed.has(file)) return parsed.get(file);
  const path = join(WF_DIR, file);
  if (!existsSync(path)) {
    parsed.set(file, null);
    return null;
  }
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const value = { pr: triggersOnPullRequest(lines), jobs: parseJobs(lines) };
  parsed.set(file, value);
  return value;
}

// --- verify ------------------------------------------------------------------

say(`Merge gate — ${required.length} required check(s) declared in .github/required-checks.json`);
say("");

for (const entry of required) {
  const { check, workflow: file, job: jobId } = entry;
  const softenedSteps = new Set(Array.isArray(entry.softenedSteps) ? entry.softenedSteps : []);
  const label = `${file}:${jobId}`;

  const wf = workflow(file);
  if (!wf) {
    failures.push(`${label}: .github/workflows/${file} does not exist, but a required check points at it.`);
    continue;
  }
  if (!wf.pr) {
    failures.push(`${label}: the workflow is not triggered by \`pull_request\`, so "${check}" never appears on a PR.`);
  }

  const job = wf.jobs.find((j) => j.id === jobId);
  if (!job) {
    failures.push(
      `${label}: no such job. Jobs in that workflow: ${wf.jobs.map((j) => j.id).join(", ") || "(none parsed)"}.`
    );
    continue;
  }

  const displayed = job.name ?? job.id;
  if (displayed !== check) {
    failures.push(
      `${label}: the job is named "${displayed}" but branch protection is told to require "${check}". ` +
        "GitHub matches the check by that exact string — a rename un-requires it silently. Update both together."
    );
  }

  for (const s of job.softened) {
    if (!s.step) {
      failures.push(`${label}:${s.line}: \`continue-on-error: true\` at JOB level — a required check that cannot fail.`);
      continue;
    }
    const name = s.step.label ?? `(unnamed step at line ${s.step.line})`;
    if (!softenedSteps.has(name)) {
      failures.push(
        `${label}:${s.line}: step "${name}" is \`continue-on-error: true\` inside a required check, and is not ` +
          "listed in its `softenedSteps`. Either it is a reporting-rung step — say so there, with the reason — " +
          "or a gate was just turned off."
      );
    }
  }

  const ok = !failures.some((f) => f.startsWith(`${label}:`));
  say(`  ${ok ? "✓" : "✗"} "${check}"  ←  ${file} · job \`${jobId}\`${softenedSteps.size ? `  (${softenedSteps.size} reporting step allowed)` : ""}`);
}

// --- note: jobs that could block but are not enumerated ----------------------

const enumerated = new Set(required.map((r) => `${r.workflow}:${r.job}`));
const unlisted = [];
for (const file of existsSync(WF_DIR) ? readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f)) : []) {
  const wf = workflow(file);
  if (!wf?.pr) continue;
  for (const job of wf.jobs) {
    if (enumerated.has(`${file}:${job.id}`)) continue;
    unlisted.push(`${file} · ${job.id} — "${job.name ?? job.id}"`);
  }
}
if (unlisted.length) {
  say("");
  say(`  • ${unlisted.length} job(s) run on a PR without being required (reporting rung, or comment-only):`);
  for (const u of unlisted) say(`      ${u}`);
}

// --- report ------------------------------------------------------------------

if (failures.length) {
  say("");
  say(`✗ ${failures.length} problem(s):`);
  for (const f of failures) say(`  • ${f}`);
  say("");
  say("  A required check is the difference between a review and advice. If one of these");
  say("  genuinely should stop blocking, move it off the list in .github/required-checks.json");
  say("  with the reason — do not soften it in place and leave the list claiming otherwise.");
} else {
  say("");
  say("✓ merge gate: every required check exists, runs on pull requests, keeps its name, and can still fail.");
}

if (SUMMARY_FILE) {
  try {
    appendFileSync(SUMMARY_FILE, `### Merge gate\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`);
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

process.exit(failures.length ? 1 : 0);
