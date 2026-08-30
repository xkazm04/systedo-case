#!/usr/bin/env node
/** Prompt COST budget for the LLM tool registry (zero-dependency, no model calls).
 *
 *  `npm run llm:gate:check` proves a prompt change still produces the right SHAPE,
 *  and `npm run llm:quality:check` proves it still produces good enough output.
 *  Neither of them can see what a change costs. A prompt that grows a grounding
 *  block from eight lines to eighty passes both gates, twice as expensive, and the
 *  first thing that notices is the provider's invoice — on a repo where the same
 *  operations run behind six crons and a per-IP spend ceiling.
 *
 *  This is the rung above them: the INPUT side of every registered operation is
 *  measured, recorded in test-llm/budget.json, and compared on every run.
 *
 *  WHAT IS MEASURED, AND WHY ONLY THIS. One request to the chokepoint carries three
 *  things the repository controls: the system prompt, the user prompt, and the JSON
 *  schema (a function-calling schema is billed as input like any other token). All
 *  three are committed data — `test-llm/registry.mjs` mirrors the production tool
 *  for exactly this reason — so the cost of a golden run is computable statically,
 *  offline and for free. The OUTPUT side is not budgeted here: nothing in the
 *  wrapper caps output tokens, its size is a property of the model rather than of
 *  the diff, and it is already gated on quality. Latency is not budgeted either —
 *  it cannot be measured without spending money, which would put this gate on the
 *  paid rung and out of `check:ci`.
 *
 *  CHARACTERS, NOT TOKENS. The recorded unit is characters, because a character
 *  count is exact and reproducible on any machine, and a token count is a claim
 *  about a tokenizer we do not run here. The token and USD figures printed
 *  alongside are ESTIMATES (see CHARS_PER_TOKEN) and exist to make the number mean
 *  something to a reader; nothing is enforced on them. Czech runs closer to 3.5
 *  characters per token than English, so the estimate is conservative-low — which
 *  is the honest direction for a figure nobody should quote as a bill.
 *
 *  Rung discipline (docs/adr/0007-gate-rung-discipline.md): BLOCKING, because it
 *  passes on the tree today.
 *
 *    • every registry tool has a recorded ceiling (a NEW AI operation has to record
 *      what it costs — the same discipline the golden and the quality bake already
 *      apply to its shape and its quality);
 *    • no tool's input exceeds its own ceiling;
 *    • the whole golden run does not exceed the run ceiling — the uniform-drift
 *      case no per-tool rule can see, where every prompt grows 15% and each one
 *      stays under its own line;
 *    • no ceiling is recorded for a tool that no longer exists.
 *
 *  WHEN IT FAILS, it fails the build rather than opening an issue. Master ships on
 *  push here (docs/deploy.md § Delivery contract), so an issue would be filed after
 *  the more expensive prompt was already serving. Crossing a budget deliberately is
 *  one command and a sentence:
 *
 *      npm run llm:budget -- --accept --reason "why this operation now costs more"
 *
 *  which re-records every ceiling from what is measured today and appends the reason
 *  to the file's own history. Re-recording a number is how a regression gets
 *  absorbed, so the reason is required and filler is refused — same rule as
 *  `npm run llm:eval:update`.
 *
 *  THE CEILINGS COMMITTED TODAY are deliberately loose: they were derived from a
 *  static upper bound on each entry (the byte span of its `system:`/`prompt:` block
 *  plus its golden's serialized schema), by an agent that could read the repository
 *  but not execute it. They are therefore ABOVE what this script measures, by
 *  roughly 20-50%, and they are honest about that rather than pretending to be a
 *  measurement. The first run of `--accept` replaces them with the measured figures
 *  plus MARGIN and the gate tightens to what it should have been.
 *
 *  Usage:
 *    node scripts/llm-budget.mjs                 # report: cost per tool + per run
 *    node scripts/llm-budget.mjs --check         # same, and fail on a breach
 *    node scripts/llm-budget.mjs --summary FILE  # append the report to a job summary
 *    node scripts/llm-budget.mjs --accept --reason "..."   # re-record the ceilings
 *
 *  Runs blocking inside `npm run check:ci` (as `npm run llm:budget:check`), which
 *  .husky/pre-push proves before any push to master.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LLM_TOOLS } from "../test-llm/registry.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUDGET_PATH = join(ROOT, "test-llm", "budget.json");

/** Rough characters-per-token for the estimate printed next to the enforced
 *  character counts. Czech with diacritics tokenizes worse than English on every
 *  BPE vocabulary in use here, so 4 understates the token count slightly. Nothing
 *  is enforced on the estimate — see the header. */
