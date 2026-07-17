/** Sparkline default aria-label phrasing (src/components/charts/trendLabel.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { trendAriaLabel } from "@/components/charts/trendLabel";

const parts = { start: "10", end: "12", pct: "+20 %" };

test("cs phrasing", () => {
  assert.equal(trendAriaLabel("cs", parts), "Trend od 10 do 12, změna +20 %");
});

test("en phrasing is English, not Czech", () => {
  const label = trendAriaLabel("en", parts);
  assert.equal(label, "Trend from 10 to 12, change +20 %");
  assert.doesNotMatch(label, /od|do|změna/);
});
