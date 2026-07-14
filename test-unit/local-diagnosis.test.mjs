/** Local-diagnosis tool (src/lib/ai/tools/local-diagnosis.ts) + its request builder
 *  (src/lib/diagnoses/local-request.ts) + the store's "local" kind sanitizer:
 *   - buildLocalDiagnosisRequest maps resolved signals → REAL-numbers-only request
 *   - validateLocalDiagnosis rejects an off-list worstGap (domain-limited)
 *   - demoLocalDiagnosis is deterministic (highest-volume gap), grounded in figures
 *   - sanitizeDiagnosisInput accepts kind "local"
 *  Pure — no model calls, no store I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { buildLocalDiagnosisRequest, gapLabel } = await import("@/lib/diagnoses/local-request");
const { validateLocalDiagnosis, demoLocalDiagnosis, normalizeLocalDiagnosis } = await import(
  "@/lib/ai/tools/local-diagnosis"
);
const { sanitizeDiagnosisInput, sanitizeLocalResult } = await import("@/lib/diagnoses/types");

const targets = [
  { area: "Praha", service: "Bělení zubů", monthlyVolume: 1400, hasPage: false, rank: null },
  { area: "Brno", service: "Dentální hygiena", monthlyVolume: 900, hasPage: false, rank: null },
  { area: "Praha", service: "Implantáty", monthlyVolume: 700, hasPage: true, rank: 5 },
];
const ladder = [
  { id: "a", keyword: "Bělení zubů · Praha", area: "Praha", current: 2, best: 2, history: [
    { rank: 4, at: "2025-06-01" }, { rank: 2, at: "2025-07-01" },
  ] },
  { id: "b", keyword: "Implantáty · Praha", area: "Praha", current: 12, best: 8, history: [
    { rank: 8, at: "2025-06-01" }, { rank: 12, at: "2025-07-01" },
  ] },
];
const reviews = [
  { id: "r1", author: "A", area: "Praha", rating: 5, text: "super", daysAgo: 1 },
  { id: "r2", author: "B", area: "Praha", rating: 4, text: "dobré", daysAgo: 2 },
  { id: "r3", author: "C", area: "Brno", rating: 2, text: "špatné", daysAgo: 3 },
];
const locations = [
  { id: "l1", name: "Praha", region: "PHA", services: 3, gbp: "connected", autopilot: false, rating: 4.5, reviews: 120, unanswered: 1, mapRank: 3, openTasks: 0, flagged: 0, drafts: 0, monthlyBudget: 0 },
  { id: "l2", name: "Brno", region: "JHM", services: 2, gbp: "attention", autopilot: false, rating: 4.1, reviews: 40, unanswered: 4, mapRank: 12, openTasks: 1, flagged: 1, drafts: 0, monthlyBudget: 0 },
];

function build() {
  return buildLocalDiagnosisRequest({
    targets, ladder, ladderLive: true, reviews, reviewsLive: false, locations, businessName: "Dentalis",
  });
}

test("buildLocalDiagnosisRequest maps coverage, gaps, ladder, reviews and locations", () => {
  const req = build();
  // Coverage: 1 of 3 has a page.
  assert.equal(req.trackedCombos, 3);
  assert.equal(req.withPage, 1);
  assert.ok(Math.abs(req.coveragePct - 1 / 3) < 1e-9);
  assert.equal(req.gapVolume, 2300); // 1400 + 900
  // Gaps: highest-volume first, labelled service — area.
  assert.equal(req.gaps[0].label, "Bělení zubů — Praha");
  assert.equal(req.gaps[0].monthlyVolume, 1400);
  assert.equal(req.gaps[1].label, "Dentální hygiena — Brno");
  // Ladder rollup.
  assert.equal(req.ladder.tracked, 2);
  assert.equal(req.ladder.inPack, 1); // only current #2 is in top 3
  assert.equal(req.ladder.live, true);
  assert.equal(req.ladder.improved, 1); // Bělení improved (4→2)
  assert.equal(req.ladder.declined, 1); // Implantáty declined (8→12)
  assert.equal(req.ladder.netSinceLast, -2); // +2 - 4
  // Reviews sentiment.
  assert.equal(req.reviews.total, 3);
  assert.equal(req.reviews.negative, 1);
  assert.equal(req.reviews.live, false);
  // Locations attention (l2 needs attention: gbp attention + mapRank>10 + unanswered>2).
  assert.equal(req.locations.total, 2);
  assert.equal(req.locations.attention, 1);
  assert.equal(req.locations.unanswered, 5);
});

test("gapLabel is stable and matches the built gap labels", () => {
  assert.equal(gapLabel({ service: "X", area: "Y" }), "X — Y");
});

test("validateLocalDiagnosis rejects an off-list worstGap and passes an on-list one", () => {
  const req = build();
  const bad = validateLocalDiagnosis(
    { summary: "s", worstGap: "Neexistující — Ostrava", recommendation: "r" },
    req
  );
  assert.ok(bad.length > 0, "off-list worstGap must be a violation");
  assert.ok(bad.some((m) => m.includes("worstGap")));

  const ok = validateLocalDiagnosis(
    { summary: "s", worstGap: "Bělení zubů — Praha", recommendation: "r" },
    req
  );
  assert.deepEqual(ok, []);
});

test("validateLocalDiagnosis flags a non-object output (repair floor)", () => {
  assert.ok(validateLocalDiagnosis("not an object", build()).length > 0);
  assert.ok(validateLocalDiagnosis(null, build()).length > 0);
});

test("demoLocalDiagnosis is deterministic — picks the highest-volume gap", () => {
  const req = build();
  const a = demoLocalDiagnosis(req);
  const b = demoLocalDiagnosis(req);
  assert.deepEqual(a, b);
  assert.equal(a.worstGap, "Bělení zubů — Praha");
  assert.ok(a.summary.includes("Bělení zubů — Praha"));
  assert.ok(a.recommendation.length > 0);
});

test("demoLocalDiagnosis handles no gaps (full coverage) without crashing", () => {
  const req = buildLocalDiagnosisRequest({
    targets: [{ area: "Praha", service: "X", monthlyVolume: 100, hasPage: true, rank: 2 }],
    ladder: [], ladderLive: false, reviews: [], reviewsLive: false,
  });
  const d = demoLocalDiagnosis(req);
  assert.equal(d.worstGap, "—");
  assert.ok(d.summary.length > 0);
});

test("normalizeLocalDiagnosis floors an off-list worstGap to the highest-volume gap", () => {
  const req = build();
  const norm = normalizeLocalDiagnosis(
    { summary: "", worstGap: "Nope — Nowhere", recommendation: "" },
    req
  );
  assert.equal(norm.worstGap, "Bělení zubů — Praha");
  assert.ok(norm.summary.length > 0); // filled from the demo floor
});

test("sanitizeDiagnosisInput accepts kind 'local' and defaults subject to worstGap", () => {
  const ok = sanitizeDiagnosisInput({
    kind: "local",
    result: { summary: "s", worstGap: "Bělení zubů — Praha", recommendation: "r" },
  });
  assert.equal(ok.kind, "local");
  assert.equal(ok.subject, "Bělení zubů — Praha");
  assert.equal(ok.origin, "manual");
  // A local result missing the mandatory fields is rejected.
  assert.equal(sanitizeLocalResult({ summary: "s" }), null);
});