const CHARS_PER_TOKEN = 4;

/** Headroom `--accept` leaves above the measured value, and the step ceilings are
 *  rounded up to. 10% absorbs an ordinary wording edit; it does not absorb a
 *  grounding block that doubled, which is the change this gate exists to notice. */
const MARGIN = 1.1;
const STEP = 250;

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const ACCEPT = argv.includes("--accept");
const summaryIdx = argv.indexOf("--summary");
const SUMMARY_FILE = summaryIdx !== -1 ? argv[summaryIdx + 1] : null;
const reasonIdx = argv.indexOf("--reason");
const REASON = reasonIdx !== -1 ? String(argv[reasonIdx + 1] ?? "").trim() : "";

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

/** One measurement per registry tool. Everything here is committed data, so two
 *  machines that read the same commit get the same numbers. */
function measure(tool) {
  const systemChars = typeof tool.system === "string" ? tool.system.length : 0;
  const promptChars = typeof tool.prompt === "string" ? tool.prompt.length : 0;
  let schemaChars = 0;
  try {
    schemaChars = tool.schema ? JSON.stringify(tool.schema).length : 0;
  } catch {
    schemaChars = 0; // a schema that cannot be serialized cannot be sent either
  }
  return {
    id: tool.id,
    label: tool.label ?? tool.id,
    systemChars,
    promptChars,
    schemaChars,
    inputChars: systemChars + promptChars + schemaChars,
  };
}

const measured = LLM_TOOLS.map(measure).sort((a, b) => b.inputChars - a.inputChars);
const totalChars = measured.reduce((n, m) => n + m.inputChars, 0);
const tokens = (chars) => Math.ceil(chars / CHARS_PER_TOKEN);
const ceilTo = (n, step) => Math.ceil(n / step) * step;

if (!existsSync(BUDGET_PATH)) {
  console.error(
    `✗ llm budget: ${BUDGET_PATH} does not exist. It is the recorded cost of every registered operation — ` +
      "recreate it with `npm run llm:budget -- --accept --reason \"...\"`."
  );
  process.exit(1);
}

let budget;
try {
  budget = JSON.parse(readFileSync(BUDGET_PATH, "utf8"));
} catch (err) {
  console.error(`✗ llm budget: test-llm/budget.json is not valid JSON — ${err.message}`);
  process.exit(1);
}

const tools = budget.tools ?? {};
const rateInPerMTok = Number(budget.pricing?.inputUsdPerMTok);

// --- --accept: re-record every ceiling from what is measured today -----------

if (ACCEPT) {
  // Same rule as `npm run llm:eval:update`: a re-recorded number needs a reason a
  // reader can act on, because re-recording is how a regression stops being one.
  if (REASON.length < 20 || /^(update|fix|wip|chore|new baseline|re-?record)\.?$/i.test(REASON)) {
    console.error(
      "✗ llm budget: --accept needs --reason \"<what got more expensive and why that is right>\" — " +
        "at least a sentence. The reason is stored in the file's history and is the only record " +
        "of why an operation's cost moved."
    );
    process.exit(1);
  }
  const next = {
    ...budget,
    acceptedOn: new Date().toISOString().slice(0, 10),
    acceptedReason: REASON,
    charsPerTokenEstimate: CHARS_PER_TOKEN,
    run: { ...(budget.run ?? {}), maxInputChars: ceilTo(totalChars * MARGIN, STEP) },
    tools: Object.fromEntries(
      [...measured]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((m) => [
          m.id,
          {
            maxInputChars: ceilTo(m.inputChars * MARGIN, STEP),
            measuredChars: m.inputChars,
          },
        ])
    ),
    history: [
      ...(Array.isArray(budget.history) ? budget.history : []),
      {
        on: new Date().toISOString().slice(0, 10),
        totalInputChars: totalChars,
        tools: measured.length,
        reason: REASON,
      },
    ],
  };
  writeFileSync(BUDGET_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `✓ llm budget: re-recorded ${measured.length} ceiling(s) from ${totalChars} measured input characters ` +
      `(~${tokens(totalChars)} tokens per golden run). Commit test-llm/budget.json with the change it describes.`
  );
  process.exit(0);
}

