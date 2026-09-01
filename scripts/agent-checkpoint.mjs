#!/usr/bin/env node
/** What a stopped agent run leaves behind (zero-dependency, ADR-0008).
 *
 *  The rules live in scripts/lib/agent-checkpoint-core.mjs, which explains WHY.
 *  This file is the I/O and the CLI.
 *
 *  WIRED TODAY:
 *
 *    AGENTS.md § Checkpoints        the standing instruction every session loads:
 *                                   read the open checkpoints first, open one for
 *                                   any task longer than a couple of steps.
 *    npm run checkpoint:check       inside check:ci — and so in CI's required
 *                                   check and in .husky/pre-push before the push
 *                                   that ships master — so a checkpoint that
 *                                   stopped being readable cannot fail silently.
 *
 *  WRITTEN, NOT YET WIRED (the involuntary layers; both config files are
 *  hand-edited on purpose, so each is a one-time paste — .agent/README.md has
 *  them verbatim):
 *
 *    .husky/pre-commit → --commit   records what a commit landed into the open
 *                                   checkpoint. A no-op when none is open, so it
 *                                   enriches a handoff and never invents one.
 *
 *    SessionStart  → --show    reads the open checkpoints into the new session's
 *                              context, so the next run starts warm.
 *    PostToolUse   → --touch   after every Edit/Write/NotebookEdit, records the
 *      (Edit|Write|…)          file and the time. This is the half that survives
 *                              a kill outright: nothing has to remember to write it.
 *    SessionEnd    → --stamp   marks the run as ENDED. A checkpoint with no
 *                              `endedAt` is therefore, by construction, one whose
 *                              run was stopped rather than finished.
 *
 *  The agent's own half is one command, and it is what makes the entry a handoff
 *  rather than a file list:
 *
 *    npm run checkpoint -- --start "harden the durable-limit window rollover" \
 *                          --next "add the per-IP case to test-unit/durable-limit.test.mjs" \
 *                          --budget 20
 *    npm run checkpoint -- --done "read the store seam" --gate "typecheck, lint"
 *    npm run checkpoint -- --next "wire the ratchet into check:ci"   # before a risky step
 *    npm run checkpoint -- --close                                   # the task is finished
 *
 *  And to read them by hand: `npm run checkpoint` (all) or `-- --session <id>`.
 *
 *  RUNG (ADR-0007). `--check` is blocking-shaped and passes on an empty tree: it
 *  fails only on a checkpoint file that is not readable as one, which is the
 *  failure that would otherwise lose a handoff in silence. It deliberately does
 *  NOT fail on an OPEN checkpoint — unfinished work is the normal state this
 *  mechanism exists to record, not a build break.
 *
 *  EVERY OTHER MODE FAILS OPEN. These run inside the harness on every edit; a
 *  checkpoint that cannot be written must never be able to stop a session.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { printRemedy } from "./gate-remedy.mjs";

import {
  applyCommit,
  applyEnd,
  applyNote,
  applyStart,
  applyTouch,
  emptyCheckpoint,
  renderBriefing,
  shouldDiscardOnEnd,
  shouldPrune,
  statusOf,
  validate,
} from "./lib/agent-checkpoint-core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Where the handoffs live. Overridable ONLY so the interruption itself can be
 *  rehearsed: `npm run interrupt:drill` kills a real writer mid-session and reads
 *  what survived, and it must do that against a scratch directory rather than
 *  against the checkpoints of whoever is working in this checkout. It is not a
 *  configuration knob — nothing in the product, the hooks or `check:ci` sets it,
 *  and scripts/interrupt-drill.mjs is the only caller. */
const DIR = process.env.ADAMANT_CHECKPOINT_DIR
  ? resolve(process.env.ADAMANT_CHECKPOINT_DIR)
  : join(ROOT, ".agent", "checkpoints");

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
/** `--flag value`, or null when absent. `--flag` with nothing after it reads as
 *  an empty string, which every caller treats as "not given". */
