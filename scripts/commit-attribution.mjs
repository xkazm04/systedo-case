#!/usr/bin/env node
/** Machine-readable authorship on an agent's commit (zero-dependency).
 *
 *  ~97% of the commits in this repository are written by an agent, and five of the
 *  last thirty said so. The rest are indistinguishable from a person's, which
 *  makes the one question you actually ask of this log — "how much of this was
 *  written unattended, and by what?" — unanswerable without reading prose bodies
 *  and guessing.
 *
 *  A trailer answers it in a form `git log --format=%(trailers)` can count, and
 *  `git shortlog -sn --group=trailer:co-authored-by` can group. So an agent's
 *  commit carries one, and it is not something anybody has to remember:
 *
 *    .husky/prepare-commit-msg   appends it, when the environment says an agent is
 *                                driving and the message does not already carry
 *                                one. This runs for `git commit -m` too, which is
 *                                how automation commits.
 *    .husky/commit-msg           refuses a commit that an agent is writing and
 *                                that still has no trailer — the belt for the
 *                                braces above, at the one moment the message is
 *                                still free to change.
 *
 *  Both are written by `npm install` (`prepare` → scripts/install-commit-hooks.mjs),
 *  because a hook that has to be installed by hand is a suggestion, not a control:
 *  they sat documented-but-uninstalled long enough for the log to fill up with
 *  unattributed agent commits. `npm run hooks:check` says whether yours are wired.
 *
 *  WHY DETECTION AND NOT "ALWAYS". A maintainer's own commit must not claim an
 *  assistant wrote it; that would be the same lie in the other direction. So the
 *  trailer is added exactly when the environment says an agent session is running
 *  (`CLAUDECODE`, `CLAUDE_SESSION_ID`, `AI_AGENT`, or an explicit
 *  `COMMIT_ATTRIBUTION`), and never otherwise.
 *
 *  AND "Co-Authored-By: Claude" IS STILL NOT THE ANSWER TO THE QUESTION YOU ASK.
 *  When a regression is traced back to a commit three weeks old, "an assistant wrote
 *  it" narrows nothing: nearly every commit here has that property. What you want to
 *  know is WHICH LANE — which harness was driving, under which model, from which
 *  agent spec, in which session. Those are four different things and the log records
 *  none of them; several commits in this history say only that a loop's lane
 *  committed them, which is the same non-answer with more words.
 *
 *  So the same hook that adds the authorship trailer adds PROVENANCE trailers
 *  alongside it, from the environment the harness is already running in:
 *
 *    Agent-Harness: claude-code        which loop wrote this. ENFORCED with the
 *                                      authorship trailer, because if an agent can
 *                                      be detected at all this can always be
 *                                      answered — `unknown` when nothing identifies
 *                                      itself, which makes the unidentified
 *                                      population countable instead of invisible.
 *    Agent-Model: claude-opus-5        best effort — the model, when the harness
 *    Agent-Spec: Explore               says so. A spec is what turned a prompt into
 *    Agent-Session: 0f3a…              this diff, and a session id is what finds
 *    Agent-Lane: ascent/loop-2026…     the transcript. Never invented: a field the
 *                                      environment does not state is omitted, not
 *                                      guessed, because a wrong provenance is worse
 *                                      than none.
 *
 *  ANY HARNESS CAN NAME ITSELF IN ONE VARIABLE — `AGENT_HARNESS`, the way
 *  `COMMIT_ATTRIBUTION` already lets one name its author. A harness this file has
 *  never heard of does not need a code change here to become greppable.
 *
 *  Count them the way you count the authorship trailer:
 *
 *    git log --format='%(trailers:key=Agent-Harness,valueonly)' | sort | uniq -c
 *    npm run commit:check -- --range origin/master..HEAD
 *
 *  WHAT IT CANNOT DO. A lane that commits in a throwaway worktree where nobody ran
 *  `npm install` runs no hooks at all — that is the same hole rubric A5 has, and it
 *  is why `npm run commit:check -- --range` reports attribution AND harness coverage
 *  over history and why scripts/agent-review.mjs puts unattributed commits in its
 *  report. A count that is visible can be argued with; one that nobody keeps cannot.
 *  A lane that commits for itself should write these trailers itself —
 *  scripts/issue-dispatch.mjs is the worked example.
 *
 *  Usage:
 *    node scripts/commit-attribution.mjs <msgfile> [<source>]   # prepare-commit-msg
 *    node scripts/commit-attribution.mjs --check <msgfile>      # commit-msg
 *    node scripts/commit-attribution.mjs --identity             # who this run is
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/** The trailers that count as machine-readable authorship. `Co-Authored-By` is the
 *  one git and GitHub already understand; the other two are what other harnesses
 *  emit, and refusing to recognise them would only produce duplicates. */
