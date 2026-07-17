/** deriveStylePrior (src/lib/images/attribution-types.ts) — money-losing-style fix.
 *  A style with spend but ROAS 0 (no conversions) used to be crowned "historically
 *  converts best (ROAS 0×)", biasing every future generation toward a proven loser.
 *  The fix requires positive ROAS + a real conversion for the ROAS branch and
 *  otherwise falls back to the best *average vision score*. Pure — no I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStylePrior } from "@/lib/images/attribution-types";

const stat = (over) => ({
  style: "bokeh",
  label: "Bokeh",
  count: 1,
  avgVisionScore: null,
  roas: 0,
  totalCost: 0,
  totalConvValue: 0,
  conversions: 0,
  ...over,
});

test("spend but ROAS 0 does NOT become a 'converts best' prior", () => {
  const prior = deriveStylePrior([
    stat({ style: "bokeh", label: "Bokeh", totalCost: 500, roas: 0, conversions: 0 }),
  ]);
  assert.equal(prior.style, null, "no vision score either → no prior at all");
  assert.equal(prior.hint, "");
  assert.ok(!prior.hint.includes("ROAS 0"), "never asserts ROAS 0 converts best");
});

test("ROAS 0 style with a vision score falls back to the vision hint", () => {
  const prior = deriveStylePrior([
    stat({ style: "bokeh", label: "Bokeh", totalCost: 500, roas: 0, conversions: 0, avgVisionScore: 8 }),
  ]);
  assert.equal(prior.style, "bokeh");
  assert.ok(prior.hint.includes("kvalita vizuálů"), "vision-quality wording, not ROAS");
});

test("a genuinely profitable style wins the ROAS branch", () => {
  const prior = deriveStylePrior([
    stat({ style: "vibrant", label: "Živý", totalCost: 1000, totalConvValue: 4000, roas: 4, conversions: 12 }),
    stat({ style: "bokeh", label: "Bokeh", totalCost: 500, roas: 0, conversions: 0 }),
  ]);
  assert.equal(prior.style, "vibrant");
  assert.ok(prior.hint.includes("nejlépe konvertuje"));
});

test("vision fallback picks the highest average vision score, not the sort head", () => {
  const prior = deriveStylePrior([
    stat({ style: "bokeh", label: "Bokeh", avgVisionScore: 5 }),
    stat({ style: "fashion", label: "Fashion", avgVisionScore: 9 }),
  ]);
  assert.equal(prior.style, "fashion");
});
