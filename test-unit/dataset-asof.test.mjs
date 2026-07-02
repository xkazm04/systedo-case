/** Guards for the dataset's mid-month AS_OF (scripts/generate-data.mjs --as-of):
 *  the committed JSON must keep the two-year comparison depth AND end mid-month,
 *  so the GoalPacing forecast machinery (projection, P10–P90 band, goal
 *  probability) is live instead of permanently "měsíc dokončen". */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { monthlyPacing } from "@/lib/metrics/pacing";

const data = JSON.parse(
  readFileSync(new URL("../src/data/performance.json", import.meta.url), "utf8")
);

test("the committed dataset keeps two-year depth and ends on meta.asOf", () => {
  // Every period (incl. the 12-month view) needs an equal-length comparison
  // window before it.
  assert.ok(data.daily.length >= 730, `two-year depth (${data.daily.length} days)`);
  assert.equal(data.daily[data.daily.length - 1].date, data.meta.asOf);
  assert.equal(data.daily.length, data.meta.days);
});

test("a mid-month as-of keeps the month-end forecast machinery alive", () => {
  const pacing = monthlyPacing(data.daily, data.goals.monthlyRevenue);
  assert.ok(pacing, "pacing computed");
  assert.equal(pacing.complete, false, "current month is in progress");
  assert.ok(pacing.daysRemaining > 0, "days left to project");
  assert.ok(pacing.projection > pacing.mtd, "projection extends beyond banked MTD");
  assert.ok(
    pacing.projectionHigh > pacing.projectionLow,
    "P10–P90 band has actual width"
  );
  // Enough elapsed days that the goal probability is quotable, and it is a real
  // probability rather than a degenerate 0/1 coin edge.
  assert.equal(pacing.probabilityReliable, true);
  assert.ok(pacing.goalProbability > 0 && pacing.goalProbability < 1);
});
