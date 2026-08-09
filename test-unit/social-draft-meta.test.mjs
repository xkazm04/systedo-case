/** Honest AI meta in every draft client (src/lib/social/draft-meta.ts +
 *  src/lib/ai/tools/social.ts fallback brand).
 *
 *  /api/social/draft already forwarded `status / repaired / violations /
 *  languageMismatch`, but all three clients (Composer, WeekPlanner,
 *  ContentSchedule) read only `drafts` + `source` — a truncated or wrong-language
 *  caption rendered identically to a clean one. All three now branch on ONE pure
 *  reader (draftResponseMeta → DraftHealth → the shared DegradedNote primitive),
 *  so pinning the reader pins the surfacing rule for every client:
 *    • Composer: `setDraftMeta(draftResponseMeta(json))` per run;
 *    • ContentSchedule: `draftResponseMeta(json)` per slot draft;
 *    • WeekPlanner: `mergeDraftMetas(perTopicMetas)` per batch.
 *  Also pins the secondary defect: socialFallback (the demo/backfill floor) now
 *  carries the request's brand, matching the route's plain template mode. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

let draftResponseMeta;
let mergeDraftMetas;
let needsDraftNote;
let socialSkill;

before(async () => {
  const [meta, social] = await Promise.all([
    import("@/lib/social/draft-meta"),
    import("@/lib/ai/tools/social"),
  ]);
  draftResponseMeta = meta.draftResponseMeta;
  mergeDraftMetas = meta.mergeDraftMetas;
  needsDraftNote = meta.needsDraftNote;
  socialSkill = social.socialSkill;
});

// ── draftResponseMeta: the one reader every client branches on ────────────────

test("clean answer → null, so the healthy path renders zero extra chrome", () => {
  assert.equal(draftResponseMeta({ drafts: [], source: "ai", model: "m", tookMs: 5 }), null);
  // template mode carries no honesty fields at all
  assert.equal(draftResponseMeta({ drafts: [], source: "template" }), null);
  assert.equal(draftResponseMeta(null), null);
  assert.equal(draftResponseMeta("nope"), null);
});

test("degraded (status corrupt) surfaces — and warrants the user-facing note", () => {
  const m = draftResponseMeta({ drafts: [], source: "ai", status: "corrupt" });
  assert.ok(m);
  assert.equal(m.degraded, true);
  assert.equal(m.languageMismatch, false);
  assert.equal(needsDraftNote(m), true);
});

test("languageMismatch surfaces independently of status", () => {
  const m = draftResponseMeta({ drafts: [], source: "ai", languageMismatch: true });
  assert.ok(m);
  assert.equal(m.degraded, false);
  assert.equal(m.languageMismatch, true);
  assert.equal(needsDraftNote(m), true);
});

test("repaired + violations are carried but do NOT warrant the degraded note", () => {
  const m = draftResponseMeta({
    drafts: [],
    source: "ai",
    repaired: true,
    violations: ["Příspěvek pro instagram: 3000 > 2200", 42],
  });
  assert.ok(m);
  assert.equal(m.repaired, true);
  // non-string junk is dropped, strings kept
  assert.deepEqual(m.violations, ["Příspěvek pro instagram: 3000 > 2200"]);
  assert.equal(needsDraftNote(m), false);
});

test('status "repaired" alone is quiet house-keeping, not a degraded answer', () => {
  const m = draftResponseMeta({ drafts: [], source: "ai", status: "repaired", repaired: true });
  assert.ok(m);
  assert.equal(m.degraded, false);
  assert.equal(needsDraftNote(m), false);
});

// ── mergeDraftMetas: the WeekPlanner batch verdict ────────────────────────────

test("batch of clean drafts merges to null (no chrome)", () => {
  assert.equal(mergeDraftMetas([null, null, null]), null);
  // repaired-only drafts are clean for note purposes too
  const repairedOnly = draftResponseMeta({ status: "repaired", repaired: true });
  assert.equal(mergeDraftMetas([null, repairedOnly]), null);
});

test("one degraded draft flags the whole batch; flags OR together", () => {
  const degraded = draftResponseMeta({ status: "corrupt" });
  const wrongLang = draftResponseMeta({ languageMismatch: true });
  const merged = mergeDraftMetas([null, degraded, wrongLang, null]);
  assert.ok(merged);
  assert.equal(merged.degraded, true);
  assert.equal(merged.languageMismatch, true);
  assert.equal(needsDraftNote(merged), true);
});

// ── socialFallback carries the brand (parity with the route's template mode) ──

test("socialSkill.demo (the fallback) writes the request's brand into the captions", () => {
  const withBrand = socialSkill.demo({
    topic: "zimní směs",
    tone: "pratelsky",
    platforms: ["facebook", "instagram"],
    brand: "Acme",
  });
  for (const p of withBrand.posts) {
    // Instagram carries the brand as a slugged hashtag (#acme); Facebook as prose
    // ("od Acme") — either way the caption must not lose the brand.
    assert.ok(
      p.content.toLowerCase().includes("acme"),
      `${p.platform} fallback caption lost the brand: ${p.content}`
    );
  }
  // and without a brand the copy stays brand-neutral — never a placeholder company
  const neutral = socialSkill.demo({ topic: "zimní směs", tone: "pratelsky", platforms: ["facebook"] });
  assert.ok(!neutral.posts[0].content.includes("Mionelo"));
});
