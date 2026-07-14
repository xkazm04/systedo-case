/** Pure quality-scorecard helpers (src/lib/llm/quality.ts) + the honesty invariant
 *  on the baked metadata: the judge label must never claim a median it doesn't have,
 *  and the staleness / self-judging surfaces the UI renders must be deterministic.
 *  These are the parts that must be right even without re-running the paid matrix. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STALENESS_THRESHOLD_DAYS,
  measurementAgeDays,
  isMeasurementStale,
  formatMeasuredAge,
  judgeVendor,
  isSelfJudged,
} from "@/lib/llm/quality";
import { QUALITY_SCORES } from "@/lib/llm/quality-scores";

const AT = "2026-07-07T12:00:00.000Z";
const at = (isoDaysLater) => new Date(Date.parse(AT) + isoDaysLater * 86_400_000);

test("measurementAgeDays: whole days, floored, never negative, NaN on garbage", () => {
  assert.equal(measurementAgeDays(AT, at(0)), 0);
  assert.equal(measurementAgeDays(AT, at(0.9)), 0);
  assert.equal(measurementAgeDays(AT, at(1)), 1);
  assert.equal(measurementAgeDays(AT, at(41)), 41);
  // a "future" measurement clamps to 0 rather than going negative
  assert.equal(measurementAgeDays(AT, at(-5)), 0);
  assert.ok(Number.isNaN(measurementAgeDays("not-a-date", at(0))));
});

test("isMeasurementStale: flips at the threshold", () => {
  assert.equal(STALENESS_THRESHOLD_DAYS, 30);
  assert.equal(isMeasurementStale(AT, at(29)), false);
  assert.equal(isMeasurementStale(AT, at(30)), true);
  assert.equal(isMeasurementStale(AT, at(400)), true);
  // custom threshold honoured
  assert.equal(isMeasurementStale(AT, at(10), 7), true);
  assert.equal(isMeasurementStale(AT, at(6), 7), false);
  // unparseable date is never "stale" (no false alarm)
  assert.equal(isMeasurementStale("nope", at(0)), false);
});

test("formatMeasuredAge (cs): buckets + instrumental plural", () => {
  assert.equal(formatMeasuredAge(AT, "cs", at(0)), "dnes");
  assert.equal(formatMeasuredAge(AT, "cs", at(1)), "před 1 dnem");
  assert.equal(formatMeasuredAge(AT, "cs", at(3)), "před 3 dny");
  assert.equal(formatMeasuredAge(AT, "cs", at(13)), "před 13 dny");
  assert.equal(formatMeasuredAge(AT, "cs", at(21)), "před 3 týdny"); // 21/7
  assert.equal(formatMeasuredAge(AT, "cs", at(7)), "před 7 dny"); // still < 14 → days
  assert.equal(formatMeasuredAge(AT, "cs", at(90)), "před 3 měsíci"); // 90/30
  assert.equal(formatMeasuredAge(AT, "cs", at(30)), "před 4 týdny"); // 30/7 ≈ 4
});

test("formatMeasuredAge (en): buckets + s-plural", () => {
  assert.equal(formatMeasuredAge(AT, "en", at(0)), "today");
  assert.equal(formatMeasuredAge(AT, "en", at(1)), "1 day ago");
  assert.equal(formatMeasuredAge(AT, "en", at(3)), "3 days ago");
  assert.equal(formatMeasuredAge(AT, "en", at(14)), "2 weeks ago");
  assert.equal(formatMeasuredAge(AT, "en", at(60)), "2 months ago");
  assert.equal(formatMeasuredAge("nope", "en", at(0)), "");
});

test("judgeVendor / isSelfJudged: the Claude judge grades its own vendor", () => {
  assert.equal(judgeVendor("claude-sonnet"), "anthropic");
  assert.equal(judgeVendor("claude-sonnet (medián ze 3)"), "anthropic");
  assert.equal(judgeVendor("gemini-3.5-flash"), null);

  // Anthropic-family slugs are self-judged; everything else is neutral.
  assert.equal(isSelfJudged("claude-sonnet", "anthropic/claude-sonnet-5"), true);
  assert.equal(isSelfJudged("claude-sonnet", "anthropic/claude-haiku-4-5"), true);
  assert.equal(isSelfJudged("claude-sonnet", "google/gemini-3.5-flash"), false);
  assert.equal(isSelfJudged("claude-sonnet", "openai/gpt-5.4-mini"), false);
  // a non-Anthropic judge flags nothing
  assert.equal(isSelfJudged("gemini-3.5-flash", "anthropic/claude-sonnet-5"), false);
});

test("HONESTY: the baked judge label never claims a median it lacks", () => {
  const cells = Object.values(QUALITY_SCORES.cells).flatMap((row) => Object.values(row));
  assert.ok(cells.length > 0, "baked scorecard should have cells");
  const minJudges = Math.min(...cells.map((c) => c.judges));
  const claimsMedian = /medi[aá]n/i.test(QUALITY_SCORES.judge);
  if (claimsMedian) {
    // a "medián ze N" claim is only honest if every cell realised ≥2 judges
    assert.ok(
      minJudges >= 2,
      `judge label "${QUALITY_SCORES.judge}" claims a median but a cell has ${minJudges} judge(s)`
    );
  } else {
    // no median claim → single-judge cells are fine (this is the current baked state)
    assert.ok(minJudges >= 1);
  }
});
