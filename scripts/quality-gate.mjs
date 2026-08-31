#!/usr/bin/env node
/** Quality floor for the baked LLM scorecard (zero-dependency, no model calls).
 *
 *  `npm run llm:quality` is a benchmark: it spends real tokens, takes ~30 minutes,
 *  and has no assertions — it tells you which model writes the best output per
 *  operation. Nothing about that can run on a pull request. What CAN run on every
 *  pull request is a check over the result it BAKES into the app
 *  (src/lib/llm/quality-scores.ts), because that file is committed data and the
 *  same scores are the public surface at /kvalita-modelu.
 *
 *  That is the split this gate implements: the expensive judged run stays on
 *  demand, and the number it produces acquires a threshold.
 *
 *  A FLOOR IS NOT A BASELINE. The floor below says "not terrible" — it catches an
 *  operation collapsing to 6. It cannot catch what actually happens: `brief` going
 *  8.5 → 7.0 after a prompt edit, or every operation losing most of a point after a
 *  model swap, with the whole scorecard still above 6.5 and nothing red. So the
 *  scores the app ships with are RECORDED, per operation and per serving model, in
 *  test-llm/quality/baseline.json, and this gate compares the bake against them:
 *  per cell (maxDrop) and across the fleet (maxMeanDrop, which is the uniform-drift
 *  case no per-cell rule can see). Moving the baseline needs a reason and lands in
 *  test-llm/quality/CHANGELOG.md — same discipline as the prompt goldens, for the
 *  same reason: re-recording a number is how a regression gets absorbed.
 *
 *  AND A MODEL SWAP GOES RED ON THE SWAP. The baseline records which model each
 *  scorecard column was measured on AND where the app declares it
 *  (src/lib/llm/models.ts). Change the served model and this fails immediately,
 *  saying the recorded quality describes a model the app no longer serves — rather
 *  than staying green until somebody happens to spend 30 minutes on a fresh matrix.
 *
 *  Runs blocking in CI as part of `npm run check:ci`. Exit non-zero fails it.
 *
 *    BLOCKING — passes on the tree today (docs/adr/0007-gate-rung-discipline.md):
 *      • every operation the app SERVES scores at or above the floor;
 *      • no serving-model cell is marked invalid — a `valid: false` cell means the
 *        model's output failed that tool's own validator, i.e. production would
 *        have clamped or dropped it;
 *      • the scorecard actually contains the models the app serves with;
 *      • no baselined cell has fallen more than `maxDrop` below its recorded score,
 *        and the mean has not fallen more than `maxMeanDrop`;
 *      • the models the app declares it serves with are the ones the baseline was
 *        measured on.
 *
 *    REPORTING, ratcheted — does NOT pass today, so it prints and exits 0 unless a
 *    count rises above the baseline below:
 *      • operations in the tool registry with no baked score at all;
 *      • baked operations that no longer exist in the registry (a retired tool
 *        still shown on the public scorecard);
 *      • how old the measurement is.
 *
 *  Usage:
 *    node scripts/quality-gate.mjs            # report + enforce the floor
 *    node scripts/quality-gate.mjs --check    # same, and enforce the ratchet too
 *    node scripts/quality-gate.mjs --summary FILE
 *    node scripts/quality-gate.mjs --accept --reason "..."   # re-record the baseline
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { printRemedy } from "./gate-remedy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCORES = join(ROOT, "src", "lib", "llm", "quality-scores.ts");
const GOLDEN_DIR = join(ROOT, "test-llm", "golden");
const BASELINE = join(ROOT, "test-llm", "quality", "baseline.json");
const BASELINE_LOG = join(ROOT, "test-llm", "quality", "CHANGELOG.md");

/** The models the app actually serves with, and therefore the only columns whose
 *  score is a statement about what a user receives. Dev and the BYOM Anthropic
 *  default resolve to Claude Sonnet; production and the BYOM Gemini default
 *  resolve to Gemini Flash (src/lib/llm/index.ts, src/lib/llm/models.ts). The
 *  other columns in the scorecard are the comparison field — they inform BYOM
 *  recommendations and are deliberately NOT gated. */
