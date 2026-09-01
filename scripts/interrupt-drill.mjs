#!/usr/bin/env node
/** The interruption itself, rehearsed (zero-dependency, ADR-0008).
 *
 *  WHY THIS EXISTS. Almost every commit here is written by an agent under a wall
 *  clock it does not control, and the log records what happens when the clock
 *  wins: `chore: partial work from an interrupted lane session`, more than once.
 *  `.agent/` is the answer to that — a stopped run owes the next one a checkpoint,
 *  not a commit — and `npm run checkpoint:check` is inside `check:ci`, so a
 *  checkpoint that stopped being READABLE fails a build.
 *
 *  What nothing exercised is the interruption. `checkpoint:check` runs against
 *  whatever happens to be on disk in a checkout where, most of the time, nothing
 *  was interrupted; it can be green forever without anyone having established that
 *  a KILLED lane leaves a tree the next lane can pick up. So the property was
 *  learned the only way left — from the commits the killed lanes produced.
 *
 *  This is the drill. Each scenario in CATALOGUE below damages the handoff the way
 *  a real interruption does — a process killed mid-session, a write torn in half,
 *  a run that never recorded its next step — using the REAL
 *  scripts/agent-checkpoint.mjs against a scratch directory, and then asks the
 *  question the next lane asks: *is the work still resumable, and does the tree
 *  SAY that it is unfinished?*
 *
 *  THE SCRATCH DIRECTORY IS THE WHOLE SAFETY STORY. `ADAMANT_CHECKPOINT_DIR`
 *  exists for this and for nothing else: the drill must never read, write or prune
 *  the checkpoints of whoever is actually working in this checkout. Every scenario
 *  gets its own `mkdtemp` and removes it afterwards, and no scenario ever touches
 *  `.agent/checkpoints/`.
 *
 *  RUNG (docs/adr/0007-gate-rung-discipline.md): REPORTING. It spawns processes and
 *  kills them, which is exactly the kind of thing that behaves differently on a
 *  loaded shared runner, so it is never in `check:ci` and never in the pre-push
 *  hook. It runs weekly, next to the revert and mutation drills. What BLOCKS on
 *  every build is the CATALOGUE'S shape (test-unit/interrupt-census.test.mjs),
 *  because a scenario whose anchor has drifted is a scenario that can never fail
 *  and a score that keeps printing anyway.
 *
 *  A FAILURE IS A FINDING ABOUT THE HANDOFF, NEVER ABOUT THE SCENARIO. The fix is
 *  in scripts/agent-checkpoint.mjs or scripts/lib/agent-checkpoint-core.mjs —
 *  deleting the scenario that started failing is the cheapest green here and the
 *  one thing this file exists to make visible.
 *
 *  Usage:
 *    node scripts/interrupt-drill.mjs             # run every scenario
 *    node scripts/interrupt-drill.mjs --list      # the catalogue, without running it
 *    node scripts/interrupt-drill.mjs --summary FILE
 */
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "scripts", "agent-checkpoint.mjs");

const argv = process.argv.slice(2);
const LIST = argv.includes("--list");
const summaryIdx = argv.indexOf("--summary");
const SUMMARY_FILE = summaryIdx !== -1 ? argv[summaryIdx + 1] : null;

