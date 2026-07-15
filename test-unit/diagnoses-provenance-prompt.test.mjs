/** Direction 2 — sample data hedges the prompt. The server-injected `sample` flag on
 *  the cohort + lead-source requests threads an honest provenance line into the USER
 *  prompt (mirroring local-diagnosis's živá/ukázková wording). SYSTEM prompts + schemas
 *  are untouched (llm-eval proves zero drift separately). Pure — request → prompt text. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { buildCohortDiagnosisPrompt, dataProvenanceLine } = await import(
  "@/lib/ai/tools/cohort-diagnosis"
);
const { buildLeadSourceDiagnosisPrompt } = await import("@/lib/ai/tools/lead-source-diagnosis");

const cohortReq = {
  cohorts: [{ month: "2025-01", cac: 1200, ltv: 5400, ltvCac: 4.5, m3: 0.6, signups: 180, survival: [1, 0.7], observedMonths: 2 }],
  blendedCac: 1200,
  avgLtvCac: 4.5,
  avgPayback: 4,
};
const leadReq = { source: "Meta", leads: 100, qualified: 20, won: 3, qualRate: 0.2, winRate: 0.15 };

test("dataProvenanceLine: sample hedges, live states plainly, undefined omits", () => {
  assert.match(dataProvenanceLine(true), /ukázková data/);
  assert.match(dataProvenanceLine(false), /živá data/);
  assert.equal(dataProvenanceLine(undefined), null, "no flag → no line (byte-identical to before)");
});

test("cohort prompt carries the provenance line only when `sample` is set", () => {
  assert.match(buildCohortDiagnosisPrompt({ ...cohortReq, sample: true }), /ukázková data/);
  assert.match(buildCohortDiagnosisPrompt({ ...cohortReq, sample: false }), /živá data/);
  // Without the (server-injected) flag the prompt omits the line entirely.
  const bare = buildCohortDiagnosisPrompt(cohortReq);
  assert.doesNotMatch(bare, /Zdroj dat:/);
});

test("lead-source prompt carries the provenance line only when `sample` is set", () => {
  assert.match(buildLeadSourceDiagnosisPrompt({ ...leadReq, sample: true }), /ukázková data/);
  assert.match(buildLeadSourceDiagnosisPrompt({ ...leadReq, sample: false }), /živá data/);
  assert.doesNotMatch(buildLeadSourceDiagnosisPrompt(leadReq), /Zdroj dat:/);
});
