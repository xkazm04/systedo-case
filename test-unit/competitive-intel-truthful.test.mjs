/** Direction 1 — Truthful surfaces:
 *  (a) the Overview SEO rec (app project) scores the RESOLVED comparison queries
 *      threaded in by the caller, not the hardcoded SAMPLE_QUERIES; other recs stay
 *      byte-identical and the omitted-input path falls back to the sample.
 *  (b) the keyword-intent BRAND branch fires once finalizeKeywords is given a brand:
 *      a keyword containing the brand classifies as "brand"; without a brand the
 *      behavior is unchanged. Pure — no I/O; inputs threaded as fixtures. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);
const { collectRecommendations } = await import("@/lib/insights/aggregate");
const { finalizeKeywords, classifyIntent } = await import("@/lib/keywords/types");

const appProject = {
  id: "p-app",
  name: "Flowbase",
  type: "app",
  accentColor: "#6d5efb",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

// A resolved slate with one clearly-dominant high-opportunity query.
const RESOLVED = [
  { query: "flowbase alternativa", intent: "alternative", volume: 5000, difficulty: 20, rank: null },
  { query: "flowbase recenze", intent: "review", volume: 120, difficulty: 80, rank: 2 },
];

const seoRec = (recs) => recs.find((r) => r.module === "srovnani-seo");

test("app Overview SEO rec scores the RESOLVED comparison queries, not the sample", () => {
  const rec = seoRec(collectRecommendations(appProject, "cs", null, RESOLVED));
  assert.ok(rec, "expected an srovnani-seo rec");
  assert.ok(rec.title.includes("flowbase alternativa"), "should point at the resolved high query");
});

test("omitting the resolved slate falls back to SAMPLE_QUERIES (unchanged behavior)", () => {
  const rec = seoRec(collectRecommendations(appProject, "cs"));
  assert.ok(rec, "expected an srovnani-seo rec from the sample fallback");
  // A sample high query ("nástroj cena") — never the resolved brand query.
  assert.ok(!rec.title.includes("flowbase"), "must not reference resolved queries when none threaded");
});

test("every non-SEO rec is byte-identical between resolved and fallback slates", () => {
  const withResolved = collectRecommendations(appProject, "cs", null, RESOLVED).filter(
    (r) => r.module !== "srovnani-seo"
  );
  const fallback = collectRecommendations(appProject, "cs").filter((r) => r.module !== "srovnani-seo");
  assert.deepEqual(withResolved, fallback);
});

test("brand intent fires when finalizeKeywords is given the brand", () => {
  const raw = [
    { keyword: "flowbase recenze", avgMonthlySearches: 500, competition: "low", competitionIndex: 20, lowBidCzk: 5, highBidCzk: 12 },
    { keyword: "jak vybrat nástroj", avgMonthlySearches: 800, competition: "low", competitionIndex: 15, lowBidCzk: 3, highBidCzk: 8 },
  ];
  const withBrand = finalizeKeywords("flowbase", "sample", raw, "Flowbase");
  const brandIdea = withBrand.ideas.find((i) => i.keyword === "flowbase recenze");
  assert.equal(brandIdea.intent, "brand", "brand-name keyword classifies as brand");
  // The non-brand keyword is unaffected.
  assert.notEqual(withBrand.ideas.find((i) => i.keyword === "jak vybrat nástroj").intent, "brand");
});

test("without a brand the brand branch stays dormant (anonymous path unchanged)", () => {
  const raw = [
    { keyword: "flowbase recenze", avgMonthlySearches: 500, competition: "low", competitionIndex: 20, lowBidCzk: 5, highBidCzk: 12 },
  ];
  const noBrand = finalizeKeywords("flowbase", "sample", raw);
  assert.notEqual(noBrand.ideas[0].intent, "brand", "no brand → never classified as brand");
  // classifyIntent agrees: "recenze" is an informational marker absent a brand.
  assert.equal(classifyIntent("flowbase recenze"), "informational");
  assert.equal(classifyIntent("flowbase recenze", "Flowbase"), "brand");
});
