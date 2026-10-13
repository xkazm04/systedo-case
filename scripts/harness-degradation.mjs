#!/usr/bin/env node
/** The halves of this harness that can go MISSING rather than red — declared,
 *  announced, and drilled.
 *
 *  WHY THIS EXISTS. Two of the things that review a change here do not fail when
 *  they stop working; they stop being there. The rubric's judgment half (Part B,
 *  .github/workflows/agent-review.yml) runs only when ANTHROPIC_API_KEY is
 *  configured, and the real-model prove was retired from `check:ci` on 2026-08-05
 *  and now runs weekly with a provider key. Both are deliberate — a model's taste
 *  must not block a merge, and a release gate must not need money. Together they
 *  mean the harness can run at half strength while every build stays green, and
 *  the thing that notices is a person remembering to wonder.
 *
 *  A key expires without a commit, so it expires without a build. The only defence
 *  that does not depend on someone wondering is to make the ABSENCE itself an
 *  event: announced on the run that degraded, recorded where a trend is readable,
 *  and drilled — proven, by removing the key on purpose, that the announcement
 *  actually happens.
 *
 *  THREE MODES, and the middle one is the point:
 *
 *    --announce <id> --status ran|absent|auto
 *        What a workflow calls on BOTH sides of its `if [ -z "$KEY" ]`. When the
 *        capability did not run it emits a `::warning` check annotation (which
 *        GitHub attaches to the run and renders on the diff), a line in the job
 *        summary, and a row in a JSON status file the workflow uploads as an
 *        artifact. `auto` derives the answer from the environment: the env var
 *        named in `needs`, or `--configured true|false` when the caller must not
 *        be handed the secret itself (the weekly report is passed
 *        `secrets.X != ''`, never `secrets.X`).
 *
 *    --drill
 *        The rung. For every capability that announces, run the REAL announce path
 *        in a child process with its key deliberately removed from the environment,
 *        and assert the degradation is visible: exit 0 (a missing key is not a
 *        build failure), a `::warning` on stdout, a line in the summary, and an
 *        `absent` row in the status file. A drill that cannot produce those exits
 *        1. This runs offline, free, in `npm run test:unit`
 *        (test-unit/harness-degradation.test.mjs → check:ci → .husky/pre-push), and
 *        again weekly in .github/workflows/agent-review-history.yml, where its
 *        result is appended to the published trail issue with a date on it.
 *
 *    --check
 *        The anti-drift rule, and the answer to "which OTHER on-demand steps
 *        disappear rather than fail?": every `secrets.NAME` referenced by any
 *        workflow in this repository must belong to a declared capability below,
 *        which must say what its absence costs and how that absence becomes
 *        visible. Adding a key-gated step without declaring it is red. Nothing is
 *        grandfathered — the two capabilities that exist today are both declared.
 *
 *  REPORTING vs BLOCKING (docs/adr/0007-gate-rung-discipline.md): `--check` and
 *  `--drill` both pass today and both cost nothing, so they BLOCK, through the unit
 *  suite. The weekly run is reporting — it says whether the key is configured RIGHT
 *  NOW, which no offline check can know.
 *
 *  Usage:
 *    node scripts/harness-degradation.mjs                     # the table
 *    node scripts/harness-degradation.mjs --check
 *    node scripts/harness-degradation.mjs --drill [--out FILE] [--summary FILE]
 *    node scripts/harness-degradation.mjs --announce judgment-review --status auto \
 *      [--configured true|false] [--out harness-status.json] [--summary FILE]
 */
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);

/** Every capability of this harness that is CONDITIONAL on a secret — i.e. every
 *  one whose failure mode is silence rather than a red build.
 *
 *  needs        — the secret it is conditional on. `--check` requires that every
 *                 `secrets.NAME` in every workflow appears here.
 *  absent       — what is NOT happening while the key is missing. One sentence,
 *                 in the terms a maintainer cares about, because this is the text
 *                 the annotation carries.
 *  visible      — how the absence is meant to be noticed. Asserted, not asserted
 *                 about: `--drill` for the announcing ones, `--check` for the rest.
 *  announces    — true when the workflow calls `--announce` on both branches;
 *                 false when the capability records its own skip, in which case
 *                 `recordedBy` + `marker` say where that is and what it looks like.
 */
