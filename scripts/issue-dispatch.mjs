#!/usr/bin/env node
/** Turn a labelled issue into a DRAFT change (zero-dependency; global fetch).
 *
 *  WHY THIS EXISTS. Everything after a change here is automated — the rubric
 *  reviews every diff, thirteen gates refuse it, the log is audited, the harness
 *  announces its own degradation. The FRONT of the loop is not: a work item
 *  becomes a change only when the maintainer opens an editor and describes it to
 *  an agent again. So the weekly pass starts from a paragraph that already exists
 *  in an issue, and re-derives from it what the issue already said.
 *
 *  This closes that end. A maintainer puts the `agent:draft` label on an issue;
 *  .github/workflows/issue-dispatch.yml asks a model for a change, writes the
 *  files, commits and opens a DRAFT pull request. Nothing here decides anything:
 *  the draft lands in front of the same gates as any other change — Part A of the
 *  rubric, `npm run check:ci`, the required checks in .github/required-checks.json
 *  — and a draft that is wrong is refused by them exactly as a human's would be.
 *  That is the whole answer to "what is the downside": a bad proposal costs one
 *  red build and one closed pull request, and it costs them BEFORE anybody spends
 *  an afternoon on the description.
 *
 *  WHO CAN FIRE IT. `issues: [labeled]` — and a label can only be applied by
 *  somebody with triage rights on this repository. That is what makes it different
 *  from `issue_comment`, which rule P2 of scripts/actions-pin.mjs forbids outright:
 *  the EVENT is a maintainer's decision even though the issue TEXT is not.
 *
 *  THE TEXT IS STILL UNTRUSTED, because anyone with a GitHub account can open the
 *  issue whose body a maintainer then labels. So it travels the same way a pull
 *  request body does in the review (rules P5/P7/P9): read out of the payload file
 *  by scripts/workflow-event.mjs, handed to this script as a FILE, and put in
 *  front of the model inside a per-run nonce fence (scripts/lib/review-prompt.mjs)
 *  whose rules say an instruction found inside it is a finding rather than a
 *  command.
 *
 *  AND THE PROPOSAL IS FENCED TOO — this is the half that a prompt fence cannot
 *  do, because a fence keeps the model from being INSTRUCTED and says nothing
 *  about what it may WRITE. A proposal may only create or replace files under
 *  ALLOWED_ROOTS. It may not touch a workflow, a gate script, the ADRs, the agent
 *  instruction surface, `package.json` or anything else that decides whether a
 *  change is allowed to land. A model-authored change that could edit the rules
 *  that judge it is not a draft, it is a bypass.
 *
 *  WHAT THE DISPATCH LEAVES BEHIND, so "which pull requests began as an agent
 *  proposal?" is answerable later without remembering:
 *
 *    • the branch is `agent/issue-<n>` — greppable in `git branch -r`;
 *    • the commit carries `Generated-by: issue-dispatch (<model>)`, which is one
 *      of the three trailers scripts/commit-attribution.mjs counts, so these
 *      commits are attributed in `npm run commit:check -- --range …` like any
 *      other agent-written commit, and `Dispatched-from: #<n>` next to it;
 *    • the pull request is a DRAFT, body-linked to the issue;
 *    • `proposal.json` is kept as a 90-day artifact, so what the model was asked
 *      and what it answered outlive the run.
 *
 *  AND IT CAN BE TURNED OFF, which is the half a fence cannot supply. Every control
 *  around this lane judges a change; none of them could stop the lane RUNNING, and
 *  the whole design rests on a maintainer reading the trail weekly. `--gate` now
 *  reads `.github/autonomy-budget.json` first (scripts/autonomy.mjs): while
 *  `pause.paused` is set it emits `dispatch=no` with the reason, before the event is
 *  parsed and before any model is called, so a labelled issue QUEUES during an
 *  absence instead of becoming a branch. It fails CLOSED — an unreadable budget
 *  pauses the lane. `npm run autonomy` prints the current state.
 *
 *  THE COMMIT SUBJECT IS THE MODEL'S AND IS CHECKED LIKE ANYONE'S. It goes through
 *  scripts/commit-subject.mjs before it is used, and falls back to a subject this
 *  script writes when it fails. A lane that composes a subject from a model's first
 *  line is exactly the lane AGENTS.md § "If a lane commits for you" is about.
 *
 *  Usage:
 *    node scripts/issue-dispatch.mjs --gate --label agent:draft --out "$GITHUB_OUTPUT"
 *    ANTHROPIC_API_KEY=… node scripts/issue-dispatch.mjs --propose \
 *        --number 42 --title-file title.txt --body-file body.txt --out proposal.json
 *    node scripts/issue-dispatch.mjs --apply --proposal proposal.json \
 *        --number 42 --pr-body pr-body.md --subject-out subject.txt
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDispatchPrompt, newNonce, UNTRUSTED_RULES } from "./lib/review-prompt.mjs";
import { checkSubject } from "./commit-subject.mjs";
import { BUDGET_REL, pauseState } from "./autonomy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where a proposal may write. Everything that decides whether a change lands is
 *  deliberately outside this list — .github/, scripts/, .ai/, package.json, the
 *  ADRs. See the header: a proposal that can edit its own gates is not a draft. */
