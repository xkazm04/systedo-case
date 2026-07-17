/** Unit tests for the A/B experiment winner logic: a noisy tiny-sample variant must
 *  not be crowned on raw ROAS before it clears a minimum volume floor. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasPerformanceBasis,
  experimentBasis,
  pickWinner,
  MIN_PERFORMANCE_CLICKS,
  MIN_PERFORMANCE_CONVERSIONS,
} from "@/lib/ai/experiment-types";

const variant = (id, strength, metrics) => ({
  id,
  label: id,
  ad: { headline: id, primaryText: "x", description: "y" },
  strength,
  metrics: metrics ?? null,
});

const m = (impressions, clicks, conversions, cost, convValue) => ({
  impressions,
  clicks,
  conversions,
  cost,
  convValue,
});

test("floor constants are sane and exported", () => {
  assert.ok(MIN_PERFORMANCE_CLICKS >= 1);
  assert.ok(MIN_PERFORMANCE_CONVERSIONS >= 1);
});

test("tiny-sample variant is NOT crowned on raw ROAS (falls back to strength)", () => {
  // A: ROAS 20 on 3 clicks / 1 conversion (noise). B: ROAS 6 on 2000 clicks / 80 conv.
  const exp = {
    id: "e",
    name: "n",
    createdAt: "",
    updatedAt: "",
    variants: [
      variant("A", 40, m(60, 3, 1, 50, 1000)),
      variant("B", 90, m(40000, 2000, 80, 4000, 24000)),
    ],
    winnerVariantId: null,
  };
  // Not enough volume on A → performance basis is refused.
  assert.equal(hasPerformanceBasis(exp), false);
  assert.equal(experimentBasis(exp), "insufficient-data");
  // Winner falls back to predicted strength → B (90 > 40), not the noisy ROAS leader A.
  assert.equal(pickWinner(exp), "B");
});

test("once every variant clears the volume floor, ROAS decides", () => {
  const exp = {
    id: "e",
    name: "n",
    createdAt: "",
    updatedAt: "",
    variants: [
      // A: high ROAS (value 30000 / cost 3000 = 10) and enough clicks.
      variant("A", 20, m(20000, 1200, 60, 3000, 30000)),
      // B: lower ROAS (18000/3000 = 6) but stronger predicted strength.
      variant("B", 90, m(20000, 1300, 70, 3000, 18000)),
    ],
    winnerVariantId: null,
  };
  assert.equal(hasPerformanceBasis(exp), true);
  assert.equal(experimentBasis(exp), "performance");
  // Real ROAS wins over predicted strength: A (ROAS 10) beats B (ROAS 6).
  assert.equal(pickWinner(exp), "A");
});

test("a variant clears the floor on conversions alone (few clicks, many conv)", () => {
  const exp = {
    id: "e",
    name: "n",
    createdAt: "",
    updatedAt: "",
    variants: [
      variant("A", 10, m(500, 40, MIN_PERFORMANCE_CONVERSIONS, 1000, 5000)),
      variant("B", 10, m(500, MIN_PERFORMANCE_CLICKS, 12, 1000, 3000)),
    ],
    winnerVariantId: null,
  };
  assert.equal(hasPerformanceBasis(exp), true);
});

test("missing metrics on any variant → predicted basis", () => {
  const exp = {
    id: "e",
    name: "n",
    createdAt: "",
    updatedAt: "",
    variants: [variant("A", 55, m(20000, 1200, 60, 3000, 30000)), variant("B", 70, null)],
    winnerVariantId: null,
  };
  assert.equal(experimentBasis(exp), "predicted");
  assert.equal(pickWinner(exp), "B"); // by strength
});