export const CAPABILITIES = [
  {
    id: "judgment-review",
    name: "Agent review — Part B (the judgment half)",
    needs: "ANTHROPIC_API_KEY",
    workflow: ".github/workflows/agent-review.yml",
    absent:
      "no model reads this diff — only Part A's five mechanical invariants do, so every judgment-half finding " +
      "(altitude, naming, whether a gate was fixed or absorbed) goes unmade on a repository where ~97% of commits " +
      "are written by an agent.",
    visible:
      "a ::warning annotation on the run, a line in the job summary, and an `absent` row in harness-status.json — " +
      "uploaded as a 90-day artifact and reported weekly into the review's trail issue.",
    announces: true,
  },
  {
    id: "llm-drift",
    name: "Weekly real-model prove (every registered LLM operation)",
    needs: "GEMINI_API_KEY",
    workflow: ".github/workflows/llm-drift.yml",
    absent:
      "no registered operation is proven against a real provider this week; the chokepoint serves its " +
      "deterministic demo, which is a product property and therefore looks exactly like success.",
    visible:
      "scripts/llm-drift.mjs writes `status: \"skipped\"` with the reason instead of a green it did not earn, and " +
      "the weekly trail issue carries that row with its date.",
    announces: false,
    recordedBy: "scripts/llm-drift.mjs",
    marker: 'status: "skipped"',
  },
  {
    id: "issue-dispatch",
    name: "Issue → draft pull request (the front of the loop)",
    needs: "ANTHROPIC_API_KEY",
    workflow: ".github/workflows/issue-dispatch.yml",
    absent:
      "a labelled issue produces no draft, so the weekly pass goes back to starting from a description rather " +
      "than a diff — and the label looks applied, the workflow looks green, and nothing says the proposal was " +
      "never asked for.",
    visible:
      "a ::warning annotation on the run, a line in the job summary, and an `absent` row in harness-status.json, " +
      "kept as a 90-day artifact next to the proposal that was not made.",
    announces: true,
  },
  {
    id: "model-candidate",
    name: "Weekly candidate-model rehearsal (would the NEXT model still hold?)",
    needs: "GEMINI_API_KEY",
    workflow: ".github/workflows/llm-drift.yml",
    absent:
      "the successor declared in test-llm/model-candidates.json is not rehearsed this week, so the next time " +
      "GEMINI_MODEL moves the first evidence about the new model is production — which is the arrangement this " +
      "rehearsal exists to replace, and it looks identical to a week where the candidate passed.",
    visible:
      "scripts/llm-candidate.mjs writes `status: \"skipped\"` with the key it needed named in the reason, kept as " +
      "a 90-day artifact next to the drift verdict, instead of a green it did not earn.",
    announces: false,
    recordedBy: "scripts/llm-candidate.mjs",
    marker: 'status: "skipped"',
  },
  {
    id: "injection-drill",
    name: "Weekly prompt-injection refusal drill (the review's judgment half)",
    needs: "ANTHROPIC_API_KEY",
    workflow: ".github/workflows/llm-drift.yml",
    absent:
      "no model is asked whether it still honours the fence around untrusted repository text, so the only thing " +
      "standing between a commit message that gives the reviewer orders and a review that follows them is a " +
      "containment proof about the prompt — which cannot see the model change its mind.",
    visible:
      "a ::warning annotation on the weekly run, a line in the job summary, an `absent` row in " +
      "harness-status.json, and a `skipped` verdict in injection-drill.json — both kept as 90-day artifacts.",
    announces: true,
  },
];

export const capabilityFor = (id) => CAPABILITIES.find((c) => c.id === id) ?? null;

// --- argv --------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
};
const CHECK = argv.includes("--check");
const DRILL = argv.includes("--drill");
const ANNOUNCE = flag("--announce");
const STATUS = flag("--status") ?? "auto";
const CONFIGURED = flag("--configured");
const OUT = flag("--out");
const SUMMARY = flag("--summary");
const WF_DIR = flag("--workflows") ?? join(ROOT, ".github", "workflows");

