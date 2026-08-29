/** The kanály cadence cap, made enforceable.
 *
 *  `ChannelTrack.maxPerWeek` was written by the setup wizard and shown in the
 *  playbook while NOTHING read it — the wizard's "víc jich modul nenavrhne" was a
 *  promise no code kept. These pins cover the pure half of keeping it: the channel
 *  join (four id spaces onto one key), the rule derivation (including the two ways
 *  a cap must be DROPPED rather than misapplied), and the week arithmetic the
 *  refusal hangs on.
 *
 *  Every instant below is built with `new Date(y, m, d, h)` — LOCAL time — so the
 *  Monday/Sunday boundary assertions hold in whatever timezone CI runs in. */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  CHANNEL_KEYS,
  channelKeyFromLabel,
  channelKeyFromOrganicId,
  channelKeyFromPlatform,
  channelKeyFromRepurpose,
  channelKeyFromContentChannel,
  isChannelKey,
} = await import("@/lib/publishing/channel-key");
const { cadenceRules, capFor, checkCadence, countsTowardCadence, weekCadence, weekStartIso } =
  await import("@/lib/publishing/cadence");

const iso = (y, m, d, h = 9) => new Date(y, m - 1, d, h, 0, 0, 0).toISOString();

const item = (over = {}) => ({
  id: "social:1",
  source: "social",
  channel: "instagram",
  at: iso(2026, 8, 26),
  title: "Post",
  status: "scheduled",
  ...over,
});

/* -------------------------------------------------------------------------- */
/*  The join: four id spaces, one key                                          */
/* -------------------------------------------------------------------------- */

test("the four social platforms are the canonical keys — identity, not a lookup", () => {
  for (const p of ["facebook", "instagram", "linkedin", "tiktok"]) {
    assert.equal(channelKeyFromPlatform(p), p);
    assert.ok(isChannelKey(p));
  }
});

test("organic slugs resolve onto the same key their social platform has", () => {
  assert.equal(channelKeyFromOrganicId("instagram-organic"), "instagram");
  assert.equal(channelKeyFromOrganicId("linkedin-organic"), "linkedin");
  assert.equal(channelKeyFromOrganicId("facebook-skupiny"), "facebook");
  assert.equal(channelKeyFromOrganicId("lokalni-fb-skupiny"), "facebook");
  assert.equal(channelKeyFromOrganicId("google-business-profile"), "gbp");
  assert.equal(channelKeyFromOrganicId("newsletter"), "newsletter");
  assert.equal(channelKeyFromOrganicId("vlastni-blog-seo"), "blog");
  assert.equal(channelKeyFromOrganicId("youtube"), "youtube");
  assert.equal(channelKeyFromOrganicId("pinterest"), "pinterest");
});

test("a channel this app cannot post to is 'other', never a near-miss", () => {
  // These are real seeded slugs. Guessing a key for them would let a cap on a
  // price-comparison listing refuse a LinkedIn post.
  for (const slug of [
    "heureka",
    "zbozi-cz",
    "firmy-cz",
    "mapy-cz",
    "reddit-komunity",
    "product-hunt",
    "g2-capterra",
    "organicke-vyhledavani",
    "spoluprace-tvurci",
    "oborove-portaly",
  ]) {
    assert.equal(channelKeyFromOrganicId(slug), "other", slug);
  }
});

test("Distribuce labels join too — including the one that is a single letter", () => {
  assert.equal(channelKeyFromRepurpose("X / Twitter"), "x");
  assert.equal(channelKeyFromRepurpose("Newsletter"), "newsletter");
  assert.equal(channelKeyFromRepurpose("LinkedIn"), "linkedin");
  assert.equal(channelKeyFromRepurpose("Instagram"), "instagram");
});

test("an unhanded content-plan slot has NO channel — the board posts nowhere by itself", () => {
  assert.equal(channelKeyFromContentChannel(undefined), "other");
  assert.equal(channelKeyFromContentChannel(null), "other");
  assert.equal(channelKeyFromContentChannel("facebook"), "facebook");
});

