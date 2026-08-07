/** Local Overview recommendations (src/lib/insights/aggregate.ts localRecs branch):
 *  a `local` project must get local recs (coverage gap, weakest map-pack position,
 *  unanswered negative reviews) from its RESOLVED signals — not the content-marketing
 *  advice the missing branch used to dump it into. Other project types stay untouched.
 *  Pure — no I/O; the resolved local signals are threaded in as fixtures. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);
const { collectRecommendations } = await import("@/lib/insights/aggregate");

const localProject = {
  id: "p-local",
  name: "Dentalis",
  type: "local",
  accentColor: "#14b8b1",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const contentProject = { ...localProject, id: "p-content", type: "content" };

const ALL_SAMPLE = { coverage: false, ladder: false, reviews: false, pack: false };
const ALL_LIVE = { coverage: true, ladder: true, reviews: true, pack: true };

const input = {
  live: ALL_SAMPLE,
  targets: [
    { area: "Praha", service: "Bělení zubů", monthlyVolume: 1200, hasPage: false, rank: null },
    { area: "Brno", service: "Dentální hygiena", monthlyVolume: 300, hasPage: false, rank: null },
    { area: "Praha", service: "Implantáty", monthlyVolume: 900, hasPage: true, rank: 5 },
  ],
  ladder: [
    { id: "a", keyword: "Bělení zubů · Praha", area: "Praha", history: [], current: 2, best: 2 },
    { id: "b", keyword: "Implantáty · Praha", area: "Praha", history: [], current: 14, best: 9 },
  ],
  reviews: [
    { id: "r1", author: "A", area: "Praha", rating: 5, text: "super", daysAgo: 1 },
    { id: "r2", author: "B", area: "Praha", rating: 2, text: "špatné", daysAgo: 3 },
    { id: "r3", author: "C", area: "Brno", rating: 1, text: "hrozné", daysAgo: 5 },
  ],
};

const localModules = (recs) => recs.filter((r) => r.module === "lokalni");

test("local project gets a coverage-gap rec from its highest-volume RESOLVED target", () => {
  const recs = collectRecommendations(localProject, "cs", input);
  const local = localModules(recs);
  const gap = local.find((r) => r.title.includes("Chybí stránka"));
  assert.ok(gap, "expected a coverage-gap rec");
  // The highest-volume uncovered target (Bělení zubů Praha, 1200), not Brno's 300.
  assert.ok(gap.title.includes("Bělení zubů"));
  assert.ok(gap.title.includes("Praha"));
  assert.equal(gap.severity, "opportunity");
  assert.equal(gap.impactCzk, 1200);
});

test("local project gets a weakest-map-pack-position rec (worst current rank, outside top 3)", () => {
  const recs = collectRecommendations(localProject, "cs", input);
  const weak = localModules(recs).find((r) => r.title.includes("Slabá pozice"));
  assert.ok(weak, "expected a weak-position rec");
  assert.ok(weak.title.includes("Implantáty"), "should point at the #14 keyword");
  assert.equal(weak.severity, "warning");
});

test("weakest-position rec is omitted when every tracked keyword is already in the pack", () => {
  const inPackOnly = { ...input, ladder: [{ id: "a", keyword: "x", area: "Praha", history: [], current: 2, best: 2 }] };
  const recs = collectRecommendations(localProject, "cs", inPackOnly);
  assert.equal(localModules(recs).some((r) => r.title.includes("Slabá pozice")), false);
});

test("local project gets an unanswered-negative-reviews nudge counting only negatives", () => {
  const recs = collectRecommendations(localProject, "cs", input);
  const rev = localModules(recs).find((r) => r.title.includes("negativních"));
  assert.ok(rev, "expected a negative-reviews rec");
  assert.ok(rev.title.startsWith("2"), "two negative reviews (ratings 2 and 1)");
});

test("no negative-reviews rec when sentiment is all positive", () => {
  const positive = { ...input, reviews: [{ id: "r1", author: "A", area: "Praha", rating: 5, text: "ok", daysAgo: 1 }] };
  const recs = collectRecommendations(localProject, "cs", positive);
  assert.equal(localModules(recs).some((r) => r.title.includes("negativních")), false);
});

test("English locale localizes the local recs", () => {
  const recs = collectRecommendations(localProject, "en", input);
  const local = localModules(recs);
  assert.ok(local.some((r) => r.title.includes("Missing page")));
  assert.ok(local.some((r) => r.title.includes("Weak position")));
  assert.ok(local.some((r) => r.title.includes("negative reviews")));
});

test("a local project without threaded input still gets local recs (pure sample fallback), not content advice", () => {
  const recs = collectRecommendations(localProject, "cs");
  assert.ok(localModules(recs).length > 0, "should have local recs from the sample fallback");
  // The content-engine (obsahový-engine) recs must NOT appear on a local project.
  assert.equal(recs.some((r) => r.module === "obsahovy-engine"), false);
});

test("a content project is unaffected by the local branch (no lokalni recs)", () => {
  const recs = collectRecommendations(contentProject, "cs", input);
  assert.equal(localModules(recs).length, 0);
});

/* ── provenance: the Overview must not launder sample fiction into flat alerts ──
   Every urgency card (critical/warning) on a project with NOTHING imported is
   generated from seeded data, so it must carry `sample: true` for the feed to
   disclose it — the same honesty the module pages it links to already provide. */

