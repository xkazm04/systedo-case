/** The Overview's "Kanál zdarma" rec must read the plan the tenant actually has.
 *
 *  It computed from `channelPlanForProject` — the SEEDED plan — unconditionally, so
 *  a tenant who had generated and pinned an AI plan on /kanaly was still recommended
 *  a channel off the seed list, one the pinned plan might not even contain, wearing
 *  an "ukázková data" badge it no longer deserved. `collectRecommendations` now takes
 *  the resolved plan (pinned AI plan else the seed, statuses merged in — what
 *  resolveOrganicChannels returns) and applies the MODULE's own quick-win rule.
 *
 *  Pins: the pinned-vs-seeded selection, the shared rule, untracked-first, and the
 *  provenance tag in both directions. Pure — no store, no model. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { collectRecommendations } = await import("@/lib/insights/aggregate");
const { channelPlanForProject } = await import("@/lib/organic-channels/sample");

const project = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  name: "Mionelo",
  type: "content",
  domain: "mionelo.cz",
  accentColor: "#123456",
};

const channelRec = (recs) => recs.find((r) => r.module === "kanaly");

const ch = (over = {}) => ({
  id: "kanal",
  name: "Kanál",
  category: "community",
  fit: 80,
  effort: "low",
  rationale: "Sedí.",
  payoff: "Přinese.",
  firstActions: ["Založte profil."],
  ...over,
});

/** A pinned AI plan: the quick win is NOT the first row, so a rec that reads the
 *  plan and one that reads the seed cannot accidentally agree. */
const pinned = {
  channels: [
    ch({ id: "vysoka-namaha", name: "Vysoká námaha", fit: 95, effort: "high" }),
    ch({ id: "slaby-fit", name: "Slabý fit", fit: 40, effort: "low" }),
    ch({ id: "nas-kanal", name: "Náš kanál", fit: 88, effort: "low" }),
  ],
  tracks: {},
  source: "ai",
};

test("a pinned AI plan decides the rec, not the seeded plan", () => {
  const rec = channelRec(collectRecommendations(project, "cs", null, null, false, pinned));
  assert.ok(rec, "the rec is still produced");
  assert.match(rec.title, /Náš kanál/);
  // …and it is provably not the seeded answer.
  const seeded = channelRec(collectRecommendations(project, "cs"));
  assert.notEqual(rec.title, seeded.title);
});

test("the rule is the module's own quick win: low effort, fit >= 70, best fit first", () => {
  const rec = channelRec(collectRecommendations(project, "cs", null, null, false, pinned));
  assert.match(rec.metric, /fit 88/);
});

test("a channel already in the lifecycle is not the next thing to start", () => {
  const tracked = { ...pinned, tracks: { "nas-kanal": { stage: "planned" } } };
  const rec = channelRec(collectRecommendations(project, "cs", null, null, false, tracked));
  // "Slabý fit" is the only other untracked channel that is low-effort; it misses the
  // fit bar, so the fallback chain picks the best untracked channel rather than
  // re-recommending work the tenant already started.
  assert.ok(!/Náš kanál/.test(rec.title), "the tracked quick win is skipped");
  assert.match(rec.title, /Vysoká námaha/);
});

test("a pinned AI plan is the tenant's own data — it must not wear the sample badge", () => {
  const rec = channelRec(collectRecommendations(project, "cs", null, null, false, pinned));
  assert.notEqual(rec.sample, true);
});

test("a seeded plan stays fixture-tagged, threaded or not", () => {
  const threaded = channelRec(
    collectRecommendations(project, "cs", null, null, false, {
      channels: channelPlanForProject(project),
      tracks: {},
      source: "sample",
    })
  );
  assert.equal(threaded.sample, true);
  // A degraded store read resolves to the sample with source "sample", so it lands
  // here too — fail-CLOSED, exactly like the local/metrics seams.
  const fallback = channelRec(collectRecommendations(project, "cs"));
  assert.equal(fallback.sample, true);
});

test("omitting the plan is byte-identical to the seeded plan threaded explicitly", () => {
  // The seam must be invisible to every caller that has not adopted it yet.
  const before = channelRec(collectRecommendations(project, "cs"));
  const after = channelRec(
    collectRecommendations(project, "cs", null, null, false, {
      channels: channelPlanForProject(project),
      tracks: {},
      source: "sample",
    })
  );
  assert.deepEqual(before, after);
});

test("an empty plan yields no rec instead of a crash", () => {
  const recs = collectRecommendations(project, "cs", null, null, false, {
    channels: [],
    tracks: {},
    source: "ai",
  });
  assert.equal(channelRec(recs), undefined);
});

/* The rec's BODY must describe the pick, not the rule. The fallback chain goes
 * past the quick-win bar on purpose (the Overview always wants one item), and the
 * detail line used to assert "low effort, high fit" regardless — about a channel
 * that is provably neither. */

test("a quick-win pick keeps the low-effort / high-fit claim", () => {
  const rec = channelRec(collectRecommendations(project, "cs", null, null, false, pinned));
  assert.match(rec.title, /Náš kanál/);
  assert.match(rec.detail, /nízkou náročností a vysokou vhodností/);
});

test("a fallback pick must NOT claim to be low effort and high fit", () => {
  // Only "Vysoká námaha" (fit 95, effort high) and "Slabý fit" (fit 40, effort
  // low) are left untracked — neither clears the bar, so the chain falls back.
  const tracked = { ...pinned, tracks: { "nas-kanal": { stage: "planned" } } };
  const rec = channelRec(collectRecommendations(project, "cs", null, null, false, tracked));
  assert.match(rec.title, /Vysoká námaha/);
  assert.ok(
    !/nízkou náročností a vysokou vhodností/.test(rec.detail),
    "the fallback must not describe a high-effort channel as a quick win"
  );
  assert.match(rec.detail, /rychlou výhru s nízkou náročností teď plán nenabízí/);
});

test("the fallback disclosure is localized, not Czech-only", () => {
  const tracked = { ...pinned, tracks: { "nas-kanal": { stage: "planned" } } };
  const rec = channelRec(collectRecommendations(project, "en", null, null, false, tracked));
  assert.match(rec.detail, /no low-effort quick win left right now/);
  assert.ok(!/Low-effort, high-fit/.test(rec.detail));
});