/** Run the real checkpoint CLI against a scratch directory. */
function cp(dir, args) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ADAMANT_CHECKPOINT_DIR: dir },
    // The hook modes read stdin; give them an EOF rather than an inherited TTY.
    input: "",
  });
  return { status: res.status ?? -1, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

function scratch() {
  return mkdtempSync(join(tmpdir(), "interrupt-drill-"));
}

function filesIn(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A REAL interruption: a child process opens a checkpoint and then keeps working,
 * and is killed while it is still working. Returns the scratch directory.
 *
 * The kill is `SIGKILL` on purpose — a lane stopped by its harness does not get to
 * run a handler, and a drill that sent something catchable would be rehearsing a
 * shutdown rather than an interruption.
 */
async function killMidSession(dir, { task, next: nextStep }) {
  const inner = [
    "const { spawnSync } = require('node:child_process');",
    `spawnSync(process.execPath, [${JSON.stringify(CLI)}, '--session', 'drill', '--start', ${JSON.stringify(task)}`,
    nextStep ? `, '--next', ${JSON.stringify(nextStep)}` : "",
    "], { stdio: 'ignore' });",
    // Now the lane is "working" — and this is where the clock runs out.
    "setInterval(() => {}, 1000);",
  ].join("");

  const child = spawn(process.execPath, ["-e", inner], {
    cwd: ROOT,
    env: { ...process.env, ADAMANT_CHECKPOINT_DIR: dir },
    stdio: "ignore",
  });

  // Wait for the handoff to be on disk, then kill the process that wrote it.
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && !filesIn(dir).length) await sleep(50);
  const wrote = filesIn(dir).length > 0;
  child.kill("SIGKILL");
  await new Promise((r) => child.on("exit", r));
  return { wrote, killed: true };
}

/** Tear a file the way an interrupted write leaves it: valid up to a point. */
function tear(path) {
  const text = readFileSync(path, "utf8");
  writeFileSync(path, text.slice(0, Math.max(1, Math.floor(text.length * 0.6))));
}

// --- the catalogue -----------------------------------------------------------
//
// `anchor` is what keeps a scenario honest: the file whose behaviour it claims to
// exercise, and a string that must still be in it. A scenario whose anchor has
// drifted is one that can never fail, and test-unit/interrupt-census.test.mjs is
// what turns that into a red build rather than a green score.

export const CATALOGUE = [
  {
    id: "killed-mid-session",
    what: "a lane is SIGKILLed while its task is unfinished",
    asks: "does the next lane find a readable handoff that names the very next step?",
    anchor: { file: "scripts/agent-checkpoint.mjs", contains: "const nextStep = arg(\"--next\");" },
    async run(dir) {
      const { wrote } = await killMidSession(dir, {
        task: "fold the Sklik envelope into the control plane",
        next: "port campaigns-envelope.test.mjs to the union store",
      });
      if (!wrote) return "the killed lane left no checkpoint at all — the next run starts cold.";
      const files = filesIn(dir);
      if (files.length !== 1) return `expected one checkpoint on disk, found ${files.length}.`;
      const entry = readJson(join(dir, files[0]));
      if (!entry) return "the surviving checkpoint does not parse — the handoff is unreadable.";
      if (entry.endedAt) {
        return "the checkpoint is stamped `endedAt` after a KILL. `endedAt` is the field that tells the next run " +
          "the work was finished rather than stopped; stamping it here makes an interruption look like a clean exit.";
      }
      if (!entry.next) return "the checkpoint records no `next` step, so the handoff is a file list, not a handoff.";
      return null;
    },
  },
  {
    id: "stopped-run-is-announced",
    what: "a killed lane's checkpoint sits next to a cleanly-ended one",
    asks: "does the briefing the next session reads distinguish them?",
    anchor: { file: "scripts/lib/agent-checkpoint-core.mjs", contains: "export function statusOf" },
    async run(dir) {
      await killMidSession(dir, { task: "harden the durable-limit rollover", next: "add the per-IP case" });
      cp(dir, ["--session", "finished", "--start", "rename the digest cron", "--next", "nothing"]);
      cp(dir, ["--session", "finished", "--stamp"]);
      const check = cp(dir, ["--check"]);
      if (check.status !== 0) return `\`checkpoint --check\` failed on an undamaged pair: ${check.out.trim()}`;
      if (!/1 from a run that was stopped/.test(check.out)) {
        return "the reader does not count the killed lane as stopped, so an interrupted run reads like a finished " +
          `one. It said: ${check.out.split("\n")[0]}`;
      }
      const show = cp(dir, ["--show"]);
      if (!/fold|harden|durable/i.test(show.out) && !/stopped/i.test(show.out)) {
        return "the briefing does not surface the stopped run's task, so the next lane has to go looking for it.";
      }
      return null;
    },
  },
  {
    id: "torn-write-is-refused",
    what: "the kill lands in the middle of the write, leaving half a JSON file",
    asks: "does the blocking gate say so, rather than the briefing quietly skipping it?",
    anchor: { file: "scripts/agent-checkpoint.mjs", contains: "not valid JSON" },
    async run(dir) {
      await killMidSession(dir, { task: "port the ranking helper", next: "re-run the census" });
      const files = filesIn(dir);
      if (!files.length) return "no checkpoint to tear — the kill left nothing on disk.";
      tear(join(dir, files[0]));
      const check = cp(dir, ["--check"]);
      if (check.status === 0) {
        return "`checkpoint --check` is green on a torn checkpoint. A handoff that no longer parses hands the " +
          "next run nothing and says so to nobody — that is the exact failure the gate exists for.";
      }
      if (!/not valid JSON|unreadable/i.test(check.out)) {
        return `the gate failed without naming the torn file, so the remedy is a guess: ${check.out.trim().slice(0, 200)}`;
      }
      return null;
    },
  },
  {
    id: "torn-neighbour-is-survivable",
    what: "one checkpoint is torn while another is intact",
    asks: "can the next lane still read the good one?",
    anchor: { file: "scripts/agent-checkpoint.mjs", contains: "validate(e.cp).length === 0" },
    async run(dir) {
      cp(dir, ["--session", "torn", "--start", "rewrite the seed", "--next", "regenerate the fixtures"]);
      cp(dir, ["--session", "intact", "--start", "split the dashboard client", "--next", "extract the stat tiles"]);
      tear(join(dir, "torn.json"));
      const show = cp(dir, ["--show"]);
      if (show.status !== 0) return "`checkpoint --show` exits non-zero next to a torn file — the briefing must fail open.";
      if (!/extract the stat tiles|split the dashboard client/.test(show.out)) {
        return "a torn neighbour took the readable handoff down with it: the intact checkpoint is not in the briefing.";
      }
      return null;
    },
  },
  {
    id: "no-next-step-is-visible",
    what: "a lane is killed after starting but before it recorded a next step",
    asks: "is that visible, or does it read like a handoff?",
    anchor: { file: "scripts/lib/agent-checkpoint-core.mjs", contains: "export function renderBriefing" },
    async run(dir) {
      await killMidSession(dir, { task: "unify the two Sklik clients", next: "" });
      const files = filesIn(dir);
      if (!files.length) return "the killed lane left no checkpoint at all.";
      const entry = readJson(join(dir, files[0]));
      if (!entry) return "the surviving checkpoint does not parse.";
      if (entry.next) return `a next step was invented (${JSON.stringify(entry.next)}) — nothing recorded one.`;
      const check = cp(dir, ["--check"]);
      if (check.status !== 0) {
        return "a checkpoint with no `next` fails the blocking gate. Unfinished work with no recorded next step is " +
          "the normal cost of a kill; it belongs in the briefing, not in a red build (ADR-0007).";
      }
      const show = cp(dir, ["--show"]);
      if (!/unify the two Sklik clients/.test(show.out)) {
        return "the briefing does not name the stopped task, so a run that recorded no next step leaves the next " +
          "lane with nothing at all — which is the worst case this whole mechanism exists to prevent.";
      }
      return null;
    },
  },
  {
    id: "commit-fold-never-invents",
    what: "an interrupted lane commits partial work with no checkpoint open",
    asks: "does the commit hook stay a no-op, or does it invent an interruption?",
    anchor: { file: "scripts/agent-checkpoint.mjs", contains: "must never CREATE one" },
    async run(dir) {
      const before = filesIn(dir).length;
      const res = cp(dir, ["--session", "nobody", "--commit"]);
      if (res.status !== 0) return "`checkpoint --commit` must fail open — it runs inside .husky/pre-commit.";
      const after = filesIn(dir).length;
      if (after !== before) {
        return "`--commit` created a checkpoint nobody opened. The next session start would report an interruption " +
          "that never happened, and a briefing that cries wolf stops being read.";
      }
      return null;
    },
  },
];

// --- run ---------------------------------------------------------------------
//
// Guarded, because test-unit/interrupt-census.test.mjs imports CATALOGUE to check
// its shape. A census that had to spawn and kill six processes to read a list
// would be the drill, and it would be in `check:ci`.

const SELF = fileURLToPath(import.meta.url);
const ENTRY = process.argv[1] ? resolve(process.argv[1]) : "";
const invokedDirectly = ENTRY === SELF || ENTRY.toLowerCase() === SELF.toLowerCase();

if (invokedDirectly) {
const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

if (LIST) {
  say(`Interruption drill — ${CATALOGUE.length} scenario(s)`);
  say("");
  for (const s of CATALOGUE) {
    say(`  ${s.id}`);
    say(`    what:   ${s.what}`);
    say(`    asks:   ${s.asks}`);
    say(`    anchor: ${s.anchor.file} · "${s.anchor.contains}"`);
    say("");
  }
  process.exit(0);
}

say(`Interruption drill — ${CATALOGUE.length} scenario(s), each against its own scratch checkpoint directory`);
say("");

const failures = [];
for (const scenario of CATALOGUE) {
  const dir = scratch();
  let finding = null;
  try {
    finding = await scenario.run(dir);
  } catch (err) {
    finding = `the scenario itself threw — ${err?.message ?? err}`;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* a scratch directory the OS is still holding is not a finding */
    }
  }
  if (finding) {
    failures.push({ id: scenario.id, finding });
    say(`  ✗ ${scenario.id} — ${scenario.asks}`);
    say(`      ${finding}`);
  } else {
    say(`  ✓ ${scenario.id} — ${scenario.asks}`);
  }
}

say("");
say(`${CATALOGUE.length - failures.length} of ${CATALOGUE.length} scenario(s) held.`);

if (failures.length) {
  say("");
  say("A killed lane does not leave the tree the next lane can resume from. The fix is in");
  say("scripts/agent-checkpoint.mjs or scripts/lib/agent-checkpoint-core.mjs — never in the scenario:");
  say("deleting the case that started failing is the cheapest green in this file, and the reason it has a");
  say("census (test-unit/interrupt-census.test.mjs) that blocks on every build.");
}

if (SUMMARY_FILE) {
  try {
    appendFileSync(SUMMARY_FILE, `### Interruption drill\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`);
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

process.exit(failures.length ? 1 : 0);
}
