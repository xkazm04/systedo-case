/** Direction 2 — "demo backfill stops billing as real".
 *
 *  Two mechanisms, both pure and unit-tested here:
 *   1. validateSocial now requires ≥1 usable post per REQUESTED platform, so an empty
 *      or partial model response FAILS validation → the wrapper's single repair
 *      re-prompt fires (instead of the normalizer silently papering over the gap with
 *      canned templates while meta.demo stayed false — canned billing as real).
 *   2. the backfill DETECTORS the tools use to decide whether an answer was fully /
 *      partly canned (→ meta.demo / meta.partialDemo), tested on the two representative
 *      shapes: social (per-platform count) and keyword-clusters (all-or-nothing). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSocial, normalizeSocialTracked } from "@/lib/ai/tools/social";
import { keywordClustersFromModel } from "@/lib/ai/tools/keyword-clusters";
import { NOT_OBJECT_VIOLATION } from "@/lib/ai/tools/_validate";

// ── validateSocial: requires a post per requested platform (Direction 2) ──────────

test("validateSocial: a non-object always fails (triggers the one repair)", () => {
  assert.deepEqual(validateSocial(null, ["instagram"]), [NOT_OBJECT_VIOLATION]);
  assert.deepEqual(validateSocial("nope", ["instagram"]), [NOT_OBJECT_VIOLATION]);
  assert.deepEqual(validateSocial([], ["instagram"]), [NOT_OBJECT_VIOLATION]);
});

test("validateSocial: an EMPTY post set fails for every requested platform", () => {
  const v = validateSocial({ posts: [] }, ["instagram", "facebook"]);
  assert.equal(v.length, 2);
  assert.ok(v.every((m) => /Chybí příspěvek pro platformu/.test(m)));
});

test("validateSocial: a PARTIAL set flags only the missing platform", () => {
  const v = validateSocial(
    { posts: [{ platform: "instagram", content: "Ahoj" }] },
    ["instagram", "facebook"]
  );
  assert.equal(v.length, 1);
  assert.match(v[0], /facebook/);
});

test("validateSocial: a COMPLETE set passes (no violations)", () => {
  const v = validateSocial(
    { posts: [{ platform: "instagram", content: "A" }, { platform: "facebook", content: "B" }] },
    ["instagram", "facebook"]
  );
  assert.deepEqual(v, []);
});

test("validateSocial: an empty-content post does NOT satisfy its platform", () => {
  const v = validateSocial({ posts: [{ platform: "instagram", content: "   " }] }, ["instagram"]);
  assert.equal(v.length, 1);
  assert.match(v[0], /instagram/);
});

test("validateSocial: over-limit content is still flagged, alongside a missing platform", () => {
  const long = "x".repeat(2201); // > instagram limit (2200)
  const v = validateSocial({ posts: [{ platform: "instagram", content: long }] }, ["instagram", "facebook"]);
  assert.ok(v.some((m) => /limit/.test(m)), "over-limit flagged");
  assert.ok(v.some((m) => /facebook/.test(m)), "missing facebook flagged");
});

test("validateSocial: without requested platforms it is the over-limit-only check (skill default)", () => {
  // The skill's own validate() runs with no requested arg — byte-identical old behaviour.
  assert.deepEqual(validateSocial({ posts: [] }), []);
  const long = "y".repeat(3001); // > linkedin limit (3000)
  assert.equal(validateSocial({ posts: [{ platform: "linkedin", content: long }] }).length, 1);
});

// ── backfill detectors: what drives meta.demo (full) vs meta.partialDemo (mixed) ──

const socialInput = (platforms) => ({ topic: "T", tone: "pratelsky", platforms });

test("normalizeSocialTracked: modelCount counts platforms the MODEL filled", () => {
  const i = socialInput(["instagram", "facebook"]);
  const both = normalizeSocialTracked(
    { posts: [{ platform: "instagram", content: "A" }, { platform: "facebook", content: "B" }] },
    i
  );
  assert.equal(both.modelCount, 2, "all requested filled → none backfilled");

  const one = normalizeSocialTracked({ posts: [{ platform: "instagram", content: "A" }] }, i);
  assert.equal(one.modelCount, 1, "one filled, one backfilled → partial");
  assert.equal(one.result.posts.length, 2, "still returns a post per requested platform");

  const none = normalizeSocialTracked({ posts: [] }, i);
  assert.equal(none.modelCount, 0, "nothing filled → fully canned");
  assert.equal(none.result.posts.length, 2);
});

test("keywordClustersFromModel: empty when nothing valid survives (→ full demo)", () => {
  const req = { keywords: [{ keyword: "kešu ořechy" }, { keyword: "mandle" }] };
  // A cluster whose pillar isn't one of the supplied keywords is dropped entirely.
  assert.deepEqual(keywordClustersFromModel({ clusters: [{ topic: "x", pillar: "invented", supporting: [] }] }, req), []);
  assert.deepEqual(keywordClustersFromModel({ clusters: [] }, req), []);
  assert.deepEqual(keywordClustersFromModel("garbage", req), []);
});

test("keywordClustersFromModel: keeps a valid model cluster (→ real answer)", () => {
  const req = { keywords: [{ keyword: "kešu ořechy", volume: 100 }, { keyword: "mandle", volume: 50 }] };
  const out = keywordClustersFromModel(
    { clusters: [{ topic: "ořechy", pillar: "kešu ořechy", supporting: ["mandle"] }] },
    req
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].pillar, "kešu ořechy");
  assert.deepEqual(out[0].supporting, ["mandle"]);
});
