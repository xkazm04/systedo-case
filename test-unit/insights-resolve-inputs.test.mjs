/** ONE recommendation-input resolver (src/lib/insights/resolve.ts) — every producer's
 *  resolved input comes from `resolveRecommendationInputs(project, {uid})`, and both
 *  Overview surfaces (the single-project view and the portfolio model) rank recs only
 *  through `recommendationsFor(project, locale, inputs)`.
 *
 *  Before this seam the two surfaces each hand-assembled a 4-resolver fanout and a
 *  6-of-7 positional `collectRecommendations` call, so:
 *   • the cadence producer (`publishing`) never ran in production — no caller threaded it;
 *   • the local "negative reviews need a reply" rec ignored the review-inbox triage the
 *     local DIAGNOSIS already joins, so /lokalni and the Overview disagreed.
 *
 *  Pinned here: the triage join (the SAME `resolveAnsweredTriage` the diagnosis reads),
 *  the publishing input with its degraded guard (a failed calendar source is not an
 *  empty week), the cost rule (no cadence caps → no calendar read), the demo seam
 *  (zero store I/O), and a source fence on the two callers.
 *
 *  Every store-facing module is mocked (the advice-store-route idiom), so this suite
 *  never joins the `@/lib/db` import chain. Run with --experimental-test-module-mocks. */
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

// --- mocked store seams ------------------------------------------------------

const calls = { getProjectState: 0, resolveCadenceRules: 0, resolvePublishingCalendar: 0 };
let triage = null; // project_state "reviews" blob
let resolvedReviews = [];
let rules = [];
let calendar = null;

beforeEach(() => {
  calls.getProjectState = 0;
  calls.resolveCadenceRules = 0;
  calls.resolvePublishingCalendar = 0;
  triage = null;
  resolvedReviews = [];
  rules = [];
  calendar = null;
});

mock.module("@/lib/project-state/store", {
  namedExports: {
    getProjectState: async (_uid, _pid, key) => {
      calls.getProjectState++;
      return key === "reviews" ? triage : null;
    },
  },
});

mock.module("@/lib/publishing/resolve", {
  namedExports: {
    resolveCadenceRules: async () => {
      calls.resolveCadenceRules++;
      return rules;
    },
    resolvePublishingCalendar: async () => {
      calls.resolvePublishingCalendar++;
      return calendar;
    },
  },
});

mock.module("@/lib/local-signals/resolve", {
  namedExports: {
    resolveCoverage: async (_pid, targets) => ({ targets, live: false, source: "sample" }),
    resolveLocalLadder: async () => ({ ladder: [], live: false }),
    resolveReviews: async () => ({ reviews: resolvedReviews, live: true }),
    resolvePacks: async () => ({ packs: [], live: false }),
  },
});

mock.module("@/lib/catalog/load", {
  namedExports: {
    loadServicesFor: async () => [],
    loadPlansFor: async () => [],
  },
});

mock.module("@/lib/organic-channels/resolve", {
  namedExports: {
    resolveOrganicChannels: async (_pid, channels) => ({ channels, tracks: {}, source: "sample" }),
  },
});

mock.module("@/lib/competitors/store", {
  namedExports: { getCompetitors: async () => null },
});

mock.module("@/lib/report-metrics/store", {
  namedExports: { hasSyncedMetrics: async () => false },
});

const { resolveRecommendationInputs, demoRecommendationInputs } = await import(
  "@/lib/insights/resolve"
);
const { recommendationsFor } = await import("@/lib/insights/aggregate");
const { DEMO_PROJECTS } = await import("@/lib/demo/projects");

// --- fixtures ----------------------------------------------------------------

const localProject = {
  id: "11111111-2222-4333-8444-555555555555",
  name: "Dentalis",
  type: "local",
  accentColor: "#14b8b1",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};
const contentProject = { ...localProject, id: "66666666-7777-4888-8999-aaaaaaaaaaaa", type: "content" };

const REVIEWS = [
  { id: "r1", author: "A", area: "Praha", rating: 5, text: "super", daysAgo: 1 },
  { id: "r2", author: "B", area: "Praha", rating: 2, text: "špatné", daysAgo: 3 },
  { id: "r3", author: "C", area: "Brno", rating: 1, text: "hrozné", daysAgo: 5 },
];

const AT = "2026-09-23T10:00:00.000Z";
const INSTAGRAM_CAP = { channel: "instagram", maxPerWeek: 3, organicId: "instagram-organic" };
const LINKEDIN_CAP = { channel: "linkedin", maxPerWeek: 2, organicId: "linkedin-organic" };
const HEALTHY = { social: "ok", "content-plan": "empty", twin: "ok", distribution: "empty" };
const item = (n, channel = "instagram") => ({
  id: `social:${channel}-${n}`,
  source: "social",
  channel,
  at: AT,
  title: `post ${n}`,
  status: "scheduled",
});