/** Is this capability's key configured where we are running?
 *
 *  `HAS_<SECRET>` is the answer WITHOUT the secret: a workflow that only needs to
 *  report presence binds `${{ secrets.X != '' }}` rather than `${{ secrets.X }}`,
 *  so the weekly report can say "the key is there" in a job that was never handed
 *  it. Falls back to the variable itself, which is what the workflow that actually
 *  USES the key has in its environment. */
export const isConfigured = (cap, env = process.env) => {
  const hint = env[`HAS_${cap.needs}`];
  if (hint !== undefined && hint !== "") return hint === "true";
  return Boolean(env[cap.needs]);
};

const appendTo = (file, text) => {
  if (!file) return;
  try {
    appendFileSync(file, text);
  } catch (err) {
    console.error(`(could not write ${file}: ${err.message})`);
  }
};

// --- --announce: make the absence an event -----------------------------------

/** Merge one capability's verdict into the status file. Kept as a merge rather
 *  than a write so several capabilities can report into one artifact. */
function recordStatus(file, record) {
  if (!file) return;
  let doc = { schema: 1, capabilities: {} };
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (parsed && typeof parsed === "object" && parsed.capabilities) doc = parsed;
    } catch {
      /* an unreadable status file is replaced, not inherited */
    }
  }
  doc.capabilities[record.capability] = record;
  doc.recordedAt = record.at;
  writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
}

function announce(id, status, { out = OUT, summary = SUMMARY } = {}) {
  const cap = capabilityFor(id);
  if (!cap) {
    console.error(`✗ harness: no capability called \`${id}\`. Declared: ${CAPABILITIES.map((c) => c.id).join(", ")}.`);
    return 1;
  }
  let resolved = status;
  if (status === "auto") {
    const configured = CONFIGURED !== null ? CONFIGURED === "true" : isConfigured(cap);
    resolved = configured ? "ran" : "absent";
  }
  if (!["ran", "absent"].includes(resolved)) {
    console.error(`✗ harness: --status must be ran, absent or auto (got \`${status}\`).`);
    return 1;
  }

  const record = {
    capability: cap.id,
    name: cap.name,
    status: resolved,
    needs: cap.needs,
    workflow: cap.workflow,
    at: new Date().toISOString(),
    run: process.env.GITHUB_RUN_ID ?? null,
    absent: resolved === "absent" ? cap.absent : null,
  };

  if (resolved === "absent") {
    // A check annotation: attached to the run and to the commit, so the
    // degradation is on the same surface as a finding rather than in a log line
    // somebody would have to go looking for.
    console.log(
      `::warning title=Harness degraded — ${cap.name}::${cap.needs} is not configured, so this half of the ` +
        `harness did not run. ${cap.absent}`
    );
    appendTo(
      summary,
      `\n### ⚠ Harness degraded — ${cap.name}\n\n` +
        `\`${cap.needs}\` is not configured, so this half of the harness did not run.\n\n` +
        `**What is not happening:** ${cap.absent}\n\n` +
        `**How this is meant to be visible:** ${cap.visible}\n`
    );
  } else {
    console.log(`::notice title=Harness at full strength::${cap.name} ran (${cap.needs} is configured).`);
    appendTo(summary, `\n${cap.name}: ran (\`${cap.needs}\` configured).\n`);
  }

  recordStatus(out, record);
  return 0;
}

// --- --drill: remove the key on purpose and watch for the sound ---------------

/** Run the real announce path with the capability's key deliberately removed, and
 *  assert every promised signal actually appears. Returns a result row. */