test("a fully-sample local project produces no UNDISCLOSED urgency card", () => {
  const recs = collectRecommendations(localProject, "cs", { ...input, live: ALL_SAMPLE });
  const urgent = recs.filter((r) => r.severity === "critical" || r.severity === "warning");
  assert.ok(urgent.length > 0, "the fixture should produce urgency cards at all");
  const undisclosed = urgent.filter((r) => r.sample !== true);
  assert.deepEqual(undisclosed.map((r) => r.title), [], "every sample-derived alert must be tagged");
});

test("the pure-sample FALLBACK path (no threaded input) is tagged too", () => {
  const recs = collectRecommendations(localProject, "cs");
  const urgent = recs.filter((r) => r.severity === "critical" || r.severity === "warning");
  assert.deepEqual(urgent.filter((r) => r.sample !== true).map((r) => r.title), []);
});

test("a project whose signals are LIVE is unchanged — no sample tag on any local rec", () => {
  const recs = collectRecommendations(localProject, "cs", { ...input, live: ALL_LIVE });
  // Scoped to the local seams under test: the cross-type channel rec reads the SEEDED
  // organic plan (no live seam), so it stays disclosed regardless of local liveness.
  assert.equal(localModules(recs).some((r) => r.sample), false);
  // …and the recs themselves are identical to the untagged pre-change output.
  const tagged = collectRecommendations(localProject, "cs", { ...input, live: ALL_SAMPLE });
  assert.deepEqual(
    recs.map((r) => r.title),
    tagged.map((r) => r.title),
    "tagging must not add, drop or reorder recommendations"
  );
});

test("liveness is PER SEAM — a project live on reviews only tags the rank rec", () => {
  const recs = collectRecommendations(localProject, "cs", {
    ...input,
    live: { coverage: false, ladder: false, reviews: true, pack: false },
  });
  const local = localModules(recs);
  assert.equal(local.find((r) => r.title.includes("negativních")).sample, undefined);
  assert.equal(local.find((r) => r.title.includes("Slabá pozice")).sample, true);
  assert.equal(local.find((r) => r.title.includes("Chybí stránka")).sample, true);
});

test("live coverage untags the gap rec without touching the review rec", () => {
  const recs = collectRecommendations(localProject, "cs", {
    ...input,
    live: { coverage: true, ladder: false, reviews: false, pack: true },
  });
  const local = localModules(recs);
  assert.equal(local.find((r) => r.title.includes("Chybí stránka")).sample, undefined);
  assert.equal(local.find((r) => r.title.includes("negativních")).sample, true);
});