const SERVING_MODELS = ["anthropic/claude-sonnet-5", "google/gemini-3.5-flash"];

/** Below this, the judge is not splitting hairs — at 6 and under its written
 *  issues are things like inventing figures the grounding block does not contain.
 *  Both serving columns sit at 7.0 or above on every baked operation today, so
 *  6.5 leaves one half-point of run-to-run variance and still fails a real drop.
 *  Raising it is a decision to make after a fresh full matrix, not a nudge. */
const FLOOR = 6.5;

/** Reporting-rung ratchet. Fix findings and lower these in the same commit;
 *  never raise them. Measured 2026-08-26 against the 2026-07-07 bake. */
const RATCHET = {
  /** registry tools with no baked score: ads-diagnosis, channel-research,
   *  local-diagnosis, monthly-recap, onboarding-scan, twin-reply, twin-style —
   *  plus `local-page` (W2-C, 2026-08-29) and `lp-variant-draft` (W3-B,
   *  2026-08-30), each the same +1 ads-diagnosis took in Wave 1: a tool lands with
   *  its contract golden, and its quality cells are measured on the next full
   *  `npm run llm:quality` bake. Lower this back to 6 when all three are baked;
   *  never raise it for anything else. */
  unbaked: 9,
  /** baked operations no longer in the registry: lead-reply (retired when the
   *  twin absorbed it). It is still on the public scorecard. */
  retired: 1,
  /** serving-model cells that are baked but carry no recorded baseline. Zero
   *  today and it should stay zero: a freshly baked operation is measured, so
   *  there is no reason not to record what it scored. Accept it with
   *  `npm run llm:quality:baseline -- --reason "..."`, which records every cell in
   *  the bake at once. */
  unbaselined: 0,
};

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const ACCEPT = argv.includes("--accept");
const summaryIdx = argv.indexOf("--summary");
const SUMMARY_FILE = summaryIdx !== -1 ? argv[summaryIdx + 1] : null;
const reasonIdx = argv.indexOf("--reason");
const REASON = reasonIdx !== -1 ? String(argv[reasonIdx + 1] ?? "").trim() : "";
/** The words people type to get past a prompt. Same list, same purpose, as
 *  scripts/llm-eval.mjs: a reason that says nothing is worse than none, because it
 *  looks like provenance in the ledger. */
const FILLER = new Set(["update", "updated", "fix", "fixed", "wip", "rebake", "re-bake", "bake", "new", "change", "changes", "improve", "improved", "n/a", "none", "."]);

// --- parse the baked scorecard ----------------------------------------------
// It is generated by scripts/bake-quality-scores.mjs as
// `export const QUALITY_SCORES: QualityScores = <JSON.stringify(data, null, 2)>;`
// so the object is exactly the text from the first `{` to the `};` at column 0.

if (!existsSync(SCORES)) {
  console.error(`✗ quality gate: ${SCORES} is missing.`);
  process.exit(1);
}

const raw = readFileSync(SCORES, "utf8");
const open = raw.indexOf("{", raw.indexOf("export const QUALITY_SCORES"));
const close = raw.indexOf("\n};", open);
if (open === -1 || close === -1) {
  console.error("✗ quality gate: could not find the QUALITY_SCORES object literal — was the generator changed?");
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw.slice(open, close + 2));
} catch (err) {
  console.error(`✗ quality gate: the baked scorecard is not parseable JSON — ${err.message}`);
  process.exit(1);
}

const cells = data.cells ?? {};
const models = data.models ?? [];
const operations = Object.keys(cells).sort();