test("the matcher is diacritic- and separator-insensitive, and every key is known", () => {
  assert.equal(channelKeyFromLabel("Facebook Skupiny"), "facebook");
  assert.equal(channelKeyFromLabel("  "), "other");
  assert.equal(isChannelKey("nope"), false);
  assert.equal(CHANNEL_KEYS.at(-1), "other");
});

/* -------------------------------------------------------------------------- */
/*  Rule derivation                                                           */
/* -------------------------------------------------------------------------- */

const ch = (over = {}) => ({
  id: "kanal",
  name: "Kanál",
  category: "social",
  fit: 80,
  effort: "low",
  rationale: "",
  payoff: "",
  firstActions: [],
  ...over,
});

test("a tracked cap becomes a rule on the channel it names", () => {
  const rules = cadenceRules({ "instagram-organic": { stage: "live", maxPerWeek: 3 } }, []);
  assert.deepEqual(rules, [{ channel: "instagram", maxPerWeek: 3, organicId: "instagram-organic" }]);
  assert.equal(capFor(rules, "instagram"), 3);
  assert.equal(capFor(rules, "linkedin"), null);
});

test("a track with no cap, or a nonsense cap, produces no rule", () => {
  assert.deepEqual(cadenceRules({ "instagram-organic": { stage: "live" } }, []), []);
  assert.deepEqual(cadenceRules({ "instagram-organic": { stage: "live", maxPerWeek: 0 } }, []), []);
  assert.deepEqual(cadenceRules({}, []), []);
});

test("a cap on an unpostable channel is DROPPED, not collapsed onto 'other'", () => {
  // Otherwise Heureka's cap and a Reddit cap would share one bucket and refuse
  // each other's posts — and neither channel can be posted to from here at all.
  assert.deepEqual(cadenceRules({ heureka: { stage: "live", maxPerWeek: 1 } }, []), []);
});

test("a PINNED AI plan's minted id ('kanal-3') is recovered through the channel NAME", () => {
  const rules = cadenceRules(
    { "kanal-3": { stage: "live", maxPerWeek: 2 } },
    [ch({ id: "kanal-3", name: "LinkedIn" })]
  );
  assert.equal(rules.length, 1);
  assert.equal(rules[0].channel, "linkedin");
  assert.equal(rules[0].organicId, "kanal-3");
  // …and with no plan to look the name up in, it stays unmapped rather than guessed.
  assert.deepEqual(cadenceRules({ "kanal-3": { stage: "live", maxPerWeek: 2 } }, []), []);
});

test("two tracked channels on one key: the STRICTEST cap wins", () => {
  const rules = cadenceRules(
    {
      "instagram-organic": { stage: "live", maxPerWeek: 5 },
      "kanal-9": { stage: "live", maxPerWeek: 2 },
    },
    [ch({ id: "kanal-9", name: "Instagram" })]
  );
  assert.equal(rules.length, 1);
  assert.equal(rules[0].maxPerWeek, 2);
});

test("the twin voice scope rides the rule — the only bridge from a TwinChannel", () => {
  const rules = cadenceRules(
    { "linkedin-organic": { stage: "live", mode: "twin", twinScope: "social", maxPerWeek: 4 } },
    []
  );
  assert.equal(rules[0].twinScope, "social");
  // A manual channel carries no scope at all (the key is absent, not undefined).
  const manual = cadenceRules({ "linkedin-organic": { stage: "live", maxPerWeek: 4 } }, []);
  assert.equal("twinScope" in manual[0], false);
});

/* -------------------------------------------------------------------------- */
/*  Week arithmetic                                                            */
/* -------------------------------------------------------------------------- */

