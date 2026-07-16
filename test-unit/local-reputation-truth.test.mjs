/** One reputation truth (D1):
 *   - the /lokalni reputation rollup (profilesFromReviews) and the /recenze inbox
 *     rollup (sentiment) report the SAME count + review-weighted rating over the SAME
 *     resolved review set — pinned equal here so the two surfaces can't drift again;
 *   - the inbox's answered triage reconciles into the diagnosis's `unanswered`
 *     (identifiable subtract, GBP wins otherwise, clamped ≥ 0);
 *   - businessTypeFromServices is the single shared derivation both pages use.
 *  Pure — no model calls, no store I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { profilesFromReviews } = await import("@/lib/local/compute");
const { sentiment } = await import("@/lib/reviews/compute");
const { businessTypeFromServices } = await import("@/lib/local/business-type");
const { buildLocalDiagnosisRequest } = await import("@/lib/diagnoses/local-request");

const reviews = [
  { id: "r0", author: "A", area: "Praha", rating: 5, text: "super", daysAgo: 1 },
  { id: "r1", author: "B", area: "Praha", rating: 4, text: "dobré", daysAgo: 3 },
  { id: "r2", author: "C", area: "Brno", rating: 2, text: "špatné", daysAgo: 5 },
  { id: "r3", author: "D", area: "Brno", rating: 3, text: "průměr", daysAgo: 8 },
  { id: "r4", author: "E", area: "Ostrava", rating: 5, text: "skvělé", daysAgo: 12 },
];

test("reputation rollup and inbox rollup agree on count + weighted rating (one source)", () => {
  const profiles = profilesFromReviews(reviews);
  const s = sentiment(reviews);

  // Same total count.
  const profileCount = profiles.reduce((a, p) => a + p.reviews, 0);
  assert.equal(profileCount, s.total);
  assert.equal(profileCount, reviews.length);

  // Same review-weighted average rating (profiles are per-area weighted averages).
  const profileWeightedAvg =
    profiles.reduce((a, p) => a + p.rating * p.reviews, 0) / profileCount;
  assert.ok(
    Math.abs(profileWeightedAvg - s.avg) < 1e-9,
    `reputation avg ${profileWeightedAvg} must equal inbox avg ${s.avg}`
  );
});

const locations = [
  { id: "l1", name: "Praha", region: "PHA", services: 3, gbp: "connected", autopilot: false, rating: 4.5, reviews: 120, unanswered: 3, mapRank: 3, openTasks: 0, flagged: 0, drafts: 0, monthlyBudget: 0 },
  { id: "l2", name: "Brno", region: "JHM", services: 2, gbp: "attention", autopilot: false, rating: 4.1, reviews: 40, unanswered: 4, mapRank: 12, openTasks: 1, flagged: 1, drafts: 0, monthlyBudget: 0 },
];

function reqWith(answeredReviewIds) {
  return buildLocalDiagnosisRequest({
    targets: [{ area: "Praha", service: "X", monthlyVolume: 100, hasPage: false, rank: null }],
    ladder: [],
    ladderLive: false,
    reviews,
    reviewsLive: false,
    locations,
    ...(answeredReviewIds ? { answeredReviewIds } : {}),
  });
}

test("no triage loaded → roster unanswered passes through unchanged", () => {
  const req = reqWith(undefined);
  assert.equal(req.locations.unanswered, 7); // 3 + 4
});

test("triage-answered in a roster locality subtracts from unanswered (identifiable)", () => {
  // r0 (Praha) + r2 (Brno) answered — both localities are on the roster → subtract 2.
  const req = reqWith(["r0", "r2"]);
  assert.equal(req.locations.unanswered, 5); // max(0, 7 - 2)
});

test("answered review outside the roster localities does NOT subtract (GBP wins)", () => {
  // r4 is in Ostrava, which the roster doesn't list → not identifiable.
  const req = reqWith(["r4"]);
  assert.equal(req.locations.unanswered, 7); // unchanged
});

test("reconciled unanswered clamps at zero, never negative", () => {
  const req = reqWith(["r0", "r1", "r2", "r3"]); // 3 identifiable-Praha + Brno etc.
  assert.ok(req.locations.unanswered >= 0);
  assert.equal(req.locations.unanswered, 3); // 7 - 4 identifiable (r0,r1 Praha; r2,r3 Brno)
});

test("businessTypeFromServices dedupes, keeps top two, lower-cases, joins with ' a '", () => {
  assert.equal(
    businessTypeFromServices([
      { category: "Zubní ordinace" },
      { category: "Zubní ordinace" },
      { category: "Estetika" },
      { category: "Rentgen" },
    ]),
    "zubní ordinace a estetika"
  );
});

test("businessTypeFromServices → undefined when there are no categories", () => {
  assert.equal(businessTypeFromServices([]), undefined);
  assert.equal(businessTypeFromServices([{ category: "" }, { category: null }]), undefined);
});