const goldenIds = existsSync(GOLDEN_DIR)
  ? readdirSync(GOLDEN_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
  : [];

// --- the recorded baseline ---------------------------------------------------

if (!existsSync(BASELINE)) {
  console.error(
    `✗ quality gate: ${BASELINE} is missing. It is what says how good the output has to be; ` +
      'seed it with `npm run llm:quality:baseline -- --reason "..."` from the current bake.'
  );
  process.exit(1);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch (err) {
  console.error(`✗ quality gate: test-llm/quality/baseline.json is not parseable JSON — ${err.message}`);
  process.exit(1);
}

const baselineOps = baseline.operations ?? {};
const MAX_DROP = typeof baseline.maxDrop === "number" ? baseline.maxDrop : 1;
const MAX_MEAN_DROP = typeof baseline.maxMeanDrop === "number" ? baseline.maxMeanDrop : 0.35;

/** The model each scorecard column was measured on, and the line of source that
 *  declares the app still serves with it. Reading the declaration is the whole
 *  point: SERVING_MODELS above is this gate's opinion, and an opinion cannot
 *  notice a model swap. */
function declaredServingModels() {
  const found = [];
  for (const entry of baseline.serving ?? []) {
    const path = join(ROOT, entry.declaredBy?.file ?? "");
    if (!entry.declaredBy?.file || !existsSync(path)) {
      found.push({ ...entry, error: `${entry.declaredBy?.file ?? "(no file)"} does not exist` });
      continue;
    }
    let m = null;
    try {
      m = new RegExp(entry.declaredBy.pattern).exec(readFileSync(path, "utf8"));
    } catch (err) {
      found.push({ ...entry, error: `the pattern for ${entry.declaredBy.symbol} is not a valid regex — ${err.message}` });
      continue;
    }
    if (!m) {
      found.push({
        ...entry,
        error:
          `could not read ${entry.declaredBy.symbol} out of ${entry.declaredBy.file} — the declaration moved. ` +
          "Re-point `serving[].declaredBy.pattern` in test-llm/quality/baseline.json at where the served model is named now.",
      });
      continue;
    }
    found.push({ ...entry, declared: m[1] });
  }
  return found;
}

// --- --accept: re-record the baseline from the current bake -------------------

if (ACCEPT) {
  if (!REASON || REASON.length < 20 || FILLER.has(REASON.toLowerCase().replace(/[.!]$/, ""))) {
    console.error(
      '✗ `--reason "..."` is required, and has to say something: which operations moved and why that is ' +
        "the right trade. This number is the only thing standing between a quiet regression and a green build " +
        "(test-llm/quality/CHANGELOG.md)."
    );
    process.exit(1);
  }

  const nextOps = {};
  const rows = [];
  let sum = 0;
  let count = 0;
  for (const op of operations) {
    const row = {};
    for (const model of SERVING_MODELS) {
      const score = cells[op]?.[model]?.score;
      if (typeof score !== "number") continue;
      row[model] = score;
      sum += score;
      count += 1;
      const was = baselineOps[op]?.[model];
      if (was !== score) rows.push(`| ${op} | ${model} | ${was ?? "—"} | ${score} |`);
    }
    if (Object.keys(row).length) nextOps[op] = row;
  }
  const mean = count ? Math.round((sum / count) * 100) / 100 : 0;
  const today = new Date().toISOString().slice(0, 10);

  const next = {
    ...baseline,
    acceptedOn: today,
    acceptedReason: REASON,
    measuredAt: data.measuredAt ?? baseline.measuredAt,
    judge: data.judge ?? baseline.judge,
    mean,
    serving: declaredServingModels().map((s) => ({
      column: s.column,
      id: s.declared ?? s.id,
      declaredBy: s.declaredBy,
    })),
    operations: nextOps,
  };
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + "\n");

  const entry = [
    "",
    `## ${today} — baseline re-recorded`,
    "",
    REASON,
    "",
    `Measured ${next.measuredAt ?? "(unknown)"}, judge ${next.judge ?? "(unknown)"}. Mean across ${count} cells: ${mean}` +
      (typeof baseline.mean === "number" ? ` (was ${baseline.mean}).` : "."),
    "",
    ...(rows.length ? ["| operation | model | from | to |", "|---|---|---|---|", ...rows] : ["No cell changed value."]),
    "",
  ].join("\n");
  appendFileSync(BASELINE_LOG, entry);

  console.log(`✓ baseline re-recorded: ${count} cell(s), mean ${mean}, ${rows.length} moved.`);
  console.log("  Written to test-llm/quality/baseline.json and appended to test-llm/quality/CHANGELOG.md — commit both.");
  process.exit(0);
}

// --- checks -----------------------------------------------------------------

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

const blocking = [];

if (operations.length === 0) {
  blocking.push("the scorecard is empty — no matrix run has been baked in.");
}

for (const model of SERVING_MODELS) {
  if (!models.includes(model)) {
    blocking.push(
      `${model} is a model the app serves with, but the scorecard has no column for it. ` +
        "Either it stopped serving (update SERVING_MODELS in scripts/quality-gate.mjs) " +
        "or the last matrix run did not include it (re-run with it in LLM_QUALITY_TARGETS)."
    );
  }
}

const floorRows = [];
for (const op of operations) {
  for (const model of SERVING_MODELS) {
    const cell = cells[op]?.[model];
    if (!cell) continue; // absence is a coverage finding, below — not a floor failure
    floorRows.push({ op, model, score: cell.score, valid: cell.valid });
    if (typeof cell.score !== "number") {
      blocking.push(`${op} × ${model}: no score recorded.`);
    } else if (cell.score < FLOOR) {
      blocking.push(`${op} × ${model}: scored ${cell.score}, below the ${FLOOR} floor.`);
    }
    if (cell.valid === false) {
      blocking.push(
        `${op} × ${model}: the judged output FAILED the tool's own validator (valid: false) — ` +
          "production would clamp or drop it."
      );
    }
  }
}

// --- regression against the recorded baseline --------------------------------

const declared = declaredServingModels();
for (const s of declared) {
  if (s.error) {
    blocking.push(`baseline serving entry ${s.column}: ${s.error}`);
    continue;
  }
  if (s.declared !== s.id) {
    blocking.push(
      `the app now serves ${s.declared} where the baseline was measured on ${s.id} ` +
        `(${s.declaredBy.symbol} in ${s.declaredBy.file}). The scorecard and the baseline describe a model this ` +
        "app no longer runs. Re-run `npm run llm:quality`, bake it, and accept the new baseline with " +
        '`npm run llm:quality:baseline -- --reason "..."`.'
    );
  }
}

// The gate's own SERVING_MODELS and the baseline's columns are two statements of
// the same fact; letting them drift would make one of them decoration.
{
  const columns = (baseline.serving ?? []).map((s) => s.column).sort();
  const expected = [...SERVING_MODELS].sort();
  if (columns.join("|") !== expected.join("|")) {
    blocking.push(
      `test-llm/quality/baseline.json names serving columns [${columns.join(", ")}] but SERVING_MODELS in ` +
        `scripts/quality-gate.mjs says [${expected.join(", ")}]. One of them is out of date.`
    );
  }
}

const drops = [];
let baseSum = 0;
let nowSum = 0;
let compared = 0;
for (const [op, row] of Object.entries(baselineOps)) {
  for (const [model, was] of Object.entries(row)) {
    const now = cells[op]?.[model]?.score;
    if (typeof was !== "number") continue;
    if (typeof now !== "number") {
      blocking.push(
        `${op} × ${model} is baselined at ${was} but the bake has no score for it — an operation cannot ` +
          "disappear from measurement while it is still being served. Re-bake, or accept a baseline without it."
      );
      continue;
    }
    baseSum += was;
    nowSum += now;
    compared += 1;
    const delta = now - was;
    if (delta < 0) drops.push({ op, model, was, now, delta });
    if (was - now > MAX_DROP) {
      blocking.push(
        `${op} × ${model}: ${now}, down ${(was - now).toFixed(1)} from the baseline of ${was} (max drop ${MAX_DROP}). ` +
          "Something got worse for a user reading this output. Fix it, or accept the new number with a reason."
      );
    }
  }
}

const meanNow = compared ? nowSum / compared : 0;
const meanWas = compared ? baseSum / compared : 0;
if (compared && meanWas - meanNow > MAX_MEAN_DROP) {
  blocking.push(
    `the mean over ${compared} baselined cells fell to ${meanNow.toFixed(2)} from ${meanWas.toFixed(2)} ` +
      `(max mean drop ${MAX_MEAN_DROP}). No single cell had to fall far for this — which is the drift a ` +
      "per-cell threshold cannot see."
  );
}

const unbaselined = [];
for (const op of operations) {
  for (const model of SERVING_MODELS) {
    if (typeof cells[op]?.[model]?.score !== "number") continue;
    if (typeof baselineOps[op]?.[model] !== "number") unbaselined.push(`${op} × ${model}`);
  }
}

const unbaked = goldenIds.filter((id) => !operations.includes(id)).sort();
const retired = operations.filter((op) => !goldenIds.includes(op)).sort();

// --- report -----------------------------------------------------------------

say(`LLM quality gate — floor ${FLOOR}, serving models: ${SERVING_MODELS.join(", ")}`);
say(`  baked ${operations.length} operation(s) × ${models.length} model(s), measured ${data.measuredAt || "(unknown)"}, judge ${data.judge || "(unknown)"}`);
say("");

if (floorRows.length) {
  const worst = [...floorRows].sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 5);
  say("  lowest serving-model cells:");
  for (const r of worst) say(`    ${String(r.score).padEnd(5)} ${r.op} × ${r.model}${r.valid === false ? "  ⚠ invalid" : ""}`);
  say("");
}