export const ATTRIBUTION_TRAILERS = ["Co-Authored-By", "Assisted-by", "Generated-by"];
const TRAILER_RE = new RegExp(`^\\s*(${ATTRIBUTION_TRAILERS.join("|")})\\s*:\\s*\\S`, "im");

/** Trailers git writes for its own bookkeeping; a message that has only these has
 *  no authorship in it. */
export const hasAttribution = (message) => TRAILER_RE.test(String(message ?? ""));

/** The environment variables an agent harness sets. Presence is the signal —
 *  `CLAUDECODE=1` and `CLAUDE_SESSION_ID=<uuid>` are both set by Claude Code, and
 *  `AI_AGENT` is the neutral name for anything else. */
export const AGENT_ENV_KEYS = ["COMMIT_ATTRIBUTION", "CLAUDECODE", "CLAUDE_SESSION_ID", "AI_AGENT", "AGENT_NAME"];

/**
 * Who is writing this commit, as `{ name, email }`, or null when a person is.
 *
 * `COMMIT_ATTRIBUTION` wins and is taken verbatim in `Name <email>` form, so a
 * harness this file has never heard of can identify itself without a code change.
 */
export function agentIdentity(env = process.env) {
  const explicit = String(env.COMMIT_ATTRIBUTION ?? "").trim();
  if (explicit) {
    const m = /^(.+?)\s*<([^>]+)>$/.exec(explicit);
    return m ? { name: m[1].trim(), email: m[2].trim() } : { name: explicit, email: "noreply@example.invalid" };
  }
  const driving = AGENT_ENV_KEYS.some((k) => String(env[k] ?? "").trim() !== "");
  if (!driving) return null;
  const name = String(env.AGENT_NAME ?? "").trim() || (env.CLAUDECODE || env.CLAUDE_SESSION_ID ? "Claude" : "AI agent");
  return { name, email: "noreply@anthropic.com" };
}

export const trailerFor = (identity) => `Co-Authored-By: ${identity.name} <${identity.email}>`;

// --- provenance: WHICH LANE, not just "an agent" -------------------------------

/** The provenance trailers, in the order they are written. `Agent-Harness` is
 *  first and is the only one that is required — see `provenanceFor`. */
export const PROVENANCE_TRAILERS = ["Agent-Harness", "Agent-Model", "Agent-Spec", "Agent-Session", "Agent-Lane"];

/** The value written when an agent is detected but nothing says what kind. It is a
 *  real answer, not a placeholder: "how many agent commits came from a harness that
 *  never identified itself?" is exactly the number that should be countable, and it
 *  is the number that tells a harness author to set `AGENT_HARNESS`. */
export const UNKNOWN_HARNESS = "unknown";

const first = (env, keys) => {
  for (const k of keys) {
    const v = String(env[k] ?? "").trim();
    if (v) return v;
  }
  return "";
};

/** Harnesses this file recognises without being told. `AGENT_HARNESS` is checked
 *  before any of them, so naming yourself always wins over being guessed at — and
 *  that variable, not this list, is how a new harness arrives. Deliberately short:
 *  a detector for a harness nothing sets is dead weight in exactly the way
 *  `npm run fences` exists to make visible. */
