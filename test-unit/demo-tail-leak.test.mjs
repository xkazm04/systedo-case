/** Demo-disclaimer tail must NOT leak into real model results (channel-research,
 *  cohort-diagnosis, onboarding-scan). The keyless demos end with demoTail() —
 *  " Ukázkový výstup — připojte LLM (…) pro …" — which is honest on the keyless path
 *  but nonsensical when spliced as a per-field floor into a live answer (and it leaks
 *  the provider names). The fix splits each demo into a TAIL-FREE base (used for live
 *  backfill) + a demo() that appends the tail. Pure — no model. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const TAIL = /Ukázkový výstup — připojte LLM/;

const { baseChannelResearch, demoChannelResearch, normalizeChannelResearchTracked } = await import(
  "@/lib/ai/tools/channel-research"
);
const { baseCohortDiagnosis, demoCohortDiagnosis } = await import("@/lib/ai/tools/cohort-diagnosis");
const { baseOnboardingScan, demoOnboardingScan } = await import("@/lib/ai/tools/onboarding-scan");

// ── channel-research ────────────────────────────────────────────────────────────

test("channel-research: base summary is tail-free, demo summary carries the tail", () => {
  const req = { projectType: "eshop", brand: "Ořechárna" };
  assert.doesNotMatch(baseChannelResearch(req).summary, TAIL);
  assert.match(demoChannelResearch(req).summary, TAIL);
});

test("channel-research: a live answer with an empty summary backfills tail-free", () => {
  const req = { projectType: "eshop", brand: "Ořechárna" };
  const channel = {
    name: "SEO", category: "content", fit: 80, effort: "low",
    rationale: "Sedí.", payoff: "Viditelnost.", firstActions: ["Založit."],
  };
  // model returned channels but no summary → summary is backfilled; must be tail-free.
  const out = normalizeChannelResearchTracked({ channels: [channel] }, req);
  assert.equal(out.canned, false);
  assert.doesNotMatch(out.result.summary, TAIL);
});

// ── cohort-diagnosis ──────────────────────────────────────────────────────────

test("cohort-diagnosis: base summary is tail-free, demo summary carries the tail", () => {
  const req = {
    cohorts: [{ month: "2026-01", cac: 800, ltv: 1200, ltvCac: 1.5, paybackMonth: 6, m3: 0.3, signups: 100 }],
    blendedCac: 800, avgLtvCac: 1.5,
  };
  assert.doesNotMatch(baseCohortDiagnosis(req).summary, TAIL);
  assert.match(demoCohortDiagnosis(req).summary, TAIL);
});

test("cohort-diagnosis: the no-cohorts branch is also tail-free in the base", () => {
  const req = { cohorts: [], blendedCac: 0, avgLtvCac: 0 };
  assert.doesNotMatch(baseCohortDiagnosis(req).summary, TAIL);
  assert.match(demoCohortDiagnosis(req).summary, TAIL);
});

// ── onboarding-scan ───────────────────────────────────────────────────────────

test("onboarding-scan: base summary is tail-free, demo summary carries the tail", () => {
  const req = { url: "https://orecharna.cz", brand: "Ořechárna", projectType: "eshop" };
  assert.doesNotMatch(baseOnboardingScan(req).summary, TAIL);
  assert.match(demoOnboardingScan(req).summary, TAIL);
});
