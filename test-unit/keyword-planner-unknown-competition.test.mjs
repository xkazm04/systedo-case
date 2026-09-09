/** Registry apply (marketing / keyword-metric-reliability, `unknown-metric-sinks-never-flatters`),
 *  2026-09-09. The Planner adapter mapped an ABSENT competitionIndex to 0 and the opportunity
 *  formula (60% volume + 40% ease, ease = 1 − index/100) then paid the idea full ease points.
 *  Two arms on the same rows:
 *    A (before): absent → 0   → ease 1.0 → an unknown-difficulty term outranks a reported-mid
 *                term by 20 points at equal volume (100 vs 80 with volume = max).
 *    B (after):  absent → 50  → ease 0.5 → the two tie; a REPORTED "0" is still 0.
 *  The Sklik adapter already documented B as its default; this pins the Planner path to it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPlannerIdea, PLANNER_DEFAULT_COMPETITION_INDEX } from "@/lib/google/keyword-planner";
import { opportunityScore } from "@/lib/keywords/types";

const row = (text, metrics) => ({ text, keywordIdeaMetrics: metrics });

test("an absent competition index sinks to the mid default instead of flattering the idea", () => {
  const unknown = mapPlannerIdea(row("crm pro malé firmy", { avgMonthlySearches: "1000" }));
  const knownMid = mapPlannerIdea(row("crm systém", { avgMonthlySearches: "1000", competitionIndex: "50" }));
  assert.equal(unknown.competitionIndex, PLANNER_DEFAULT_COMPETITION_INDEX);
  assert.equal(unknown.competition, "medium");
  // Arm B: equal volume, unknown vs reported-mid → the same opportunity; under arm A the
  // unknown row scored 100 against 80.
  const maxVolume = 1000;
  assert.equal(opportunityScore(unknown, maxVolume), opportunityScore(knownMid, maxVolume));
  assert.equal(opportunityScore(unknown, maxVolume), 80);
});

test("a reported zero competition is a measurement and stays zero", () => {
  const reportedZero = mapPlannerIdea(row("velmi úzký dotaz", { avgMonthlySearches: "10", competitionIndex: "0" }));
  assert.equal(reportedZero.competitionIndex, 0);
  assert.equal(reportedZero.competition, "low");
});

test("a non-numeric competition index is treated as absent, and the level label still wins the band", () => {
  const junk = mapPlannerIdea(row("x", { avgMonthlySearches: "5", competitionIndex: "n/a", competition: "HIGH" }));
  assert.equal(junk.competitionIndex, PLANNER_DEFAULT_COMPETITION_INDEX);
  assert.equal(junk.competition, "high");
  assert.equal(mapPlannerIdea({ keywordIdeaMetrics: {} }), null);
});