say(
  `  baseline: ${Object.keys(baselineOps).length} operation(s), ${compared} cell(s) compared, accepted ` +
    `${baseline.acceptedOn || "(unknown)"} — max drop ${MAX_DROP} per cell, ${MAX_MEAN_DROP} on the mean`
);
say(`    mean now ${meanNow.toFixed(2)} vs baseline ${meanWas.toFixed(2)} (Δ ${(meanNow - meanWas).toFixed(2)})`);
for (const s of declared) {
  say(
    s.error
      ? `    ⚠ ${s.column}: ${s.error}`
      : `    ${s.column}: app declares ${s.declared} (${s.declaredBy.symbol})${s.declared === s.id ? "" : ` ✗ baseline measured ${s.id}`}`
  );
}
if (drops.length) {
  const worst = [...drops].sort((a, b) => a.delta - b.delta).slice(0, 5);
  say("    below baseline:");
  for (const d of worst) say(`      ${d.op} × ${d.model}: ${d.now} (was ${d.was}, ${d.delta.toFixed(1)})`);
} else {
  say("    no cell is below its recorded baseline.");
}
say("");

if (data.measuredAt) {
  const days = Math.floor((Date.now() - Date.parse(data.measuredAt)) / 86_400_000);
  if (Number.isFinite(days)) {
    say(`  measurement age: ${days} day(s)${days > 120 ? " — stale enough that the numbers describe a model line-up that has moved on" : ""}`);
    say("");
  }
}

