/** Response-health derivations (src/lib/reviews/health.ts): reply-rate, median
 *  answered-age proxy, sentiment trend — plus the empty / all-unanswered edges. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);
import { responseHealth } from "@/lib/reviews/health";
const { buildLocalDiagnosisRequest } = await import("@/lib/diagnoses/local-request");

const rev = (over = {}) => ({
  id: "r",
  author: "Jana K.",
  area: "Praha",
  rating: 5,
  text: "Skvělé",
  daysAgo: 2,
  answered: false,
  ...over,
});

test("empty set → zero reply-rate, null median, flat trend", () => {
  const h = responseHealth([]);
  assert.equal(h.total, 0);
  assert.equal(h.answered, 0);
  assert.equal(h.replyRate, 0);
  assert.equal(h.medianResponseAgeDays, null);
  assert.equal(h.trend, "flat");
});

test("all-unanswered → replyRate 0, median null", () => {
  const h = responseHealth([rev({ id: "a" }), rev({ id: "b" }), rev({ id: "c" })]);
  assert.equal(h.total, 3);
  assert.equal(h.answered, 0);
  assert.equal(h.replyRate, 0);
  assert.equal(h.medianResponseAgeDays, null);
});

test("reply-rate = answered / total", () => {
  const h = responseHealth([
    rev({ id: "a", answered: true }),
    rev({ id: "b", answered: true }),
    rev({ id: "c", answered: false }),
    rev({ id: "d", answered: false }),
  ]);
  assert.equal(h.answered, 2);
  assert.equal(h.replyRate, 0.5);
});

test("median answered-age is the median daysAgo of answered reviews only", () => {
  // answered ages 2,4,10 → median 4; the unanswered 100 is ignored.
  const h = responseHealth([
    rev({ id: "a", answered: true, daysAgo: 4 }),
    rev({ id: "b", answered: true, daysAgo: 2 }),
    rev({ id: "c", answered: true, daysAgo: 10 }),
    rev({ id: "d", answered: false, daysAgo: 100 }),
  ]);
  assert.equal(h.medianResponseAgeDays, 4);
});

test("median averages the two middles for an even answered count", () => {
  const h = responseHealth([
    rev({ id: "a", answered: true, daysAgo: 2 }),
    rev({ id: "b", answered: true, daysAgo: 6 }),
  ]);
  assert.equal(h.medianResponseAgeDays, 4); // (2 + 6) / 2
});

test("trend rises when the newer half is more positive than the older half", () => {
  // oldest→newest by daysAgo: [neg(40), neg(30), pos(20), pos(10)]
  const h = responseHealth([
    rev({ id: "a", daysAgo: 40, rating: 2 }),
    rev({ id: "b", daysAgo: 30, rating: 2 }),
    rev({ id: "c", daysAgo: 20, rating: 5 }),
    rev({ id: "d", daysAgo: 10, rating: 5 }),
  ]);
  assert.equal(h.olderPositiveShare, 0);
  assert.equal(h.newerPositiveShare, 1);
  assert.equal(h.trend, "up");
});

test("trend falls when the newer half is less positive", () => {
  const h = responseHealth([
    rev({ id: "a", daysAgo: 40, rating: 5 }),
    rev({ id: "b", daysAgo: 30, rating: 5 }),
    rev({ id: "c", daysAgo: 20, rating: 2 }),
    rev({ id: "d", daysAgo: 10, rating: 1 }),
  ]);
  assert.equal(h.trend, "down");
});

test("trend flat when both halves share the same positive mix", () => {
  const h = responseHealth([
    rev({ id: "a", daysAgo: 40, rating: 5 }),
    rev({ id: "b", daysAgo: 30, rating: 2 }),
    rev({ id: "c", daysAgo: 20, rating: 5 }),
    rev({ id: "d", daysAgo: 10, rating: 2 }),
  ]);
  assert.equal(h.olderPositiveShare, 0.5);
  assert.equal(h.newerPositiveShare, 0.5);
  assert.equal(h.trend, "flat");
});

test("derivation is deterministic — same input, same output", () => {
  const items = [
    rev({ id: "a", daysAgo: 9, rating: 4, answered: true }),
    rev({ id: "b", daysAgo: 3, rating: 2 }),
    rev({ id: "c", daysAgo: 1, rating: 5, answered: true }),
  ];
  assert.deepEqual(responseHealth(items), responseHealth(items));
});

// The diagnosis grounding (D2): reply-health rides into req.reviews ONLY when the
// inbox triage was loaded, so a missing-state read never fabricates a "0 % answered".
const diagReviews = [
  { id: "r0", author: "A", area: "Praha", rating: 5, text: "x", daysAgo: 1 },
  { id: "r1", author: "B", area: "Praha", rating: 4, text: "x", daysAgo: 3 },
  { id: "r2", author: "C", area: "Brno", rating: 2, text: "x", daysAgo: 5 },
  { id: "r3", author: "D", area: "Brno", rating: 3, text: "x", daysAgo: 8 },
];
const diagBase = { targets: [], ladder: [], ladderLive: false, reviews: diagReviews, reviewsLive: true };

test("buildLocalDiagnosisRequest omits reply-health when no triage is loaded", () => {
  const req = buildLocalDiagnosisRequest(diagBase);
  assert.equal(req.reviews.total, 4);
  assert.equal(req.reviews.replyRate, undefined);
  assert.equal(req.reviews.sentimentTrend, undefined);
  assert.equal(req.reviews.medianResponseAgeDays, undefined);
});

test("buildLocalDiagnosisRequest surfaces reply-health when triage is loaded", () => {
  const req = buildLocalDiagnosisRequest({ ...diagBase, answeredReviewIds: ["r0", "r2"] });
  assert.equal(req.reviews.replyRate, 2 / 4);
  assert.ok(["up", "down", "flat"].includes(req.reviews.sentimentTrend));
  assert.equal(req.reviews.medianResponseAgeDays, 3); // answered ages 1 & 5 → median 3
});

test("buildLocalDiagnosisRequest reply-health present but empty when triage loaded, none answered", () => {
  const req = buildLocalDiagnosisRequest({ ...diagBase, answeredReviewIds: [] });
  assert.equal(req.reviews.replyRate, 0);
  assert.equal(req.reviews.medianResponseAgeDays, null);
});
