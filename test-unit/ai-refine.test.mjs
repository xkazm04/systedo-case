/** Unit tests for the "refine with instructions" plumbing: the shared prompt
 *  fragment (src/lib/ai/tools/refine) and the validators threading + capping the
 *  note (src/lib/ai/validation). The note must reach the validated value on
 *  EVERY tool — the wave-9 gate commit extended it to the three legacy
 *  gate-locked tools (ads, brief, analysis), whose validators used to drop it —
 *  because it busts the input-hash cache and lands in the USER prompt only
 *  (system prompts/schemas stay byte-identical, so the gate fingerprints hold). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REFINE_MAX, refineLines } from "@/lib/ai/tools/refine";
import {
  validateAdRequest,
  validateAnalysisRequest,
  validateBriefRequest,
  validateKeywordClustersRequest,
  validateRepurposeRequest,
} from "@/lib/ai/validation";

test("refineLines returns [] for missing / blank notes", () => {
  assert.deepEqual(refineLines(undefined), []);
  assert.deepEqual(refineLines(""), []);
  assert.deepEqual(refineLines("   "), []);
});

test("refineLines emits a separator, an instruction line and the note", () => {
  const lines = refineLines("kratší, více na benefity");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "");
  assert.match(lines[1], /DODATEČNÉ POKYNY UŽIVATELE/);
  assert.equal(lines[2], "kratší, více na benefity");
});

test("refineLines caps an over-long note at REFINE_MAX", () => {
  const lines = refineLines("x".repeat(REFINE_MAX + 200));
  assert.ok(lines[2].length <= REFINE_MAX, `expected <= ${REFINE_MAX}, got ${lines[2].length}`);
  assert.ok(lines[2].endsWith("…"), "clamped note is marked with an ellipsis");
});

test("validateRepurposeRequest threads + caps the refine note", () => {
  const base = {
    title: "Jak skladovat ořechy",
    url: "https://example.com/clanek",
    tone: "pratelsky",
    channels: ["LinkedIn"],
  };
  const ok = validateRepurposeRequest({ ...base, refine: "  vynech ceny  " });
  assert.ok(ok.valid);
  assert.equal(ok.value.refine, "vynech ceny");

  const long = validateRepurposeRequest({ ...base, refine: "y".repeat(REFINE_MAX + 50) });
  assert.ok(long.valid);
  assert.equal(long.value.refine.length, REFINE_MAX);

  const none = validateRepurposeRequest(base);
  assert.ok(none.valid);
  assert.equal("refine" in none.value, false, "absent note stays absent (cache key unchanged)");
});

test("validateKeywordClustersRequest threads the refine note", () => {
  const p = validateKeywordClustersRequest({
    keywords: [{ keyword: "kešu" }, { keyword: "mandle" }],
    refine: "rozděl podle záměru",
  });
  assert.ok(p.valid);
  assert.equal(p.value.refine, "rozděl podle záměru");
});

test("validateAdRequest threads + caps the refine note (legacy tool, wave 9)", () => {
  const base = {
    product: "Kešu ořechy",
    benefits: "100% natural",
    audience: "zdravý životní styl",
    platform: "google",
    tone: "vecny",
  };
  const p = validateAdRequest({ ...base, refine: "  kratší  " });
  assert.ok(p.valid);
  assert.equal(p.value.refine, "kratší");

  const long = validateAdRequest({ ...base, refine: "z".repeat(REFINE_MAX + 50) });
  assert.ok(long.valid);
  assert.equal(long.value.refine.length, REFINE_MAX);

  const none = validateAdRequest(base);
  assert.ok(none.valid);
  assert.equal("refine" in none.value, false, "absent note stays absent (cache key unchanged)");
});

test("validateBriefRequest threads the refine note (legacy tool, wave 9)", () => {
  const p = validateBriefRequest({
    topic: "Skladování ořechů",
    primaryKeyword: "skladování ořechů",
    audience: "domácí kuchaři",
    contentType: "blog",
    refine: "více na benefity",
  });
  assert.ok(p.valid);
  assert.equal(p.value.refine, "více na benefity");
});

test("validateAnalysisRequest threads the refine note (legacy tool, wave 9)", () => {
  const p = validateAnalysisRequest({ period: "30d", refine: "stručněji" });
  assert.ok(p.valid);
  assert.equal(p.value.refine, "stručněji");

  const none = validateAnalysisRequest({ period: "30d" });
  assert.ok(none.valid);
  assert.equal("refine" in none.value, false, "absent note stays absent (cache key unchanged)");
});
