/** Unit tests for the insight ranking comparator (Direction 1): the auto-generated
 *  "Co stojí za pozornost" list is ordered by the engine's per-metric significance
 *  (strong > weak > noise), ties broken by magnitude, with a stable sort preserving
 *  authoring order on exact ties. Runs the TS source via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareInsightRank } from "@/lib/metrics/insight-rank";

const r = (significance, magnitude) => ({ significance, magnitude });

test("orders strong before weak before noise regardless of magnitude", () => {
  // A tiny strong move must still lead a huge noise move.
  assert.ok(compareInsightRank(r("strong", 0.001), r("noise", 5)) < 0);
  assert.ok(compareInsightRank(r("weak", 0.001), r("noise", 5)) < 0);
  assert.ok(compareInsightRank(r("strong", 0.001), r("weak", 5)) < 0);
  // ...and the reverse is positive.
  assert.ok(compareInsightRank(r("noise", 5), r("strong", 0.001)) > 0);
});

test("within a tier, the larger magnitude sorts first", () => {
  assert.ok(compareInsightRank(r("strong", 0.4), r("strong", 0.1)) < 0);
  assert.ok(compareInsightRank(r("weak", 0.1), r("weak", 0.4)) > 0);
});

test("an exact tie returns 0 so a stable sort keeps authoring order", () => {
  assert.equal(compareInsightRank(r("weak", 0.2), r("weak", 0.2)), 0);
});

test("sorting a mixed list yields strong→weak→noise, magnitude-desc within tier", () => {
  const items = [
    { id: "noise-big", ...r("noise", 0.9) },
    { id: "weak-small", ...r("weak", 0.05) },
    { id: "strong-small", ...r("strong", 0.02) },
    { id: "weak-big", ...r("weak", 0.5) },
    { id: "strong-big", ...r("strong", 0.3) },
  ];
  const order = [...items].sort(compareInsightRank).map((i) => i.id);
  assert.deepEqual(order, ["strong-big", "strong-small", "weak-big", "weak-small", "noise-big"]);
});

test("non-finite magnitude is treated as 0 (never poisons the comparison)", () => {
  // NaN magnitude → falls to the bottom of its tier, comparison stays total.
  assert.ok(compareInsightRank(r("weak", 0.1), r("weak", NaN)) < 0);
  assert.equal(compareInsightRank(r("weak", NaN), r("weak", NaN)), 0);
});