export function drillOne(cap) {
  const dir = mkdtempSync(join(tmpdir(), "harness-drill-"));
  const statusFile = join(dir, "harness-status.json");
  const summaryFile = join(dir, "summary.md");
  writeFileSync(summaryFile, "");

  const env = { ...process.env };
  delete env[cap.needs]; // the drill: the key is gone, on purpose
  delete env[`HAS_${cap.needs}`]; // …and so is the hint that would answer for it
  delete env.GITHUB_RUN_ID;

  const res = spawnSync(
    process.execPath,
    [SELF, "--announce", cap.id, "--status", "auto", "--out", statusFile, "--summary", summaryFile],
    { cwd: ROOT, encoding: "utf8", env }
  );

  const stdout = `${res.stdout ?? ""}`;
  const summary = existsSync(summaryFile) ? readFileSync(summaryFile, "utf8") : "";
  let recorded = null;
  try {
    recorded = JSON.parse(readFileSync(statusFile, "utf8"))?.capabilities?.[cap.id] ?? null;
  } catch {
    recorded = null;
  }

  const failures = [];
  if (res.status !== 0) {
    failures.push(`the announce path exited ${res.status} — a missing key must degrade, not fail the build.`);
  }
  if (!stdout.includes("::warning")) {
    failures.push("no `::warning` annotation was emitted, so the degradation leaves no mark on the run.");
  }
  if (!stdout.includes(cap.needs)) failures.push(`the annotation does not name \`${cap.needs}\`.`);
  if (!summary.includes("Harness degraded")) failures.push("nothing was written to the job summary.");
  if (!recorded || recorded.status !== "absent") {
    failures.push("no `absent` row was recorded in the status file, so nothing outlives the run.");
  }

  return { capability: cap.id, name: cap.name, needs: cap.needs, ok: failures.length === 0, failures };
}

function drill() {
  const rows = CAPABILITIES.filter((c) => c.announces).map(drillOne);
  const at = new Date().toISOString().slice(0, 10);
  const lines = [];
  const say = (s = "") => {
    lines.push(s);
    console.log(s);
  };

  say(`Harness degradation drill — ${at}`);
  say("");
  say("The key is removed on purpose and the announcement is watched for. A green row means the absence of");
  say("that half of the harness would be SEEN; a red row means it would be silent.");
  say("");
  for (const row of rows) {
    say(`  ${row.ok ? "✓" : "✗"} ${row.capability} (${row.needs}) — ${row.name}`);
    for (const f of row.failures) say(`      • ${f}`);
  }

  // The live half: what is actually configured on the machine running this. In a
  // workflow this is fed `secrets.X != ''` via --configured, so the report can say
  // "the key is there" without the key ever being handed to the job.
  say("");
  say("Configured right now (the drill proves the alarm works; this says whether it is ringing):");
  for (const cap of CAPABILITIES) {
    const live = isConfigured(cap);
    say(`  ${live ? "•" : "⚠"} ${cap.needs}: ${live ? "configured" : "NOT configured — " + cap.absent}`);
  }

  const failed = rows.filter((r) => !r.ok);
  if (failed.length) {
    say("");
    say(`✗ ${failed.length} capability/capabilities can go missing without a sound.`);
    say("  Fix the announce path in scripts/harness-degradation.mjs, or the workflow that calls it.");
  }

  if (OUT) {
    const md = [
      "## Harness degradation drill",
      "",
      `_Ran ${at}. The keys are removed on purpose; a ✓ means the absence would be announced._`,
      "",
      ...rows.map((r) => `- ${r.ok ? "✓" : "✗"} \`${r.capability}\` (\`${r.needs}\`) — ${r.name}`),
      "",
      ...CAPABILITIES.map((cap) => {
        const live = isConfigured(cap);
        return `- \`${cap.needs}\`: **${live ? "configured" : "NOT configured"}**${live ? "" : " — " + cap.absent}`;
      }),
      "",
    ].join("\n");
    try {
      writeFileSync(OUT, md);
    } catch (err) {
      console.error(`(could not write ${OUT}: ${err.message})`);
    }
  }
  appendTo(SUMMARY, `\n${lines.join("\n")}\n`);

  return failed.length ? 1 : 0;
}

// --- --check: nothing key-gated lands undeclared ------------------------------

