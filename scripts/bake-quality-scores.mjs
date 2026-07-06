#!/usr/bin/env node
/** Bake the latest (or a given) `npm run llm:quality` report JSON into
 *  src/lib/llm/quality-scores.ts — the measured scores the BYOM UI reads.
 *
 *  Usage:  node scripts/bake-quality-scores.mjs [path/to/report.json]
 *          npm run llm:quality:bake
 *
 *  Generated file — re-run after a fresh matrix; don't hand-edit the output. */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const REPORTS = join(ROOT, "test-llm", "quality", "reports");
const OUT = join(ROOT, "src", "lib", "llm", "quality-scores.ts");

function latestReport() {
  if (!existsSync(REPORTS)) return null;
  const files = readdirSync(REPORTS)
    .filter((f) => f.startsWith("quality-") && f.endsWith(".json"))
    .sort();
  return files.length ? join(REPORTS, files[files.length - 1]) : null;
}

const path = process.argv[2] ? join(ROOT, process.argv[2]) : latestReport();
if (!path || !existsSync(path)) {
  console.error("✗ No report JSON found — run `npm run llm:quality` first (or pass a path).");
  process.exit(1);
}

const report = JSON.parse(readFileSync(path, "utf8"));
const round = (n) => Math.round(Number(n) * 10) / 10;

const cells = {};
const measured = new Set();
const judgeCounts = new Set();
for (const r of report.results ?? []) {
  if (!r.served || !r.judge?.judged) continue;
  const j = r.judge;
  const n = Number(j.judges ?? 1);
  judgeCounts.add(n);
  (cells[r.tool] ??= {})[r.target] = {
    relevance: round(j.relevance),
    correctness: round(j.correctness),
    adherence: round(j.adherence),
    tone: round(j.tone),
    score: round(j.score),
    valid: Boolean(r.valid),
    judges: n,
  };
  measured.add(r.target);
}

// Honest judge label: "medián ze 3" only if every cell used 3 judges; otherwise
// (a quota-limited re-judge mixes counts) just name the judge model.
const uniform = judgeCounts.size === 1 ? [...judgeCounts][0] : null;
const judgeLabel =
  uniform && uniform > 1 ? `claude-sonnet (medián ze ${uniform})` : "claude-sonnet";

// Preserve the report's target order, but only models actually measured (a model
// that never served has no cells and shouldn't appear in the scorecard).
const models = (report.targets ?? []).filter((m) => measured.has(m));

const data = {
  measuredAt: report.at ?? "",
  judge: judgeLabel,
  models,
  cells,
};

const provenance = models.length ? `Baked from a run at ${report.at}.` : "Empty until the first run is baked.";
const body = `/** Measured LLM quality scores — the output of \`npm run llm:quality\` baked into
 *  the app by \`scripts/bake-quality-scores.mjs\`. This is generated data; re-bake
 *  it (don't hand-edit) after a fresh matrix run. See docs/testing/llm-quality-matrix.md.
 *  ${provenance} */
import type { QualityScores } from "./quality";

export const QUALITY_SCORES: QualityScores = ${JSON.stringify(data, null, 2)};

/** True once a matrix run has been baked in (so the UI can hide the scorecard
 *  before any measurement exists). */
export function hasQualityScores(): boolean {
  return QUALITY_SCORES.models.length > 0 && Object.keys(QUALITY_SCORES.cells).length > 0;
}
`;

writeFileSync(OUT, body);
const opCount = Object.keys(cells).length;
const cellCount = Object.values(cells).reduce((s, m) => s + Object.keys(m).length, 0);
console.log(`✓ baked ${cellCount} cells (${opCount} operations × ${models.length} models) → src/lib/llm/quality-scores.ts`);
if (models.length) console.log(`  models: ${models.join(", ")}`);
