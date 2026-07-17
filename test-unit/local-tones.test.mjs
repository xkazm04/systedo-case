/** Shared local-SEO tone ramps (src/lib/local/tones.ts): the rank→tone ramp must be
 *  MONOTONE in severity (a worse rank never looks softer than a better one) — the bug
 *  the extraction fixed was 4–10 red / 11+ coral, i.e. #25 looking calmer than #5. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankTone, ratingTone, star } from "@/lib/local/tones";

test("rankTone: 1–3 positive, 4–10 coral (warning), 11+ negative (worst)", () => {
  for (const r of [1, 2, 3]) assert.equal(rankTone(r), "positive");
  for (const r of [4, 7, 10]) assert.equal(rankTone(r), "coral");
  for (const r of [11, 25, 100]) assert.equal(rankTone(r), "negative");
});

test("rankTone: severity is monotone — a worse rank is never a softer tone", () => {
  // positive (safest) < coral (warning) < negative (worst)
  const order = { positive: 0, coral: 1, negative: 2 };
  let prev = -1;
  for (let rank = 1; rank <= 30; rank++) {
    const sev = order[rankTone(rank)];
    assert.ok(sev >= prev, `rank ${rank} tone ${rankTone(rank)} softened vs a better rank`);
    prev = sev;
  }
});

test("ratingTone: 4–5 positive, exactly 3 coral, ≤2 negative", () => {
  assert.equal(ratingTone(5), "positive");
  assert.equal(ratingTone(4), "positive");
  assert.equal(ratingTone(3), "coral");
  assert.equal(ratingTone(2), "negative");
  assert.equal(ratingTone(1), "negative");
});

test("star: uses the passed formatter, appends the star glyph", () => {
  assert.equal(star(4.6, (n, d) => n.toFixed(d ?? 0)), "4.6 ★");
});