export const HARNESSES = [
  { id: "claude-code", detect: (e) => first(e, ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_SESSION_ID"]) !== "" },
];

/** Sanitised for a trailer line: one line, no colon-confusion, bounded. A value out
 *  of the environment is not something this file gets to paste unexamined into a
 *  commit message that later gets parsed by `git interpret-trailers`. */
export function trailerValue(raw, max = 120) {
  return String(raw ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** The branch this commit is being made on, read out of `.git` without spawning
 *  git — this runs in a hook on every commit and must be cheap and total. Handles
 *  the worktree case, where `.git` is a file pointing at the real gitdir. Returns
 *  "" when it cannot tell, which is a fine answer: the field is then omitted. */
export function currentBranch(root) {
  try {
    const dot = join(root, ".git");
    if (!existsSync(dot)) return "";
    let gitdir = dot;
    if (statSync(dot).isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dot, "utf8"));
      if (!m) return "";
      gitdir = resolve(root, m[1].trim());
    }
    const head = readFileSync(join(gitdir, "HEAD"), "utf8").trim();
    const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    return ref ? ref[1].trim() : ""; // detached HEAD names no lane
  } catch {
    return "";
  }
}

/** The default branch, so `Agent-Lane` names a lane rather than restating "master". */
const DEFAULT_BRANCHES = new Set(["master", "main"]);

/**
 * Provenance for this run as an ordered list of `[trailer, value]`, or `[]` when a
 * person is committing.
 *
 * Only `Agent-Harness` is always present. Every other field is written when the
 * environment states it and omitted when it does not — a guessed model or a guessed
 * spec would make the log worse than silence, because it would look like evidence.
 *
 * @param {Record<string,string>} env
 * @param {{branch?: string}} [opts]  the branch, when the caller already knows it
 */
export function provenanceFor(env = process.env, { branch = "" } = {}) {
  if (!agentIdentity(env)) return [];

  const named = trailerValue(first(env, ["AGENT_HARNESS"]));
  const detected = HARNESSES.find((h) => h.detect(env))?.id ?? "";
  const rows = [["Agent-Harness", named || detected || UNKNOWN_HARNESS]];

  const model = trailerValue(first(env, ["AGENT_MODEL", "ANTHROPIC_MODEL", "CLAUDE_MODEL", "ISSUE_DISPATCH_MODEL"]));
  if (model) rows.push(["Agent-Model", model]);

  const spec = trailerValue(first(env, ["AGENT_SPEC", "CLAUDE_AGENT", "SUBAGENT_TYPE"]));
  if (spec) rows.push(["Agent-Spec", spec]);

  const session = trailerValue(first(env, ["AGENT_SESSION_ID", "CLAUDE_SESSION_ID"]));
  if (session) rows.push(["Agent-Session", session]);

  // A lane is a branch a harness owns, which on this repository always carries a
  // prefix (`ascent/…`, `agent/issue-42`). The default branch is where everything
  // ends up, so naming it says nothing about who wrote this.
  const lane = trailerValue(first(env, ["AGENT_LANE"]) || branch);
  if (lane && !DEFAULT_BRANCHES.has(lane) && lane.includes("/")) rows.push(["Agent-Lane", lane]);

  return rows;
}

const PROVENANCE_RE = new RegExp(`^\\s*(${PROVENANCE_TRAILERS.join("|")})\\s*:\\s*\\S`, "im");
const HARNESS_RE = /^\s*Agent-Harness\s*:\s*(\S.*)$/im;

/** Does this message already carry provenance? */
export const hasProvenance = (message) => PROVENANCE_RE.test(String(message ?? ""));

/** The harness a message names, or "" — the field `commit:check --range` counts. */
export const harnessOf = (message) => (HARNESS_RE.exec(String(message ?? ""))?.[1] ?? "").trim();

/**
 * The message with an attribution trailer and this run's provenance, or unchanged
 * when it already carries them (or when no agent is driving). Idempotent: running
 * it twice adds nothing.
 *
 * The trailers go at the end, after a blank line, which is where git looks for
 * trailers and where nothing in the subject rules can see them.
 *
 * @param {string} message
 * @param {{name: string, email: string}|null} identity
 * @param {Array<[string,string]>} [prov]  from `provenanceFor`; `[]` writes none
 */
export function withAttribution(message, identity, prov = []) {
  const text = String(message ?? "");
  if (!identity) return text;

  const add = [];
  if (!hasAttribution(text)) add.push(trailerFor(identity));
  // Provenance is added as a block or not at all: a message that already names a
  // harness was written by a lane that knows its own provenance better than this
  // environment does (scripts/issue-dispatch.mjs), and half-overwriting it would
  // produce a commit attributed to two lanes.
  if (!hasProvenance(text)) add.push(...prov.map(([k, v]) => `${k}: ${v}`));
  if (!add.length) return text;

  // Keep git's comment block (`# …` lines from the template) below nothing — the
  // trailers belong with the message, so they are inserted before the first comment
  // line when there is one, and appended otherwise.
  const lines = text.replace(/\r/g, "").split("\n");
  const firstComment = lines.findIndex((l) => l.startsWith("#"));
  const at = firstComment === -1 ? lines.length : firstComment;
  const head = lines.slice(0, at);
  while (head.length && head.at(-1).trim() === "") head.pop();
  if (!head.length) return text; // an empty message: git will abort the commit anyway
  return [...head, "", ...add, "", ...lines.slice(at)].join("\n");
}

// --- CLI ---------------------------------------------------------------------

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const identity = agentIdentity();
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const prov = provenanceFor(process.env, { branch: currentBranch(ROOT) });

  if (argv.includes("--identity")) {
    if (!identity) {
      console.log("(no agent session detected — commits will carry no trailer)");
      process.exit(0);
    }
    console.log(trailerFor(identity));
    for (const [k, v] of prov) console.log(`${k}: ${v}`);
    process.exit(0);
  }

  const check = argv.includes("--check");
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("commit-attribution: no message file. Usage: commit-attribution.mjs [--check] <msgfile>");
    process.exit(1);
  }

  let message = "";
  try {
    message = readFileSync(file, "utf8");
  } catch (err) {
    // Fail open when writing: a hook that runs on every commit must never be the
    // reason a commit cannot be made.
    console.error(`(commit-attribution: could not read ${file} — ${err.message})`);
    process.exit(check ? 1 : 0);
  }

  if (check) {
    if (!identity) process.exit(0);
    const missing = [];
    if (!hasAttribution(message)) missing.push(trailerFor(identity));
    // `Agent-Harness` is enforced with the authorship trailer, and the rest are not:
    // if an agent can be detected at all then which harness is always answerable
    // (`unknown` at worst), while a model or a spec the environment never stated
    // cannot be produced by insisting on it.
    if (!harnessOf(message)) missing.push(`Agent-Harness: ${prov[0]?.[1] ?? UNKNOWN_HARNESS}`);
    if (!missing.length) process.exit(0);

    console.error("");
    console.error("✗ commit-attribution: an agent is writing this commit and the log will not say which lane.");
    console.error("");
    console.error("  Add these below a blank line at the end of the message:");
    for (const line of missing) console.error(`      ${line}`);
    console.error("");
    console.error("  Nearly every commit here is agent-written, so `Co-Authored-By` alone narrows nothing when a");
    console.error("  regression is traced back three weeks. `Agent-Harness` says which loop wrote it, in the form");
    console.error("  `git log --format='%(trailers:key=Agent-Harness,valueonly)' | sort | uniq -c` can count.");
    console.error("");
    console.error("  Rules: scripts/commit-attribution.mjs · coverage: npm run commit:check -- --range <range>");
    console.error("");
    process.exit(1);
  }

  const next = withAttribution(message, identity, prov);
  if (next !== message) {
    try {
      writeFileSync(file, next);
    } catch (err) {
      console.error(`(commit-attribution: could not write ${file} — ${err.message})`);
    }
  }
  process.exit(0);
}
