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
 *  WHY DETECTION AND NOT "ALWAYS". A maintainer's own commit must not claim an
 *  assistant wrote it; that would be the same lie in the other direction. So the
 *  trailer is added exactly when the environment says an agent session is running
 *  (`CLAUDECODE`, `CLAUDE_SESSION_ID`, `AI_AGENT`, or an explicit
 *  `COMMIT_ATTRIBUTION`), and never otherwise.
 *
 *  WHAT IT CANNOT DO. A lane that commits in a throwaway worktree where nobody ran
 *  `npm install` runs no hooks at all — that is the same hole rubric A5 has, and it
 *  is why `npm run commit:check -- --range` reports attribution coverage over
 *  history and why scripts/agent-review.mjs puts unattributed commits in its report.
 *  A count that is visible can be argued with; one that nobody keeps cannot.
 *
 *  Usage:
 *    node scripts/commit-attribution.mjs <msgfile> [<source>]   # prepare-commit-msg
 *    node scripts/commit-attribution.mjs --check <msgfile>      # commit-msg
 *    node scripts/commit-attribution.mjs --identity             # who this run is
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

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

/**
 * The message with an attribution trailer, or unchanged when it already has one
 * (or when no agent is driving). Idempotent: running it twice adds nothing.
 *
 * The trailer goes at the end, after a blank line, which is where git looks for
 * trailers and where nothing in the subject rules can see it.
 */
export function withAttribution(message, identity) {
  const text = String(message ?? "");
  if (!identity || hasAttribution(text)) return text;
  // Keep git's comment block (`# …` lines from the template) below nothing — the
  // trailer belongs with the message, so it is inserted before the first comment
  // line when there is one, and appended otherwise.
  const lines = text.replace(/\r/g, "").split("\n");
  const firstComment = lines.findIndex((l) => l.startsWith("#"));
  const at = firstComment === -1 ? lines.length : firstComment;
  const head = lines.slice(0, at);
  while (head.length && head.at(-1).trim() === "") head.pop();
  if (!head.length) return text; // an empty message: git will abort the commit anyway
  return [...head, "", trailerFor(identity), "", ...lines.slice(at)].join("\n");
}

// --- CLI ---------------------------------------------------------------------

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const identity = agentIdentity();

  if (argv.includes("--identity")) {
    console.log(identity ? trailerFor(identity) : "(no agent session detected — commits will carry no trailer)");
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
    if (!identity || hasAttribution(message)) process.exit(0);
    console.error("");
    console.error("✗ commit-attribution: an agent is writing this commit and it carries no authorship trailer.");
    console.error("");
    console.error(`  Add it below a blank line at the end of the message:  ${trailerFor(identity)}`);
    console.error("");
    console.error("  Nearly every commit here is agent-written and the log cannot say which. A trailer is the");
    console.error("  form `git log --format=%(trailers)` and `git shortlog --group=trailer:co-authored-by` can");
    console.error("  count, so the loop's footprint is auditable without reading thirty prose bodies.");
    console.error("");
    console.error("  Rules: scripts/commit-attribution.mjs · coverage: npm run commit:check -- --range <range>");
    console.error("");
    process.exit(1);
  }

  const next = withAttribution(message, identity);
  if (next !== message) {
    try {
      writeFileSync(file, next);
    } catch (err) {
      console.error(`(commit-attribution: could not write ${file} — ${err.message})`);
    }
  }
  process.exit(0);
}
