#!/usr/bin/env node
/** Would the NEXT model still hold? — the candidate rehearsal.
 *
 *  WHY THIS EXISTS. Every proof this harness keeps is about the model being served
 *  today. The contract goldens pin each tool's prompt and schema against it; the
 *  quality bake pins how good its answers were; `test-llm/budget.json` pins what its
 *  prompts cost; `test-llm/model-pins.json` pins which model all of that was true of;
 *  and `npm run llm:drift` re-proves, weekly, that today's model still answers. Not
 *  one of them can be pointed at a model the app does not yet serve.
 *
 *  So the swap was the experiment. `GEMINI_MODEL` moves in src/lib/llm/models.ts, the
 *  whole corpus silently re-points, and the first evidence about the new model is
 *  production. A model upgrade is the dependency most likely to change behaviour
 *  without changing a line of code here, and it was the only dependency in this
 *  repository with no rehearsal at all.
 *
 *  WHAT IT DOES. For every candidate declared in `test-llm/model-candidates.json` it
 *  runs every registered operation on its own tier through the REAL wrapper —
 *  injected via the BYOM context, exactly the way `npm run llm:quality` benchmarks a
 *  roster, so the app's own prompt, schema, extraction rungs and validators are the
 *  ones exercised. Three questions per operation, the same three `llm:drift` asks of
 *  the serving model:
 *
 *    • did the CANDIDATE answer (`meta.demo === false` and `meta.model` is the
 *      candidate), or did the wrapper fall back to something else;
 *    • does the parsed result still pass the tool's own validator — the shape
 *      contract, from the registry, unchanged;
 *    • and at what cost and latency, recorded for the swap decision rather than
 *      gated on.
 *
 *  A shape failure is the FINDING, not the bug: the answer is "do not swap yet", or
 *  "accept the new shape on purpose" (`npm run llm:eval:update -- --reason "…"`).
 *  It is never a looser validator.
 *
 *  NO KEY IS NOT A FAILURE. Like the drift prove, a run with nothing configured
 *  writes `status: "skipped"` with the reason and exits 0 — a record that is
 *  permanently red is a record nobody reads, and the capability is declared in
 *  scripts/harness-degradation.mjs (`model-candidate`) so the absence is countable.
 *
 *  AMBER: this spends money against a real provider (AGENTS.md § Amber). It is
 *  deliberately NOT in `check:ci` and never will be. It runs weekly in
 *  .github/workflows/llm-drift.yml, next to the drift prove it complements — that one
 *  asks whether today's model still holds, this one asks whether tomorrow's would.
 *  The blocking half is committed data: test-unit/model-candidate-census.test.mjs
 *  fails when a candidate row stops describing the model surface it claims, which is
 *  what stops this rehearsing a swap that already happened.
 *
 *  Usage:
 *    npm run llm:candidate                          # rehearse every candidate
 *    npm run llm:candidate -- --path gemini.fast    # just one
 *    npm run llm:candidate -- --out candidate.json --summary "$GITHUB_STEP_SUMMARY"
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { generateStructured } from "../src/lib/llm/index.ts";
import { runWithByomContext } from "../src/lib/llm/byom-context.ts";
import { LLM_TOOLS } from "../test-llm/registry.mjs";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const OUT_FILE = arg("--out");
const SUMMARY_FILE = arg("--summary");
const ONLY = arg("--path");

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

const spec = JSON.parse(readFileSync(new URL("../test-llm/model-candidates.json", import.meta.url), "utf8"));
const candidates = (spec.candidates ?? []).filter((c) => !ONLY || c.path === ONLY);
const awaitingCandidates = (spec.awaitingCandidates ?? []).filter((c) => !ONLY || c.path === ONLY);

if (ONLY && !candidates.length && !awaitingCandidates.length) {
  const known = [...(spec.candidates ?? []), ...(spec.awaitingCandidates ?? [])].map((c) => c.path).join(", ");
  console.error(`llm candidate: no candidate surface called "${ONLY}". Known: ${known}.`);
  process.exit(1);
}

const measuredAt = new Date().toISOString();

function write(verdict) {
  if (!OUT_FILE) return;
  try {
    writeFileSync(OUT_FILE, `${JSON.stringify(verdict, null, 2)}\n`);
  } catch (err) {
    console.error(`(could not write ${OUT_FILE}: ${err.message})`);
  }
}

function publish() {
  if (!SUMMARY_FILE) return;
  try {
    appendFileSync(SUMMARY_FILE, `### Candidate-model rehearsal\n\n${out.join("\n")}\n`);
  } catch (err) {
    console.error(`(could not write the summary: ${err.message})`);
  }
}

for (const pending of awaitingCandidates) {
  say(`  ${pending.path}: awaiting a successor to ${pending.serving} (checked ${pending.checkedOn}).`);
}
if (awaitingCandidates.length) say("");

if (ONLY && !candidates.length) {
  say("llm candidate: no announced successor can be rehearsed for this surface, so nothing is claimed.");
  publish();
  write({ schema: 1, status: "awaiting-candidate", measuredAt, candidates: [], awaitingCandidates });
  process.exit(0);
}

/** Which candidates can actually be rehearsed — one with no key configured is a
 *  `skipped`, named, rather than a silent absence. */
