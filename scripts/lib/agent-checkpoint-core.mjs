/** The agent checkpoint — the rules, with no I/O (zero-dependency, ADR-0008).
 *
 *  WHY THIS EXISTS. Almost every commit here is written by an agent working alone,
 *  under a wall clock it does not control. When the clock wins, the run is killed
 *  mid-task: nothing it had learned survives, and the next run starts from the
 *  same cold read of the same tree. The log records what that costs — four of
 *  fifteen sampled commits once read `fix: Agent session exceeded 20 min and was
 *  stopped`, which is a session event standing in for a change.
 *
 *  scripts/commit-subject.mjs already refuses those subjects (rubric A5), and it
 *  is right to: a run that produced no change does not owe the log a commit. But
 *  refusing the commit on its own makes the interrupted run leave NOTHING. This
 *  module is the other half — what a stopped run leaves instead.
 *
 *  THE SHAPE OF THE ANSWER. A checkpoint cannot be something the agent writes on
 *  its way out; when the clock wins there is no way out. So it is written as the
 *  run goes: the agent names the task and the next step when it starts one and
 *  whenever the answer changes (`npm run checkpoint`), before the step it might
 *  not survive rather than after it. Two involuntary layers are written and wait
 *  on a one-time paste each — `.husky/pre-commit` (what a commit landed) and the
 *  Claude Code hooks in `.claude/settings.json` (a record after every edit). Both
 *  blocks are verbatim in `.agent/README.md`.
 *
 *  A CLEAN END IS NOT AN INTERRUPTION. `SessionEnd` stamps the checkpoint, so the
 *  distinguishing fact is recorded by its ABSENCE: a checkpoint with no `endedAt`
 *  belongs to a run that was stopped, not one that finished. That is the entry a
 *  briefing leads with.
 *
 *  Everything here is pure and takes `now` as an argument, so the behaviour is
 *  testable without a clock (test-unit/agent-checkpoint.test.mjs).
 */

export const SCHEMA_VERSION = 1;

/** Bounds. A checkpoint is a briefing, not a transcript: it is read into an
 *  agent's context at session start, so it has to stay small enough that reading
 *  it is always cheaper than re-deriving what it says. */
export const LIMITS = { touched: 40, done: 20, blockers: 10, gates: 10, text: 300 };

/** How long a cleanly-ended checkpoint stays on disk before it is pruned. Long
 *  enough to survive a weekend, short enough that the directory does not become
 *  a graveyard nobody reads. */
export const PRUNE_AFTER_DAYS = 3;

const MINUTE = 60_000;

function clean(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > LIMITS.text ? `${s.slice(0, LIMITS.text - 1)}…` : s;
}

/** Append, de-duplicated, keeping the most recent occurrence last and the list
 *  bounded from the front — the oldest entries are the ones worth losing. */