const NEG_KEY = "lokalni:unanswered-negative-reviews";
const keys = (recs) => recs.map((r) => r.subjectKey);

// --- cases ---------------------------------------------------------------------

test("1. the local input joins the inbox triage — every negative answered → no reply nudge", async () => {
  resolvedReviews = REVIEWS;
  triage = { answered: ["r2", "r3"] };
  const inputs = await resolveRecommendationInputs(localProject, { uid: "u1" });
  assert.deepEqual(inputs.local.answeredReviewIds, ["r2", "r3"]);
  const recs = recommendationsFor(localProject, "cs", inputs);
  assert.equal(keys(recs).includes(NEG_KEY), false, "answered negatives are not 'awaiting a reply'");
});

test("2. one negative still unanswered → exactly one nudge, counting 1", async () => {
  resolvedReviews = REVIEWS;
  triage = { answered: ["r2"] };
  const inputs = await resolveRecommendationInputs(localProject, { uid: "u1" });
  const neg = recommendationsFor(localProject, "cs", inputs).filter((r) => r.subjectKey === NEG_KEY);
  assert.equal(neg.length, 1);
  assert.equal(neg[0].metric, "1");
  assert.ok(neg[0].title.startsWith("1"), neg[0].title);
});

test("3. no cadence caps → the calendar is never read and publishing is null", async () => {
  rules = [];
  calendar = { items: [], rules: [], sources: HEALTHY };
  const inputs = await resolveRecommendationInputs(contentProject, { uid: "u1", at: AT });
  assert.equal(calls.resolvePublishingCalendar, 0, "no caps → no four-scheduler read");
  assert.equal(inputs.publishing, null);
  // …and an anonymous viewer never reaches the publishing seam at all.
  rules = [INSTAGRAM_CAP];
  const anon = await resolveRecommendationInputs(contentProject, { uid: null, at: AT });
  assert.equal(anon.publishing, null);
  assert.equal(calls.resolvePublishingCalendar, 0);
});

test("4. a capped channel with an empty week reaches the Overview as zero-planned", async () => {
  rules = [INSTAGRAM_CAP];
  calendar = { items: [], rules: [INSTAGRAM_CAP], sources: HEALTHY };
  const inputs = await resolveRecommendationInputs(contentProject, { uid: "u1", at: AT });
  const ig = inputs.publishing.checks.find((c) => c.channel === "instagram");
  assert.ok(ig, "instagram is checked");
  assert.equal(ig.count, 0);
  assert.equal(ig.cap, 3);
  assert.ok(keys(recommendationsFor(contentProject, "cs", inputs)).includes("kanaly:zero-planned:instagram"));
});

test("5. a failed calendar source never reads as an empty week — but over-cap still stands", async () => {
  rules = [INSTAGRAM_CAP, LINKEDIN_CAP];
  calendar = {
    items: [1, 2, 3, 4, 5].map((n) => item(n)),
    rules: [INSTAGRAM_CAP, LINKEDIN_CAP],
    sources: { ...HEALTHY, twin: "error" },
  };
  const inputs = await resolveRecommendationInputs(contentProject, { uid: "u1", at: AT });
  const k = keys(recommendationsFor(contentProject, "cs", inputs));
  assert.deepEqual(k.filter((x) => x.startsWith("kanaly:zero-planned:")), [], "undercount cannot invent a zero");
  assert.ok(k.includes("kanaly:over-cap:instagram"), "an undercount can hide an over-cap, never invent one");
});

test("6. a demo fixture id resolves with zero store calls and no publishing input", async () => {
  rules = [INSTAGRAM_CAP];
  calendar = { items: [], rules: [INSTAGRAM_CAP], sources: HEALTHY };
  triage = { answered: ["x"] };
  for (const p of DEMO_PROJECTS) {
    const inputs = await resolveRecommendationInputs(p, { uid: "u1", at: AT });
    assert.equal(inputs.publishing, null, p.id);
    assert.deepEqual(inputs, demoRecommendationInputs(p), p.id);
  }
  assert.equal(calls.getProjectState, 0);
  assert.equal(calls.resolveCadenceRules, 0);
  assert.equal(calls.resolvePublishingCalendar, 0);
});

test("7. source fence — both Overview surfaces rank recs only through the one resolver", () => {
  for (const file of ["src/components/app/ProjectOverview.tsx", "src/components/app/overview/portfolio-model.ts"]) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal(src.includes("collectRecommendations("), false, `${file} hand-assembles the positional call`);
    assert.ok(src.includes("recommendationsFor("), `${file} ranks through recommendationsFor`);
    assert.ok(
      src.includes("resolveRecommendationInputs(") || src.includes("demoRecommendationInputs("),
      `${file} resolves through the one resolver`
    );
  }
});