// --- report ------------------------------------------------------------------

const violations = [];

say(`LLM prompt cost — ${measured.length} registered operation(s), input side only`);
say("");
say("  operation                  system  prompt  schema    input   ceiling");
for (const m of measured) {
  const entry = tools[m.id];
  const ceiling = Number(entry?.maxInputChars);
  const over = Number.isFinite(ceiling) && m.inputChars > ceiling;
  const mark = !entry ? "?" : over ? "✗" : " ";
  say(
    `  ${mark} ${m.id.padEnd(24)}${String(m.systemChars).padStart(6)}` +
      `${String(m.promptChars).padStart(8)}${String(m.schemaChars).padStart(8)}` +
      `${String(m.inputChars).padStart(9)}${(entry ? String(ceiling) : "—").padStart(10)}`
  );
  if (!entry) {
    violations.push(
      `"${m.id}" has no recorded cost ceiling. A new AI operation records what it costs, the same way it ` +
        "records its shape (a golden) and its quality (the bake): " +
        "`npm run llm:budget -- --accept --reason \"...\"`."
    );
  } else if (over) {
    violations.push(
      `"${m.id}" costs ${m.inputChars} input characters (~${tokens(m.inputChars)} tokens), over its ceiling of ` +
        `${ceiling}. Either the prompt grew more than it needed to, or the operation genuinely got bigger — ` +
        "in which case accept it with `npm run llm:budget -- --accept --reason \"...\"` and say so in the commit."
    );
  }
}

for (const id of Object.keys(tools)) {
  if (!measured.some((m) => m.id === id)) {
    violations.push(
      `test-llm/budget.json records a ceiling for "${id}", which is not in the tool registry any more. ` +
        "Delete the entry — a budget for an operation nobody can call is a number that can never go red."
    );
  }
}

const runCeiling = Number(budget.run?.maxInputChars);
const estUsd = Number.isFinite(rateInPerMTok) ? (tokens(totalChars) / 1_000_000) * rateInPerMTok : null;
say("");
say(
  `  one golden run: ${totalChars} input characters ≈ ${tokens(totalChars)} tokens` +
    (estUsd !== null ? ` ≈ $${estUsd.toFixed(4)} at the served flash rate` : "") +
    (Number.isFinite(runCeiling) ? ` (ceiling ${runCeiling})` : "")
);
if (Number.isFinite(runCeiling) && totalChars > runCeiling) {
  violations.push(
    `the whole golden run costs ${totalChars} input characters, over the run ceiling of ${runCeiling}. ` +
      "No single operation has to be over its own line for this to fire — it is the case where everything " +
      "grew a little, which is the one a per-operation rule cannot see."
  );
}

if (violations.length) {
  say("");
  say(`✗ ${violations.length} budget finding(s):`);
  for (const v of violations) say(`  • ${v}`);
} else {
  say("");
  say(
    "✓ llm budget: every registered operation is within its recorded input ceiling, and so is the run as a " +
      "whole. Quality says the output is good; this says the request did not quietly get more expensive."
  );
}

if (SUMMARY_FILE) {
  try {
    appendFileSync(SUMMARY_FILE, `### LLM prompt cost\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`);
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

if (violations.length && CHECK) process.exit(1);