function push(list, value, limit) {
  const v = clean(value);
  if (!v) return list;
  const next = list.filter((x) => x !== v);
  next.push(v);
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function emptyCheckpoint({ session, cwd = null, now }) {
  const at = new Date(now).toISOString();
  return {
    v: SCHEMA_VERSION,
    session: String(session),
    task: null,
    /** true once `--start` named the task. An auto-opened checkpoint that ends
     *  cleanly is discarded; an explicit one is kept as a handoff. */
    explicit: false,
    budgetMinutes: null,
    next: null,
    done: [],
    blockers: [],
    gates: [],
    touched: [],
    edits: 0,
    cwd: cwd ? String(cwd) : null,
    startedAt: at,
    updatedAt: at,
    endedAt: null,
    endReason: null,
  };
}

/** The harness's own record: an edit happened, to this file, at this time. This
 *  is the entry that survives a kill, because nothing had to remember to write it. */
export function applyTouch(cp, { file, now }) {
  const next = { ...cp, updatedAt: new Date(now).toISOString(), edits: cp.edits + 1 };
  next.touched = push(cp.touched, file, LIMITS.touched);
  // An edit means the run is alive again: a stamp from a previous end no longer
  // describes it. (Claude Code reuses a session id across `--continue`.)
  next.endedAt = null;
  next.endReason = null;
  return next;
}

/** `.husky/pre-commit`. A commit is the one moment a run's progress is certain,
 *  so it is recorded as a step rather than as N more edits: the edit COUNT stays
 *  a count of edits, and the checkpoint gains a line the next run can read as
 *  "this much definitely landed". */
export function applyCommit(cp, { files = [], now }) {
  const out = { ...cp, updatedAt: new Date(now).toISOString(), endedAt: null, endReason: null };
  out.touched = files.reduce((acc, f) => push(acc, f, LIMITS.touched), cp.touched);
  const shown = files.slice(0, 4).join(", ");
  out.done = push(
    cp.done,
    `committed ${files.length} path(s): ${shown}${files.length > 4 ? " …" : ""}`,
    LIMITS.done
  );
  out.explicit = true;
  return out;
}

/** The agent's own record: what this run is for, and what it would do next. */
export function applyStart(cp, { task, next: nextStep, budgetMinutes, now }) {
  const out = { ...cp, updatedAt: new Date(now).toISOString() };
  const t = clean(task);
  if (t) {
    out.task = t;
    out.explicit = true;
  }
  const n = clean(nextStep);
  if (n) out.next = n;
  const b = Number(budgetMinutes);
  if (Number.isFinite(b) && b > 0) out.budgetMinutes = Math.round(b);
  return out;
}

export function applyNote(cp, { done, next: nextStep, blocker, gate, now }) {
  const out = { ...cp, updatedAt: new Date(now).toISOString() };
  out.done = push(cp.done, done, LIMITS.done);
  out.blockers = push(cp.blockers, blocker, LIMITS.blockers);
  out.gates = push(cp.gates, gate, LIMITS.gates);
  const n = clean(nextStep);
  if (n) out.next = n;
  // A note is the agent speaking on purpose, so the entry stops being an
  // auto-opened record and becomes a handoff worth keeping past a clean end.
  if (out.next !== cp.next || out.done !== cp.done || out.blockers !== cp.blockers || out.gates !== cp.gates) {
    out.explicit = true;
  }
  return out;
}

/** `SessionEnd`. The run ENDED — which is the one thing a killed run cannot say. */
export function applyEnd(cp, { reason, now }) {
  return {
    ...cp,
    updatedAt: new Date(now).toISOString(),
    endedAt: new Date(now).toISOString(),
    endReason: clean(reason) ?? "unknown",
  };
}

/** An auto-opened checkpoint whose session ended cleanly recorded no interruption
 *  and no intent — it is noise, and is dropped rather than filed. */
export function shouldDiscardOnEnd(cp) {
  return !cp.explicit;
}

/** A cleanly-ended checkpoint nobody resumed. An UNENDED one is never pruned: it
 *  is the interrupted run this whole mechanism exists for. */
export function shouldPrune(cp, now, days = PRUNE_AFTER_DAYS) {
  if (!cp?.endedAt) return false;
  const ended = Date.parse(cp.endedAt);
  if (!Number.isFinite(ended)) return false;
  return now - ended > days * 24 * 60 * MINUTE;
}

/** [] when the file is usable; otherwise one plain-English problem per entry.
 *  A checkpoint is machine-written and machine-read, so a hand-edit that breaks
 *  the shape loses the handoff silently — this is what says so out loud. */
export function validate(cp) {
  const problems = [];
  if (!cp || typeof cp !== "object" || Array.isArray(cp)) return ["not a JSON object."];
  if (cp.v !== SCHEMA_VERSION) problems.push(`schema version is ${JSON.stringify(cp.v)}; this tool writes ${SCHEMA_VERSION}.`);
  if (!cp.session || typeof cp.session !== "string") problems.push("no `session` — the entry cannot be attributed or resumed.");
  for (const key of ["startedAt", "updatedAt"]) {
    if (!Number.isFinite(Date.parse(cp[key]))) problems.push(`\`${key}\` is not a timestamp.`);
  }
  if (cp.endedAt !== null && cp.endedAt !== undefined && !Number.isFinite(Date.parse(cp.endedAt))) {
    problems.push("`endedAt` is neither null nor a timestamp.");
  }
  for (const key of ["done", "blockers", "gates", "touched"]) {
    if (!Array.isArray(cp[key])) problems.push(`\`${key}\` is not an array.`);
  }
  return problems;
}

export function describeAge(ms) {
  const min = Math.max(0, Math.round(ms / MINUTE));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** One line saying which kind of entry this is — the fact a reader needs first. */
export function statusOf(cp, now) {
  const age = describeAge(now - Date.parse(cp.updatedAt));
  if (!cp.endedAt) return `STOPPED mid-run · last edit ${age}`;
  return `ended (${cp.endReason}) · ${describeAge(now - Date.parse(cp.endedAt))}`;
}

/** The briefing printed into the next session's context. Empty string when there
 *  is nothing to say — a hook that prints nothing costs the next run nothing. */
export function renderBriefing(entries, now) {
  const list = [...entries].sort((a, b) => {
    if (!a.endedAt !== !b.endedAt) return a.endedAt ? 1 : -1; // interrupted first
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
  if (!list.length) return "";

  const out = [];
  out.push(`Unfinished agent work in this tree — ${list.length} open checkpoint(s).`);
  out.push("A previous run wrote these as it went; the ones marked STOPPED were killed before they could finish.");
  for (const cp of list) {
    out.push("");
    out.push(`• [${statusOf(cp, now)}] ${cp.task ?? "(no task recorded — the run never named one)"}`);
    if (cp.next) out.push(`    next: ${cp.next}`);
    if (cp.blockers.length) out.push(`    blocked: ${cp.blockers.join(" · ")}`);
    if (cp.done.length) out.push(`    done: ${cp.done.join(" · ")}`);
    if (cp.gates.length) out.push(`    gates last green: ${cp.gates.join(", ")}`);
    if (cp.touched.length) {
      const shown = cp.touched.slice(-6);
      const more = cp.touched.length - shown.length;
      out.push(`    touched (${cp.edits} edit(s)): ${shown.join(", ")}${more > 0 ? ` … +${more} more` : ""}`);
    }
    if (cp.budgetMinutes) {
      const ran = Math.round((Date.parse(cp.updatedAt) - Date.parse(cp.startedAt)) / MINUTE);
      out.push(`    ran ${ran} min against a ${cp.budgetMinutes} min budget`);
    }
    out.push(`    resume: npm run checkpoint -- --session ${cp.session}   ·   done with it: --close ${cp.session}`);
  }
  out.push("");
  out.push("Pick one up before starting something new, or close it. Do not re-derive what it already says.");
  return out.join("\n");
}