function check() {
  const problems = [];

  if (!existsSync(WF_DIR)) {
    console.error(`✗ harness: ${WF_DIR} does not exist.`);
    return 1;
  }
  const files = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));
  const declared = new Set(CAPABILITIES.map((c) => c.needs));

  // R1 — every secret a workflow reaches for belongs to a declared capability.
  //      Comment lines are skipped, the same way scripts/actions-pin.mjs skips them:
  //      these workflows explain their own key handling in prose that names it, and
  //      a sentence about a secret is not a use of one.
  for (const name of files) {
    const text = readFileSync(join(WF_DIR, name), "utf8")
      .split(/\r?\n/)
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");
    for (const m of text.matchAll(/secrets\.([A-Z0-9_]+)/g)) {
      if (declared.has(m[1])) continue;
      problems.push(
        `${name}: uses \`secrets.${m[1]}\` and no capability in scripts/harness-degradation.mjs declares it. ` +
          "A step conditional on a secret does not fail when the secret goes away — it stops running. Declare it " +
          "here with what its absence costs and how that absence becomes visible."
      );
    }
  }

  for (const cap of CAPABILITIES) {
    // R4 — a declaration that says nothing is not a declaration.
    if (String(cap.absent ?? "").length < 40) problems.push(`${cap.id}: \`absent\` must say what stops happening.`);
    if (String(cap.visible ?? "").length < 40) problems.push(`${cap.id}: \`visible\` must say how the absence is seen.`);

    if (cap.announces) {
      // R2 — the workflow actually calls the announce path.
      // Comments stripped here for the opposite reason to R1: a workflow that only
      // MENTIONS the announce call in prose must not satisfy the rule.
      const wf = join(ROOT, cap.workflow);
      const text = existsSync(wf)
        ? readFileSync(wf, "utf8")
            .split(/\r?\n/)
            .filter((l) => !/^\s*#/.test(l))
            .join("\n")
        : "";
      if (!text) {
        problems.push(`${cap.id}: names ${cap.workflow}, which does not exist.`);
      } else if (!text.includes(`harness-degradation.mjs --announce ${cap.id}`)) {
        problems.push(
          `${cap.id}: ${cap.workflow} never calls \`harness-degradation.mjs --announce ${cap.id}\`, so the ` +
            "capability can stop running without emitting anything. The call belongs on BOTH sides of the " +
            "`if [ -z \"$KEY\" ]`, so a run says which strength it ran at either way."
        );
      }
    } else {
      // R3 — or it records its own skip, where the declaration says it does.
      const path = join(ROOT, cap.recordedBy ?? "");
      if (!cap.recordedBy || !existsSync(path)) {
        problems.push(`${cap.id}: does not announce and names no \`recordedBy\` that exists.`);
      } else if (!readFileSync(path, "utf8").includes(cap.marker ?? " ")) {
        problems.push(
          `${cap.id}: ${cap.recordedBy} no longer contains \`${cap.marker}\` — the skip it was trusted to record ` +
            "for itself may have become a silent green."
        );
      }
    }
  }

  console.log(`Harness degradation — ${CAPABILITIES.length} conditional capability/capabilities, ${files.length} workflow(s)`);
  console.log("");
  for (const cap of CAPABILITIES) {
    console.log(`  ${cap.id}  (needs ${cap.needs})  ${cap.announces ? "announces" : `records itself (${cap.recordedBy})`}`);
  }

  if (problems.length) {
    console.error("");
    console.error(`✗ ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error("");
    console.error("  → what to do next (`harness degradation`):");
    console.error("      node scripts/harness-degradation.mjs            # the declared capabilities");
    console.error("      node scripts/harness-degradation.mjs --drill    # remove the keys and watch for the alarm");
    console.error("      Declare the new key-gated step in CAPABILITIES, and call `--announce <id>` on both");
    console.error("      branches of the step's `if [ -z \"$KEY\" ]`.");
    return 1;
  }
  console.log("");
  console.log("✓ every key-gated step is declared, and each one announces its own absence.");
  return 0;
}

// --- CLI ---------------------------------------------------------------------

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(SELF);

if (invokedDirectly) {
  let code = 0;
  if (ANNOUNCE) code = announce(ANNOUNCE, STATUS);
  else if (DRILL) code = drill();
  else if (CHECK) code = check();
  else {
    console.log("Conditional halves of this harness — the ones that go missing rather than red.\n");
    for (const cap of CAPABILITIES) {
      console.log(`${cap.id}  [needs ${cap.needs}]`);
      console.log(`  ${cap.name}`);
      console.log(`  without it: ${cap.absent}`);
      console.log(`  visible as: ${cap.visible}`);
      console.log("");
    }
    console.log("--check  every key-gated step is declared · --drill  the alarm is proven by removing the key");
  }
  process.exit(code);
}
