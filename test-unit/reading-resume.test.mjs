/** Unit tests for the resume-reading helpers (article-reading #4): defensive
 *  parsing of the stored position, the offer heuristics (progress window +
 *  minimum jump distance) and the remaining-minutes estimate on the chip. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseReadingPosition,
  readingPositionKey,
  remainingMinutes,
  resumeScrollTop,
  RESUME_MAX_AGE_MS,
  RESUME_MIN_DISTANCE_PX,
  shouldOfferResume,
} from "@/components/article/reading-resume";

test("readingPositionKey scopes the entry per pathname", () => {
  assert.notEqual(readingPositionKey("/clanek"), readingPositionKey("/clanek/vykon"));
  assert.match(readingPositionKey("/clanek"), /\/clanek$/);
});

test("parseReadingPosition round-trips a valid entry", () => {
  const pos = { y: 1234, p: 0.42, ts: 1750000000000 };
  assert.deepEqual(parseReadingPosition(JSON.stringify(pos)), pos);
});

test("parseReadingPosition rejects garbage, missing fields and out-of-range values", () => {
  assert.equal(parseReadingPosition(null), null);
  assert.equal(parseReadingPosition("not json"), null);
  assert.equal(parseReadingPosition("42"), null);
  assert.equal(parseReadingPosition(JSON.stringify({ y: 100 })), null);
  assert.equal(parseReadingPosition(JSON.stringify({ y: "x", p: 0.5, ts: 1 })), null);
  assert.equal(parseReadingPosition(JSON.stringify({ y: -5, p: 0.5, ts: 1 })), null);
  assert.equal(parseReadingPosition(JSON.stringify({ y: 100, p: 1.5, ts: 1 })), null);
  assert.equal(parseReadingPosition(JSON.stringify({ y: Infinity, p: 0.5, ts: 1 })), null);
});

test("shouldOfferResume only fires inside the progress window and beyond the jump distance", () => {
  const at = (p, y = 5000) => ({ y, p, ts: Date.now() });
  assert.equal(shouldOfferResume(null, 0), false);
  // barely started / effectively finished — no offer
  assert.equal(shouldOfferResume(at(0.01), 0), false);
  assert.equal(shouldOfferResume(at(0.99), 0), false);
  // mid-article and far from the current viewport — offer
  assert.equal(shouldOfferResume(at(0.5), 0), true);
  // already (nearly) there, e.g. after the browser's own scroll restoration
  assert.equal(shouldOfferResume(at(0.5, 5000), 5000 - RESUME_MIN_DISTANCE_PX / 2), false);
});

test("shouldOfferResume declines a position older than RESUME_MAX_AGE_MS", () => {
  const now = 1_800_000_000_000;
  const fresh = { y: 5000, p: 0.5, ts: now - 1000 };
  const stale = { y: 5000, p: 0.5, ts: now - RESUME_MAX_AGE_MS - 1 };
  assert.equal(shouldOfferResume(fresh, 0, now), true);
  assert.equal(shouldOfferResume(stale, 0, now), false);
});

test("resumeScrollTop derives the target from the fraction and clamps into range", () => {
  assert.equal(resumeScrollTop(0.5, 4000), 2000);
  assert.equal(resumeScrollTop(0, 4000), 0);
  assert.equal(resumeScrollTop(1, 4000), 4000);
  // out-of-range fractions and a non-scrollable page degrade safely
  assert.equal(resumeScrollTop(1.5, 4000), 4000);
  assert.equal(resumeScrollTop(-0.2, 4000), 0);
  assert.equal(resumeScrollTop(0.5, 0), 0);
  assert.equal(resumeScrollTop(0.5, NaN), 0);
});

test("remainingMinutes rounds up and never reports less than a minute", () => {
  assert.equal(remainingMinutes(12, 0.5), 6);
  assert.equal(remainingMinutes(12, 0.6), 5);
  assert.equal(remainingMinutes(12, 0.99), 1);
  assert.equal(remainingMinutes(12, 0.94), 1);
});
