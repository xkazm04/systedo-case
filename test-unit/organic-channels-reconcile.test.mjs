/** Pins channel identity across plan regenerations: foldChannelKey folds
 *  renamed-but-same channels together (diacritics/word-order/qualifier
 *  tolerant) while keeping genuinely distinct channels apart, and
 *  reconcilePlanTracks carries lifecycle work forward on apply — exact id
 *  first, unambiguous fold second, honest orphan otherwise. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { foldChannelKey, reconcilePlanTracks } from "@/lib/organic-channels/reconcile";
import { baseChannelPlan } from "@/lib/organic-channels/sample";
import { PROJECT_TYPES } from "@/lib/projects/types";

const ch = (id, name, over = {}) => ({
  id,
  name,
  category: "community",
  fit: 80,
  effort: "low",
  rationale: "",
  payoff: "",
  firstActions: [],
  ...over,
});

test("foldChannelKey folds renamed-but-same channels together", () => {
  // Czech adjectival rename — the motivating case.
  assert.equal(foldChannelKey("Facebookové skupiny"), foldChannelKey("Facebook skupiny"));
  // Parenthetical qualifier + usage-qualifier stopword.
  assert.equal(foldChannelKey("Instagram (organicky)"), foldChannelKey("Instagram"));
  // Seed-name parenthetical.
  assert.equal(foldChannelKey("Firmy.cz (Seznam)"), foldChannelKey("Firmy.cz"));
  // Casing/diacritics/word order never split identity.
  assert.equal(foldChannelKey("Skupiny Facebook"), foldChannelKey("facebook SKUPINY"));
  // Closed alias list.
  assert.equal(foldChannelKey("FB skupiny"), foldChannelKey("Facebook skupiny"));
});

test("foldChannelKey keeps genuinely distinct channels apart (false-merge guard)", () => {
  assert.notEqual(foldChannelKey("Facebook skupiny"), foldChannelKey("Facebook stránka"));
  // The seed catalog itself holds both as separate channels.
  assert.notEqual(foldChannelKey("Lokální Facebook skupiny"), foldChannelKey("Facebook skupiny"));
  assert.notEqual(foldChannelKey("Zboží.cz (Seznam)"), foldChannelKey("Firmy.cz (Seznam)"));
  assert.notEqual(foldChannelKey("Google Business Profile"), foldChannelKey("Google Mapy"));
});

test("every seeded per-type plan has pairwise-distinct fold keys", () => {
  for (const type of PROJECT_TYPES) {
    const plan = baseChannelPlan(type, {}, "test-seed");
    const keys = plan.map((c) => foldChannelKey(c.name));
    assert.equal(new Set(keys).size, plan.length, `fold collision inside the ${type} plan: ${keys}`);
  }
});

test("regenerate with a renamed-but-same channel preserves the lifecycle track", () => {
  const prev = [ch("facebook-skupiny", "Facebook skupiny"), ch("newsletter", "E-mailový newsletter")];
  const track = {
    stage: "live",
    mode: "twin",
    twinScope: "social",
    inboxSource: "manual",
    maxPerWeek: 3,
  };
  const plan = [ch("facebookove-skupiny", "Facebookové skupiny"), ch("linkedin", "LinkedIn")];
  const out = reconcilePlanTracks(plan, prev, { "facebook-skupiny": track });

  // Carried under the NEW id with stage, mode and config intact; no orphan.
  assert.deepEqual(out.tracks, { "facebookove-skupiny": track });
  assert.deepEqual(out.orphans, []);
  // The wizard auto-offer skips the already-configured folded identity.
  const offer = plan.filter((c) => !out.tracks[c.id]);
  assert.deepEqual(offer.map((c) => c.id), ["linkedin"]);
});

test("exact id identity always wins over the fold", () => {
  const prev = [ch("facebook-skupiny", "Facebook skupiny")];
  const track = { stage: "planned", mode: "manual" };
  const plan = [ch("facebook-skupiny", "Facebookové skupiny (přejmenováno)")];
  const out = reconcilePlanTracks(plan, prev, { "facebook-skupiny": track });
  assert.deepEqual(out.tracks, { "facebook-skupiny": track });
  assert.deepEqual(out.orphans, []);
});

test("distinct channels don't fold — the leftover track is surfaced, not hidden", () => {
  const prev = [ch("facebook-skupiny", "Facebook skupiny")];
  const track = { stage: "live", mode: "twin", twinScope: "social" };
  const plan = [ch("facebook-stranka", "Facebook stránka")];
  const out = reconcilePlanTracks(plan, prev, { "facebook-skupiny": track });

  // The user's work is kept in the map (never silently dropped)...
  assert.deepEqual(out.tracks, { "facebook-skupiny": track });
  // ...and reported with its last-known name for the "no longer in the plan" note.
  assert.deepEqual(out.orphans, [{ id: "facebook-skupiny", name: "Facebook skupiny" }]);
  // The genuinely new channel still gets auto-offered.
  assert.deepEqual(plan.filter((c) => !out.tracks[c.id]).map((c) => c.id), ["facebook-stranka"]);
});

test("ambiguous folds refuse to carry (prefer surfaced orphan over a guessed merge)", () => {
  const track = { stage: "live", mode: "manual" };

  // Two PLAN channels claiming one identity: neither inherits the track.
  const twoInPlan = reconcilePlanTracks(
    [ch("fb-skupiny", "FB skupiny"), ch("facebookove-skupiny", "Facebookové skupiny")],
    [ch("facebook-skupiny", "Facebook skupiny")],
    { "facebook-skupiny": track }
  );
  assert.deepEqual(twoInPlan.tracks, { "facebook-skupiny": track });
  assert.deepEqual(twoInPlan.orphans, [{ id: "facebook-skupiny", name: "Facebook skupiny" }]);

  // Two PREV channels sharing one fold key: the key is poisoned, no carry.
  const twoInPrev = reconcilePlanTracks(
    [ch("facebookove-skupiny", "Facebookové skupiny")],
    [ch("facebook-skupiny", "Facebook skupiny"), ch("fb-skupiny", "FB skupiny")],
    { "facebook-skupiny": track }
  );
  assert.deepEqual(twoInPrev.tracks, { "facebook-skupiny": track });
  assert.equal(twoInPrev.orphans.length, 1);
});

test("a track is carried at most once and untouched plan channels stay trackless", () => {
  const prev = [ch("facebook-skupiny", "Facebook skupiny"), ch("linkedin", "LinkedIn")];
  const tracks = {
    "facebook-skupiny": { stage: "planned", mode: "twin", twinScope: "social" },
    linkedin: { stage: "done" },
  };
  const plan = [
    ch("facebookove-skupiny", "Facebookové skupiny"),
    ch("linkedin", "LinkedIn (organicky)"),
    ch("newsletter", "Newsletter"),
  ];
  const out = reconcilePlanTracks(plan, prev, tracks);
  assert.deepEqual(out.tracks, {
    "facebookove-skupiny": tracks["facebook-skupiny"],
    linkedin: tracks.linkedin,
  });
  assert.deepEqual(out.orphans, []);
  assert.equal(out.tracks.newsletter, undefined);
});