function arg(flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const v = argv[i + 1];
  return v === undefined || v.startsWith("--") ? "" : v;
}

const MODE_TOUCH = has("--touch");
const MODE_STAMP = has("--stamp");
const MODE_CHECK = has("--check");
const MODE_CLOSE = has("--close");
const MODE_COMMIT = has("--commit");

/** Hook payloads arrive as one JSON object on stdin. Read it only in the modes
 *  the harness drives, and never from a terminal — a blocking read on an
 *  inherited stdin would hang whatever invoked us. */
function hookPayload() {
  if (!(MODE_TOUCH || MODE_STAMP)) return {};
  if (process.stdin.isTTY) return {};
  try {
    const raw = readFileSync(0, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sanitize(id) {
  const s = String(id ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "local";
}

/** Repo-relative, forward-slashed — the form every other tool here prints. */
function rel(p) {
  if (!p) return null;
  const s = String(p);
  const r = isAbsolute(s) ? relative(ROOT, s) : s;
  return r.split("\\").join("/");
}

function fileFor(session) {
  return join(DIR, `${sanitize(session)}.json`);
}

function readAll() {
  if (!existsSync(DIR)) return [];
  const out = [];
  for (const name of readdirSync(DIR)) {
    if (!name.endsWith(".json")) continue;
    const path = join(DIR, name);
    try {
      out.push({ path, name, cp: JSON.parse(readFileSync(path, "utf8")) });
    } catch (err) {
      out.push({ path, name, cp: null, error: err.message });
    }
  }
  return out;
}

function save(cp) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(fileFor(cp.session), `${JSON.stringify(cp, null, 2)}\n`);
}

function drop(session) {
  const path = fileFor(session);
  if (existsSync(path)) rmSync(path);
  return existsSync(path) === false;
}

/** Sweep cleanly-ended entries nobody picked up. Never touches an unended one. */
function prune(now) {
  for (const entry of readAll()) {
    if (entry.cp && shouldPrune(entry.cp, now)) rmSync(entry.path);
  }
}

function loadOrCreate(session, now, cwd) {
  const path = fileFor(session);
  if (existsSync(path)) {
    try {
      const cp = JSON.parse(readFileSync(path, "utf8"));
      if (validate(cp).length === 0) return cp;
    } catch {
      /* unreadable — start a fresh one rather than lose the session */
    }
  }
  return emptyCheckpoint({ session, cwd, now });
}

// --- --check: is every checkpoint on disk still readable as one? -------------

if (MODE_CHECK) {
  const entries = readAll();
  const problems = [];
  for (const entry of entries) {
    if (!entry.cp) {
      problems.push(`.agent/checkpoints/${entry.name}: not valid JSON — ${entry.error}`);
      continue;
    }
    for (const p of validate(entry.cp)) problems.push(`.agent/checkpoints/${entry.name}: ${p}`);
  }
  const now = Date.now();
  const open = entries.filter((e) => e.cp).length;
  const stopped = entries.filter((e) => e.cp && !e.cp.endedAt).length;
  console.log(`Agent checkpoints — ${open} open, ${stopped} from a run that was stopped rather than finished.`);
  for (const entry of entries) {
    if (entry.cp) console.log(`  • ${entry.cp.session}  [${statusOf(entry.cp, now)}]  ${entry.cp.task ?? "(no task recorded)"}`);
  }
  if (problems.length) {
    console.error("");
    console.error(`✗ ${problems.length} unreadable checkpoint(s):`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error("");
    console.error(
      "A checkpoint is written by the harness and read by the next session. One that no longer parses does not " +
        "announce itself — it just hands the next run nothing. Fix the file, or delete it and say so."
    );
    printRemedy("checkpoint:check");
    process.exit(1);
  }
  console.log("");
  console.log("✓ every checkpoint on disk is readable, so an interrupted run's handoff still reaches the next one.");
  process.exit(0);
}

// --- every other mode fails open ---------------------------------------------

try {
  const payload = hookPayload();
  const now = Date.now();
  const session = sanitize(arg("--session") || payload.session_id || process.env.CLAUDE_SESSION_ID || "local");

  if (MODE_TOUCH) {
    const input = payload.tool_input ?? {};
    const file = rel(input.file_path ?? input.notebook_path ?? input.path ?? null);
    const cp = applyTouch(loadOrCreate(session, now, rel(payload.cwd)), { file, now });
    save(cp);
    prune(now);
    process.exit(0);
  }

  if (MODE_STAMP) {
    const path = fileFor(session);
    if (!existsSync(path)) process.exit(0);
    const cp = applyEnd(loadOrCreate(session, now, rel(payload.cwd)), { reason: payload.reason, now });
    if (shouldDiscardOnEnd(cp)) drop(session);
    else save(cp);
    prune(now);
    process.exit(0);
  }

  if (MODE_COMMIT) {
    // .husky/pre-commit. Deliberately a no-op when no checkpoint is open: this
    // enriches an interrupted run's handoff, and must never CREATE one — a
    // checkpoint nobody opened would show up at the next session start as an
    // interruption that never happened, and a briefing that cries wolf is worse
    // than no briefing.
    const path = fileFor(session);
    if (!existsSync(path)) process.exit(0);
    const staged = spawnSync("git", ["diff", "--cached", "--name-only"], { cwd: ROOT, encoding: "utf8" });
    const files = staged.status === 0 ? staged.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
    if (!files.length) process.exit(0);
    const cp = applyCommit(loadOrCreate(session, now, null), { files: files.map(rel), now });
    save(cp);
    process.exit(0);
  }

  if (MODE_CLOSE) {
    const target = sanitize(arg("--close") || session);
    const existed = existsSync(fileFor(target));
    drop(target);
    console.log(
      existed
        ? `✓ checkpoint ${target} closed. What it recorded is finished, so the commit is now the only record needed.`
        : `no open checkpoint for ${target} — nothing to close.`
    );
    process.exit(0);
  }

  const task = arg("--start");
  const nextStep = arg("--next");
  const done = arg("--done");
  const blocker = arg("--blocker");
  const gate = arg("--gate");
  const budget = arg("--budget");

  if (task || nextStep || done || blocker || gate || budget) {
    let cp = loadOrCreate(session, now, null);
    if (task || budget) cp = applyStart(cp, { task, next: nextStep, budgetMinutes: budget, now });
    if (nextStep || done || blocker || gate) cp = applyNote(cp, { done, next: nextStep, blocker, gate, now });
    save(cp);
    console.log(`✓ checkpoint ${cp.session} updated — ${cp.task ?? "(no task named yet)"}`);
    if (cp.next) console.log(`  next: ${cp.next}`);
    console.log(`  .agent/checkpoints/${cp.session}.json — this is what survives if this run is stopped.`);
    process.exit(0);
  }

  // --show (the default, and what the SessionStart hook runs)
  prune(now);
  const wanted = sanitize(arg("--session") || "");
  const entries = readAll()
    .filter((e) => e.cp && validate(e.cp).length === 0) // a broken one is --check's business, not the briefing's
    .map((e) => e.cp)
    .filter((cp) => (arg("--session") ? cp.session === wanted : true));

  if (has("--json")) {
    console.log(JSON.stringify(entries, null, 2));
    process.exit(0);
  }

  const briefing = renderBriefing(entries, now);
  if (briefing) console.log(briefing);
  else if (process.stdin.isTTY) console.log("No open checkpoints — no run was interrupted in this tree.");
  // Otherwise say nothing: this is the SessionStart hook, and its output is spent
  // out of the next run's context. Silence is the right answer to no news.
  process.exit(0);
} catch (err) {
  // Fail open, loudly enough to be findable and quietly enough to never stop a
  // session: this runs after every edit an agent makes.
  console.error(`(agent-checkpoint: ${err?.message ?? err})`);
  process.exit(0);
}
