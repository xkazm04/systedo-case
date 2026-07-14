/** Direction 3 — one competitor spine: seo-compare's catalog synthesis reads the
 *  union of the STORED competitor set + plan-named competitors, deduped case/
 *  diacritic-insensitively, with stored competitors leading in a stable order so the
 *  seeded volumes stay deterministic per query string. Empty set + no plans → [] so
 *  the caller falls back to SAMPLE_QUERIES. Pure — the store I/O lives in the page. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeCompetitors, comparisonQueriesFromCatalog } from "@/lib/seo-compare/catalog";

const plan = (...names) => ({ competitors: names.map((name) => ({ name })) });

test("mergeCompetitors unions stored + plan competitors, stored first", () => {
  const merged = mergeCompetitors(["Zeta"], [plan("Alfa", "Beta")]);
  assert.deepEqual(merged, ["Zeta", "Alfa", "Beta"]);
});

test("mergeCompetitors dedupes case- and diacritic-insensitively, keeping first form", () => {
  // "Alza" stored, "alza" + "Alža"(diacritic) on plans → one entry, the stored form.
  const merged = mergeCompetitors(["Alza"], [plan("alza"), plan("Beta", "Alza")]);
  assert.deepEqual(merged, ["Alza", "Beta"]);
});

test("mergeCompetitors preserves stored order and skips blanks", () => {
  const merged = mergeCompetitors(["  ", "Gamma", "Alfa"], [plan("Alfa", "Delta")]);
  assert.deepEqual(merged, ["Gamma", "Alfa", "Delta"]);
});

test("stored competitors reshape the vs-query slate even with no plans", () => {
  const queries = comparisonQueriesFromCatalog("Flowbase", [], ["Asana", "Trello"]);
  const vs = queries.filter((q) => q.intent === "vs").map((q) => q.query);
  assert.deepEqual(vs, ["Flowbase vs Asana", "Flowbase vs Trello"]);
  // Base intents still present.
  assert.ok(queries.some((q) => q.intent === "alternative"));
  assert.ok(queries.some((q) => q.intent === "pricing"));
  assert.ok(queries.some((q) => q.intent === "review"));
});

test("empty stored set + no plans falls back (returns []) exactly as before", () => {
  assert.deepEqual(comparisonQueriesFromCatalog("Flowbase", [], []), []);
  assert.deepEqual(comparisonQueriesFromCatalog("Flowbase", []), []);
});

test("plans with competitors and no stored set behave as before (plan competitors surface)", () => {
  const queries = comparisonQueriesFromCatalog("Flowbase", [plan("Jira")]);
  assert.ok(queries.some((q) => q.query === "Flowbase vs Jira"));
});

test("seeded volume is deterministic per query string regardless of how the competitor entered", () => {
  const viaStored = comparisonQueriesFromCatalog("Flowbase", [], ["Jira"]);
  const viaPlan = comparisonQueriesFromCatalog("Flowbase", [plan("Jira")]);
  const q1 = viaStored.find((q) => q.query === "Flowbase vs Jira");
  const q2 = viaPlan.find((q) => q.query === "Flowbase vs Jira");
  assert.equal(q1.volume, q2.volume);
  assert.equal(q1.difficulty, q2.difficulty);
});
