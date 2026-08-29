/** W1-C — the diagnosis grounding half of the dual-engine local pack.
 *
 *  `buildLocalDiagnosisRequest` rolls the ranking ladder up PER ENGINE: `ladder` stays
 *  the Google rollup (so a project with no Seznam rows produces a request byte-identical
 *  to the one it produced before the contract existed) and `ladderSeznam` carries the
 *  Mapy.cz half. The two are never averaged together — a Google #2 and a Mapy.cz #9 for
 *  the same keyword are two facts, and one blended "average position" would describe
 *  neither map.
 *
 *  Pure — no model calls, no store I/O. The companion of local-diagnosis.test.mjs,
 *  which pins the single-engine shape and must stay untouched. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { buildLocalDiagnosisRequest } = await import("@/lib/diagnoses/local-request");

const targets = [
  { area: "Praha", service: "Bělení zubů", monthlyVolume: 1400, hasPage: false, rank: null },
  { area: "Praha", service: "Implantáty", monthlyVolume: 700, hasPage: true, rank: 5 },
];

/** Two Google rows and two Seznam rows for the SAME keywords — the realistic shape of
 *  a Czech local project tracking both maps. */
const googleRows = [
  { id: "g1", keyword: "Bělení zubů · Praha", area: "Praha", current: 2, best: 2, history: [
    { rank: 4, at: "2026-06-01" }, { rank: 2, at: "2026-07-01" },
  ] },
  { id: "g2", keyword: "Implantáty · Praha", area: "Praha", current: 1, best: 1, history: [
    { rank: 3, at: "2026-06-01" }, { rank: 1, at: "2026-07-01" },
  ] },
];
const seznamRows = [
  { id: "s1", keyword: "Bělení zubů · Praha", area: "Praha", engine: "seznam", current: 9, best: 9, history: [
    { rank: 7, at: "2026-06-01" }, { rank: 9, at: "2026-07-01" },
  ] },
  { id: "s2", keyword: "Implantáty · Praha", area: "Praha", engine: "seznam", current: 11, best: 10, history: [
    { rank: 10, at: "2026-06-01" }, { rank: 11, at: "2026-07-01" },
  ] },
];

const build = (ladder) =>
  buildLocalDiagnosisRequest({
    targets,
    ladder,
    ladderLive: true,
    reviews: [],
    reviewsLive: false,
    businessName: "Dentalis",
  });

test("a google-only ladder is unchanged and grows NO ladderSeznam block", () => {
  const req = build(googleRows);
  assert.equal(req.ladderSeznam, undefined, "nothing invented for an engine with no rows");
  assert.equal("ladderSeznam" in req, false);
  assert.equal(req.ladder.tracked, 2);
  assert.equal(req.ladder.inPack, 2);
  assert.equal(req.ladder.top1, 1);
  assert.equal(req.ladder.avgRank, 1.5);
  assert.equal(req.ladder.netSinceLast, 4, "+2 and +2");
});

test("a mixed ladder rolls each engine up separately and never averages them", () => {
  const req = build([...googleRows, ...seznamRows]);
  // The Google block is IDENTICAL to the google-only run — adding Seznam rows must not
  // move a single Google figure.
  assert.deepEqual(req.ladder, build(googleRows).ladder);
  assert.equal(req.ladderSeznam.tracked, 2);
  assert.equal(req.ladderSeznam.inPack, 0, "ranks 9 and 11 are nowhere near the pack");
  assert.equal(req.ladderSeznam.top1, 0);
  assert.equal(req.ladderSeznam.avgRank, 10);
  assert.equal(req.ladderSeznam.packRate, 0);
  // A blended average over all four rows would have been 5.75 — the number that
  // describes neither map. Neither block may hold it.
  assert.notEqual(req.ladder.avgRank, 5.75);
  assert.notEqual(req.ladderSeznam.avgRank, 5.75);
});

test("the seznam rollup carries its own movement and span, not the Google ones", () => {
  const req = build([...googleRows, ...seznamRows]);
  assert.equal(req.ladder.improved, 2);
  assert.equal(req.ladder.declined, 0);
  assert.equal(req.ladderSeznam.improved, 0);
  assert.equal(req.ladderSeznam.declined, 2, "both Mapy.cz positions slipped");
  assert.equal(req.ladderSeznam.netSinceLast, -3);
  assert.equal(req.ladderSeznam.spanDays, 30);
  assert.equal(req.ladderSeznam.live, true, "provenance rides the same live flag");
});

test("a SEZNAM-only ladder produces the seznam block and no Google one", () => {
  const req = build(seznamRows);
  assert.equal(req.ladder, undefined, "no Google rows ⇒ no Google rollup, not a zeroed one");
  assert.equal(req.ladderSeznam.tracked, 2);
  // Coverage and gaps are engine-independent and still present.
  assert.equal(req.trackedCombos, 2);
  assert.equal(req.gaps.length, 1);
});

test("an empty ladder yields neither block", () => {
  const req = build([]);
  assert.equal(req.ladder, undefined);
  assert.equal(req.ladderSeznam, undefined);
});