let ratchetBroken = false;
const ratchetLine = (label, found, baseline, detail) => {
  const over = found > baseline;
  if (over) ratchetBroken = true;
  say(`  ${over ? "✗" : "•"} ${label}: ${found} (baseline ${baseline})${detail ? ` — ${detail}` : ""}`);
};

ratchetLine("registry tools with no baked score", unbaked.length, RATCHET.unbaked, unbaked.join(", ") || "none");
ratchetLine("baked operations no longer in the registry", retired.length, RATCHET.retired, retired.join(", ") || "none");
ratchetLine("baked serving cells with no recorded baseline", unbaselined.length, RATCHET.unbaselined, unbaselined.join(", ") || "none");

if (ratchetBroken) {
  say("");
  say("  A ratchet count rose. Bake the missing operations (`npm run llm:quality` then");
  say("  `npm run llm:quality:bake`) or lower the baseline in scripts/quality-gate.mjs.");
  say("  Never raise a baseline.");
}

if (blocking.length) {
  say("");
  say(`✗ ${blocking.length} quality floor failure(s):`);
  for (const b of blocking) say(`  • ${b}`);
  say("");
  say("  These are not advisory. A serving model below the floor, or producing output");
  say("  its own validator rejects, is a product defect on a surface users read.");
  printRemedy("llm:quality:check", say);
} else {
  say("");
  say(
    "✓ every serving-model cell is at or above the floor, no worse than its recorded baseline, still measured " +
      "on the model the app declares it serves with, and passes its tool's validator."
  );
}

if (SUMMARY_FILE) {
  try {
    appendFileSync(SUMMARY_FILE, `### LLM quality gate\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`);
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

if (blocking.length) process.exit(1);
if (CHECK && ratchetBroken) process.exit(1);