export const ALLOWED_ROOTS = ["src/", "test-unit/", "docs/"];
/** Paths inside an allowed root that are still off limits, because they are law
 *  rather than content. `docs/adr/` decides the seams; a proposal may cite an ADR
 *  and may not write one. */
export const DENIED_PREFIXES = ["docs/adr/", "docs/parity.json"];

const MODEL = process.env.ISSUE_DISPATCH_MODEL || "claude-sonnet-5";
const MAX_READ_FILES = 12;
const MAX_FILE_CHARS = 40_000;
const MAX_LISTED_PATHS = 2_500;
const MAX_PROPOSED_FILES = 12;

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
};
const readMaybe = (file) => (file && existsSync(file) ? readFileSync(file, "utf8") : "");

function die(message) {
  console.error(`✗ issue-dispatch: ${message}`);
  process.exit(1);
}

// --- path safety -------------------------------------------------------------

/** The repo-relative path a proposal may write, or null with the reason it may
 *  not. Everything is decided on the RESOLVED path, so `docs/../.github/x` and an
 *  absolute path are refused by the same rule that refuses `.github/x`. */
export function safePath(candidate) {
  const raw = String(candidate ?? "").trim();
  if (!raw) return { ok: false, why: "empty path" };
  if (raw.includes("\0")) return { ok: false, why: "path contains a NUL byte" };
  const abs = resolve(ROOT, raw);
  const rel = relative(ROOT, abs).split(sep).join("/");
  if (!rel || rel.startsWith("..")) return { ok: false, why: `${raw} resolves outside the repository` };
  if (rel.startsWith(".git/")) return { ok: false, why: `${rel} is inside the git directory` };
  if (!ALLOWED_ROOTS.some((r) => rel.startsWith(r))) {
    return { ok: false, why: `${rel} is outside ${ALLOWED_ROOTS.join(", ")} — a proposal may not edit the rules that judge it` };
  }
  if (DENIED_PREFIXES.some((p) => rel.startsWith(p))) {
    return { ok: false, why: `${rel} is a decision record, not content a draft may write` };
  }
  return { ok: true, path: rel, abs };
}

/** Every tracked-looking path under the allowed roots, so the model can name a
 *  file that exists rather than invent one. Paths only — no contents; the second
 *  call asks for the handful it actually wants to read. */
function listPaths() {
  const out = [];
  const walk = (dir) => {
    if (out.length >= MAX_LISTED_PATHS) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_LISTED_PATHS) return;
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(relative(ROOT, full).split(sep).join("/"));
    }
  };
  for (const root of ALLOWED_ROOTS) {
    const dir = join(ROOT, root);
    if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir);
  }
  return out.sort();
}

// --- the model ---------------------------------------------------------------

/** One JSON answer from the model, or null. Never throws and never fails a build:
 *  a dispatch that cannot reach a provider leaves no draft, which is the same
 *  outcome as nobody having labelled the issue. */