test("the week is LOCAL and ISO: Monday opens it, Sunday still belongs to it", () => {
  // 2026-08-24 is a Monday; 2026-08-30 the Sunday that closes the same week.
  assert.equal(weekStartIso(iso(2026, 8, 24, 0)), "2026-08-24");
  assert.equal(weekStartIso(iso(2026, 8, 30, 23)), "2026-08-24");
  // …and the next Monday opens a NEW week, one second later.
  assert.equal(weekStartIso(iso(2026, 8, 31, 0)), "2026-08-31");
});

test("an unreadable instant lands in no week at all", () => {
  assert.equal(weekStartIso("not-a-date"), "");
  assert.equal(weekStartIso(""), "");
});

test("only occupied slots consume the cap — a plan and a failure do not", () => {
  assert.equal(countsTowardCadence("scheduled"), true);
  assert.equal(countsTowardCadence("published"), true);
  assert.equal(countsTowardCadence("sent"), true);
  assert.equal(countsTowardCadence("planned"), false);
  assert.equal(countsTowardCadence("failed"), false);
});

/* -------------------------------------------------------------------------- */
/*  The check itself                                                           */
/* -------------------------------------------------------------------------- */

const RULES = [{ channel: "instagram", maxPerWeek: 2, organicId: "instagram-organic" }];

test("with no cap in force nothing is ever exceeded", () => {
  const items = Array.from({ length: 9 }, (_, i) => item({ id: `social:${i}` }));
  const check = checkCadence(items, "instagram", iso(2026, 8, 26), []);
  assert.equal(check.cap, null);
  assert.equal(check.exceeded, false);
  assert.equal(check.count, 9);
});

test("the cap binds on the item that would BREAK it, not the one that fills it", () => {
  const under = checkCadence([item({ id: "a" })], "instagram", iso(2026, 8, 26), RULES);
  assert.deepEqual(
    { count: under.count, cap: under.cap, exceeded: under.exceeded, weekStart: under.weekStart },
    { count: 1, cap: 2, exceeded: false, weekStart: "2026-08-24" }
  );
  const at = checkCadence([item({ id: "a" }), item({ id: "b" })], "instagram", iso(2026, 8, 26), RULES);
  assert.equal(at.exceeded, true, "two placed against a cap of two ⇒ the third is refused");
});

test("the count is per channel and per week — neighbours never borrow each other's slots", () => {
  const items = [
    item({ id: "a", channel: "linkedin" }),
    item({ id: "b", channel: "linkedin" }),
    item({ id: "c", at: iso(2026, 8, 31) }), // next week, same channel
    item({ id: "d", status: "planned" }), // this week, but only a plan
    item({ id: "e", status: "failed" }),
  ];
  const check = checkCadence(items, "instagram", iso(2026, 8, 26), RULES);
  assert.equal(check.count, 0);
  assert.equal(check.exceeded, false);
});

test("items from ANY source consume the same channel-week", () => {
  const items = [
    item({ id: "a", source: "social" }),
    item({ id: "b", source: "distribution", status: "sent" }),
  ];
  assert.equal(checkCadence(items, "instagram", iso(2026, 8, 26), RULES).exceeded, true);
});

test("a garbage scheduling instant is never refused — the gate fails OPEN", () => {
  const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
  const check = checkCadence(items, "instagram", "not-a-date", RULES);
  assert.equal(check.exceeded, false);
  assert.equal(check.count, 0);
});

test("weekCadence reports one check per capped channel, and only for capped channels", () => {
  const rules = [
    { channel: "instagram", maxPerWeek: 2, organicId: "instagram-organic" },
    { channel: "linkedin", maxPerWeek: 1, organicId: "linkedin-organic" },
  ];
  const checks = weekCadence([item({ id: "a" })], iso(2026, 8, 26), rules);
  assert.deepEqual(
    checks.map((c) => [c.channel, c.count, c.cap, c.exceeded]),
    [
      ["instagram", 1, 2, false],
      ["linkedin", 0, 1, false],
    ]
  );
});