const runnable = candidates.filter((c) => String(process.env[c.keyEnv] ?? "").trim() !== "");
const unkeyed = candidates.filter((c) => !runnable.includes(c));

if (!runnable.length) {
  const needs = [...new Set(candidates.map((c) => c.keyEnv))].join(", ");
  say(`llm candidate: no key configured (${needs}) — nothing can be rehearsed, so nothing is claimed.`);
  say('           (This is a `skipped`, not a pass: a rehearsal that did not run proves nothing about the swap.)');
  publish();
  write({ schema: 1, status: "skipped", reason: `no key configured (${needs})`, measuredAt, candidates: [], awaitingCandidates });
  process.exit(0);
}

say(`Candidate rehearsal — ${runnable.length} candidate model(s) over ${LLM_TOOLS.length} registered operation(s).`);
for (const c of unkeyed) say(`  · ${c.path}: skipped, ${c.keyEnv} is not configured.`);
say("");

const results = [];

for (const c of runnable) {
  const tools = LLM_TOOLS.filter((t) => (t.tier ?? "quality") === c.tier);
  say(`  ${c.path}: ${c.serving} → ${c.candidate}  (${tools.length} operation(s) on the \`${c.tier}\` tier)`);

  const rows = [];
  for (const tool of tools) {
    let res = null;
    let error = null;
    try {
      res = await runWithByomContext(
        {
          vendor: c.vendor,
          apiKey: process.env[c.keyEnv],
          model: c.candidate,
          fastModel: c.candidate,
          reasoning: "default",
        },
        () =>
          generateStructured({
            id: tool.id,
            system: tool.system,
            prompt: tool.prompt,
            schema: tool.schema,
            tier: tool.tier,
            normalize: (parsed) => parsed,
            demo: () => ({ __demo: true }),
          })
      );
    } catch (err) {
      error = err?.message ?? String(err);
    }

    const served = Boolean(res) && res.meta.demo === false && res.meta.model === c.candidate;
    const valid = served ? Boolean(tool.validate(res.result)) : false;
    const row = {
      tool: tool.id,
      served,
      valid,
      model: res?.meta?.model ?? null,
      tookMs: res?.meta?.tookMs ?? null,
      estCostUsd: res?.meta?.estCostUsd ?? null,
      error,
    };
    rows.push(row);

    const why = served
      ? valid
        ? "ok"
        : "the result no longer passes the tool's validator"
      : error
        ? `error: ${error}`
        : `served by ${row.model ?? "the demo"}, expected ${c.candidate}`;
    say(`    ${served && valid ? "✓" : "✗"} ${tool.id}${served && valid ? "" : `  — ${why}`}`);
  }

  const unserved = rows.filter((r) => !r.served).length;
  const shapeFailures = rows.filter((r) => r.served && !r.valid).length;
  results.push({ ...c, total: rows.length, unserved, shapeFailures, tools: rows });
  say("");
}

const totalShapeFailures = results.reduce((n, r) => n + r.shapeFailures, 0);
const totalUnserved = results.reduce((n, r) => n + r.unserved, 0);
const ceiling = spec.acceptance?.maxShapeFailures ?? 0;

say("| Candidate | Serving now | Operations | Not served | Shape failures |");
say("| --- | --- | ---: | ---: | ---: |");
for (const r of results) {
  say(
    `| \`${r.candidate}\` | \`${r.serving}\` | ${r.total} | ${r.unserved || "0"} | ` +
      `${r.shapeFailures ? `**${r.shapeFailures}**` : "0"} |`
  );
}
say("");
for (const line of spec.cannotSee ?? []) say(`  · this rehearsal does not cover: ${line}`);
say("");

const status = totalShapeFailures > ceiling ? "fail" : "pass";
write({
  schema: 1,
  status,
  measuredAt,
  maxShapeFailures: ceiling,
  shapeFailures: totalShapeFailures,
  unserved: totalUnserved,
  candidates: results,
  awaitingCandidates,
});
publish();

if (totalUnserved) {
  console.log(
    `  ⚠ ${totalUnserved} operation(s) were not served by the candidate at all — a wrong model id, a model the ` +
      "key cannot reach, or a provider fallback. That is a fact about the rehearsal, not about the swap."
  );
}

if (totalShapeFailures > ceiling) {
  console.error("");
  console.error(
    `✗ candidate rehearsal: ${totalShapeFailures} operation(s) answered in a shape the tool's own validator ` +
      `refuses (ceiling ${ceiling}). Swapping to this model today would ship those.`
  );
  console.error("");
  console.error("  The finding is the model, not the validator. Two honest answers, and loosening is neither:");
  console.error("    · do not swap yet — record the date and the model in the commit that decides;");
  console.error('    · accept the new shape ON PURPOSE: npm run llm:eval:update -- --reason "…"');
  console.error("");
  console.error("  Then, in the same diff as the swap: npm run llm:models -- --accept --reason \"…\"");
  console.error("");
  process.exit(1);
}

console.log(
  `✓ candidate rehearsal: every operation still answers in shape on ${results.map((r) => r.candidate).join(", ")}. ` +
    "That is a shape verdict, not a quality one — npm run llm:quality is what says whether it is as good."
);
process.exit(0);