async function ask(system, prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16_000,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.log(`issue-dispatch: API ${res.status} — ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const body = await res.json();
    return (body.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  } catch (err) {
    console.log(`issue-dispatch: call failed — ${err.message}`);
    return null;
  }
}

/** The first JSON object in a model's answer. Models wrap JSON in prose and in
 *  code fences no matter what the prompt says; refusing that is a worse failure
 *  mode than tolerating it. */
export function extractJson(text) {
  const s = String(text ?? "");
  const start = s.indexOf("{");
  if (start === -1) return null;
  for (let end = s.lastIndexOf("}"); end > start; end = s.lastIndexOf("}", end - 1)) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {
      /* try the next closing brace to the left */
    }
  }
  return null;
}

/** Exported so the injection drill rehearses the system message this script really
 *  sends rather than a paraphrase of it (scripts/injection-drill.mjs, surface
 *  `issue`). The fence in the user message is containment; these rules are the only
 *  thing that tells the model what the fence MEANS. */
export const PROPOSAL_SYSTEM = [
  "You are proposing a DRAFT change to Adamant, an adtech marketing-automation product (Next.js App",
  "Router, React 19, TypeScript). Your output becomes a draft pull request that a maintainer reads and",
  "that this repository's gates then judge — typecheck, lint, the seam fences, the rubric, the unit",
  "suite. Nothing you write lands without passing them, and nothing you write is merged by a machine.",
  "",
  "So: propose the SMALLEST change that does the thing the issue asks for, and propose nothing else.",
  "A draft that does half the job and compiles is worth more than one that does all of it and does not.",
  "",
  "Hard constraints:",
  `- You may only create or replace files under: ${ALLOWED_ROOTS.join(", ")}. Anything else is discarded.`,
  "- i18n is colocated: a component owns `const T = { cs: {...}, en: {...} }` and both columns must carry",
  "  every key, or typecheck fails. Never add a key to one locale only.",
  "- Every LLM text call goes through generateStructured() in src/lib/llm/index.ts. Never construct a",
  "  provider client anywhere else.",
  "- Routes and components reach data through a store seam in src/lib/, never firebase-admin or",
  "  node:sqlite directly.",
  "- Never write `export const dynamic | runtime | revalidate | fetchCache | dynamicParams` under src/app/.",
  "- Prefer components under 200 lines. Do not reformat code you are not otherwise changing.",
  "",
  "You reply with JSON and nothing else. No prose outside the object, no code fence.",
  "",
  ...UNTRUSTED_RULES,
].join("\n");

const SYSTEM = PROPOSAL_SYSTEM;

async function propose() {
  const number = arg("--number");
  const out = arg("--out") || "proposal.json";
  const title = readMaybe(arg("--title-file")).trim();
  const body = readMaybe(arg("--body-file")).trim();
  if (!title && !body) die("the issue has neither a title nor a body — nothing to propose from.");

  const nonce = newNonce();
  const issue = `# ${title}\n\n${body}`;
  const guide = readMaybe(join(ROOT, "AGENTS.md")).slice(0, 24_000);
  const paths = listPaths();

  // Pass 1 — orient. The model names the files it needs to see. Asking for the
  // edit set in one shot means proposing edits to files it has never read, which
  // produces a draft that is confident and wrong.
  const first = await ask(
    SYSTEM,
    buildDispatchPrompt({
      guide,
      inventory: paths.join("\n"),
      issue,
      nonce,
      ask: [
        `Reply with {"read": ["<path>", …], "plan": "<one paragraph>"} naming at most ${MAX_READ_FILES} existing`,
        "files from the list above whose contents you need in order to write the change. If the issue is not",
        'actionable as a code change, reply {"read": [], "plan": "", "decline": "<one sentence why>"}.',
      ].join("\n"),
    })
  );
  const orient = extractJson(first) ?? { read: [], plan: "" };
  if (orient.decline) {
    writeFileSync(out, JSON.stringify({ schema: 1, issue: number, model: MODEL, declined: String(orient.decline) }, null, 2) + "\n");
    console.log(`issue-dispatch: the model declined — ${orient.decline}`);
    return 0;
  }

  const wanted = (Array.isArray(orient.read) ? orient.read : []).slice(0, MAX_READ_FILES);
  const context = [];
  for (const p of wanted) {
    const ok = safePath(p);
    if (!ok.ok || !existsSync(ok.abs)) continue;
    context.push(`----- ${ok.path} -----\n${readFileSync(ok.abs, "utf8").slice(0, MAX_FILE_CHARS)}`);
  }

  // Pass 2 — propose. Whole file contents rather than a patch: a unified diff that
  // does not apply is a dispatch that produced nothing, and the failure is silent.
  const second = await ask(
    SYSTEM,
    buildDispatchPrompt({
      guide,
      context: context.join("\n\n") || "(none)",
      issue,
      nonce,
      ask: [
        "Reply with JSON:",
        "{",
        '  "subject": "<conventional-commit subject: type(scope): what changed — one clause, under 72 chars,',
        '               naming the artefact and what happened to it. Never the session, never a priority>",',
        '  "summary": "<what this draft does and what a reviewer should check first, in markdown>",',
        '  "files": [{"path": "<repo-relative>", "contents": "<the WHOLE file after your change>"}]',
        "}",
        "",
        `At most ${MAX_PROPOSED_FILES} files. Every path must be under ${ALLOWED_ROOTS.join(", ")}. Include the`,
        "complete file, not a fragment and not a diff — what you write replaces the file byte for byte.",
      ].join("\n"),
    })
  );
  const proposal = extractJson(second);
  if (!proposal || !Array.isArray(proposal.files) || !proposal.files.length) {
    console.log("issue-dispatch: no usable proposal came back — no draft will be opened.");
    writeFileSync(out, JSON.stringify({ schema: 1, issue: number, model: MODEL, files: [] }, null, 2) + "\n");
    return 0;
  }

  writeFileSync(
    out,
    JSON.stringify(
      {
        schema: 1,
        issue: number,
        model: MODEL,
        at: new Date().toISOString(),
        plan: String(orient.plan ?? ""),
        read: wanted,
        subject: String(proposal.subject ?? ""),
        summary: String(proposal.summary ?? ""),
        files: proposal.files
          .slice(0, MAX_PROPOSED_FILES)
          .map((f) => ({ path: String(f?.path ?? ""), contents: String(f?.contents ?? "") })),
      },
      null,
      2
    ) + "\n"
  );
  console.log(`issue-dispatch: proposed ${proposal.files.length} file(s) for issue #${number}.`);
  return 0;
}

// --- --apply: write the files and commit -------------------------------------

function git(args) {
  const res = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (res.status !== 0) die(`git ${args[0]} failed — ${(res.stderr || res.stdout || "").trim().slice(0, 300)}`);
  return res.stdout ?? "";
}

function apply() {
  const number = arg("--number") ?? "";
  const file = arg("--proposal") || "proposal.json";
  const prBody = arg("--pr-body") || "pr-body.md";
  const subjectOut = arg("--subject-out") || "subject.txt";
  // `yes` / `no`, so the workflow branches on a file rather than on an exit code.
  // "the model declined" and "the provider was unreachable" are normal outcomes of
  // a dispatch, not failures of one, and a job that goes red on them would train
  // the maintainer to ignore this workflow's colour.
  const marker = arg("--marker") || "drafted.txt";
  const nothingToDo = (why) => {
    console.log(`issue-dispatch: ${why}`);
    writeFileSync(marker, "no\n");
    return 0;
  };

  let proposal;
  try {
    proposal = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    die(`could not read ${file} — ${err.message}`);
  }
  const files = Array.isArray(proposal.files) ? proposal.files : [];
  if (!files.length) return nothingToDo("the proposal contains no files — nothing to draft.");

  const written = [];
  const refused = [];
  for (const f of files) {
    const ok = safePath(f?.path);
    if (!ok.ok) {
      refused.push(`${f?.path ?? "(no path)"} — ${ok.why}`);
      continue;
    }
    mkdirSync(dirname(ok.abs), { recursive: true });
    // Normalised to LF: the runner is Linux and the rest of the tree is LF, and a
    // proposal that arrives with CRLF would otherwise rewrite every line of the
    // file it touches.
    writeFileSync(ok.abs, String(f.contents ?? "").replace(/\r\n/g, "\n"));
    written.push(ok.path);
  }
  for (const r of refused) console.log(`issue-dispatch: refused ${r}`);
  if (!written.length) return nothingToDo("every proposed path was outside the allowed roots — nothing to draft.");

  // The subject is the model's, and it is checked like anyone else's (rubric A5).
  // A5 blocks on the pull request, so an unusable subject here would only turn the
  // draft red later; refusing it now costs a fallback line.
  const proposed = String(proposal.subject ?? "").trim();
  const problems = proposed ? checkSubject(proposed) : ["the proposal names no subject."];
  const subject = problems.length ? `chore(issue-${number || "0"}): draft a change proposed from the issue` : proposed;
  if (problems.length) {
    console.log(`issue-dispatch: the model's subject was refused (${problems.join(" ")}) — using a fallback.`);
  }

  const body = [
    `Draft proposed from issue #${number} by \`scripts/issue-dispatch.mjs\` (${proposal.model ?? MODEL}).`,
    "",
    "**Nothing here has been reviewed by a person.** It is in front of the same gates as any other",
    "change; read it as a starting point, not as a suggestion that has already earned anything.",
    "",
    String(proposal.summary ?? "").trim() || "_(the proposal carried no summary)_",
    "",
    "### Files written",
    "",
    ...written.map((p) => `- \`${p}\``),
    ...(refused.length ? ["", "### Refused (outside the allowed roots)", "", ...refused.map((r) => `- ${r}`)] : []),
    "",
    `Closes #${number}`,
  ].join("\n");

  writeFileSync(prBody, body + "\n");
  writeFileSync(subjectOut, subject + "\n");

  git(["add", "--", ...written]);
  // This lane commits in a CI runner where nobody ran `npm install`, so no hook adds
  // the trailers for it — a lane that commits for itself writes its own provenance.
  // `Agent-Harness` is the field `npm run commit:check -- --range` counts, so a
  // regression traced back to one of these commits names the loop that produced it
  // rather than only "an agent" (scripts/commit-attribution.mjs).
  const message = [
    subject,
    "",
    `Proposed from issue #${number} and written by \`scripts/issue-dispatch.mjs\`. Draft only —`,
    "no gate has passed on it yet and no person has read it.",
    "",
    `Generated-by: issue-dispatch (${proposal.model ?? MODEL})`,
    "Agent-Harness: issue-dispatch",
    `Agent-Model: ${proposal.model ?? MODEL}`,
    `Agent-Lane: agent/issue-${number || "0"}`,
    `Dispatched-from: #${number}`,
  ].join("\n");
  git(["commit", "-m", message, "--", ...written]);

  writeFileSync(marker, "yes\n");
  console.log(`issue-dispatch: committed ${written.length} file(s) — ${subject}`);
  return 0;
}

// --- --gate: is this the label we dispatch on? -------------------------------

function gate() {
  const label = arg("--label") || "agent:draft";
  const out = arg("--out");
  if (!out) die("--gate needs --out FILE (normally \"$GITHUB_OUTPUT\").");

  // The autonomy pause, read BEFORE the event is even parsed and long before the
  // model is called. This is the front of the only lane here that turns somebody's
  // text into a branch and a pull request, so it is the lane an absent maintainer
  // actually changes the risk of (.github/autonomy-budget.json § lanes). While the
  // flag is set a labelled issue QUEUES: the label stays on, nothing is lost, and the
  // reason is printed where the run can be read. It fails CLOSED — an unreadable
  // budget pauses the lane rather than waving it through.
  const pause = pauseState();
  if (pause.paused) {
    appendFileSync(out, "dispatch=no\n");
    console.log(`dispatch=no — ${pause.reason}`);
    console.log(`(the switch is \`pause.paused\` in ${BUDGET_REL}; \`npm run autonomy\` prints the current state.)`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      try {
        appendFileSync(
          summary,
          `### Issue dispatch is paused\n\n${pause.reason}\n\n` +
            `The label stays on the issue; nothing was dispatched and no model was called. ` +
            `Un-pause by clearing \`pause.paused\` in \`${BUDGET_REL}\`.\n`
        );
      } catch {
        // a summary that cannot be written must never be the reason a lane fails.
      }
    }
    return 0;
  }

  const path = process.env.GITHUB_EVENT_PATH;
  let event = {};
  try {
    event = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    die("GITHUB_EVENT_PATH is unreadable — this only runs inside a GitHub Actions job.");
  }
  // Only fixed words and an integer are ever written here: the label NAME is
  // compared against a literal and never emitted, so no value an outsider wrote
  // can forge a second `$GITHUB_OUTPUT` line for a later step to trust.
  const matches = event?.label?.name === label;
  const number = event?.issue?.number;
  const dispatch = matches && Number.isInteger(number) ? "yes" : "no";
  const lines = [`dispatch=${dispatch}`];
  if (dispatch === "yes") {
    lines.push(`issue=${number}`, `branch=agent/issue-${number}`);
  }
  appendFileSync(out, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  return 0;
}

// --- CLI ---------------------------------------------------------------------

// Guarded, so test-unit/issue-dispatch.test.mjs can import `safePath` and
// `extractJson` without the CLI deciding it has nothing to do and exiting.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  if (argv.includes("--gate")) process.exit(gate());
  else if (argv.includes("--apply")) process.exit(apply());
  else if (argv.includes("--propose")) process.exit(await propose());
  else die("nothing to do — see the usage block at the top of this file.");
}
