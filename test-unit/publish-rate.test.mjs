/** The AI-content publish rate (src/lib/activity/publish-rate.ts): the rollup that
 *  finally READS the two event streams the app was already writing — llmTelemetry
 *  generations and the activity feed's publish taxonomy.
 *
 *  The measure's whole value is that it is honest, so most of these tests are about
 *  what it must REFUSE to say: no rate without events, no rate from a two-event
 *  sample, no >100 % from re-copying one asset, and nothing counted from the
 *  "post scheduled" row that is only a promise. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publishRateRollup,
  bucketForKind,
  bucketForTool,
  PUBLISH_BUCKETS,
  MIN_GENERATIONS_FOR_RATE,
  DEFAULT_PUBLISH_WINDOW_DAYS,
} from "@/lib/activity/publish-rate";
import { PUBLISH_ASSET_KINDS } from "@/lib/activity/publish";
import { socialPostActivityRow, socialPostPublishFields } from "@/lib/activity/publish";

const NOW = new Date("2026-08-03T12:00:00.000Z");
const daysAgo = (n, hour = 0) =>
  new Date(NOW.getTime() - n * 86_400_000 + hour * 3_600_000).toISOString();

/** n generations of `tool`, one per day, `startDay` days ago and older. */
const gens = (tool, n, startDay = 10) =>
  Array.from({ length: n }, (_, i) => ({ toolId: tool, at: daysAgo(startDay + i) }));

// --- the bucket join --------------------------------------------------------

test("every publish kind in the taxonomy maps to exactly one bucket", () => {
  for (const kind of PUBLISH_ASSET_KINDS) {
    const bucket = bucketForKind(kind);
    assert.ok(bucket, `${kind} has no bucket — its publishes would be silently dropped`);
    const owners = PUBLISH_BUCKETS.filter((b) => b.kinds.includes(kind));
    assert.equal(owners.length, 1, `${kind} is claimed by ${owners.length} buckets`);
  }
});

test("no tool is claimed by two buckets (one generation counts once)", () => {
  const seen = new Set();
  for (const b of PUBLISH_BUCKETS) {
    for (const tool of b.tools) {
      assert.ok(!seen.has(tool), `${tool} appears in more than one bucket`);
      seen.add(tool);
    }
  }
});

test("iteration/non-shipping tools are excluded from the denominator", () => {
  // `refine` re-rolls an asset that was already counted; `chat` never leaves the
  // app. Counting either would depress the rate with phantom generations.
  for (const tool of ["refine", "chat", "voice", "twin-style", "onboarding-scan"]) {
    assert.equal(bucketForTool(tool), null, `${tool} must not be a denominator`);
  }
  assert.equal(bucketForTool("ads"), "ad_copy");
  assert.equal(bucketForTool("repurpose"), "channel_variant");
});

test("the newsletter variant shares its generator's bucket", () => {
  // One `repurpose` call produces the variant for whichever channel was asked for,
  // and the Newsletter channel publishes as `newsletter` — so they must land in the
  // same bucket or every newsletter publish is denominator-less forever.
  assert.equal(bucketForKind("newsletter"), bucketForTool("repurpose"));
  assert.equal(bucketForKind("social_post"), bucketForTool("repurpose"));
});

// --- the empty / thin cases (the point of the whole exercise) ---------------

test("zero events → no rate at all, not 0 %", () => {
  const r = publishRateRollup([], [], { now: NOW });
  assert.equal(r.status, "no-generations");
  assert.equal(r.rate, null);
  assert.equal(r.generated, 0);
  assert.equal(r.published, 0);
});

test("zero generations but publishes present → still no rate (nothing to divide by)", () => {
  const r = publishRateRollup([], [{ kind: "article", at: daysAgo(2) }], { now: NOW });
  assert.equal(r.status, "no-generations");
  assert.equal(r.rate, null);
  // The publish is not lost — it is reported as having no generation behind it.
  assert.equal(r.publishEvents, 1);
  assert.equal(r.unmatchedPublishes, 1);
});

test("a sample below the minimum reports counts but withholds the percentage", () => {
  const r = publishRateRollup(gens("ads", 2), [{ kind: "ad_copy", at: daysAgo(9) }], { now: NOW });
  assert.equal(r.status, "insufficient");
  assert.equal(r.rate, null);
  assert.equal(r.generated, 2);
  assert.equal(r.published, 1);
  assert.equal(r.minGenerations, MIN_GENERATIONS_FOR_RATE);
});

test("one more generation than the minimum flips it to measured", () => {
  const g = gens("ads", MIN_GENERATIONS_FOR_RATE);
  const r = publishRateRollup(g, [], { now: NOW });
  assert.equal(r.status, "ok");
  assert.equal(r.rate, 0); // a REAL, measured zero — nothing was ever shipped
});

// --- the arithmetic ---------------------------------------------------------

test("published ÷ generated over the window", () => {
  const g = gens("ads", 10);
  const pubs = [1, 2, 3, 4].map((i) => ({ kind: "ad_copy", at: daysAgo(10 - i, 6) }));
  const r = publishRateRollup(g, pubs, { now: NOW });
  assert.equal(r.generated, 10);
  assert.equal(r.published, 4);
  assert.equal(r.rate, 0.4);
  assert.equal(r.unmatchedPublishes, 0);
});

test("re-copying one asset cannot push the rate above 100 %", () => {
  // Five generations, twenty copies (a user pasting the same variant everywhere).
  const g = gens("ads", 5);
  const pubs = Array.from({ length: 20 }, () => ({ kind: "ad_copy", at: daysAgo(1) }));
  const r = publishRateRollup(g, pubs, { now: NOW });
  assert.equal(r.rate, 1);
  assert.equal(r.published, 5);
  assert.equal(r.publishEvents, 20);
  assert.equal(r.unmatchedPublishes, 15);
});

test("a publish BEFORE any generation claims nothing", () => {
  // Copying the deterministic (non-AI) variant on day 10, generating on day 3.
  const r = publishRateRollup(gens("ads", 5, 3), [{ kind: "ad_copy", at: daysAgo(10) }], {
    now: NOW,
  });
  assert.equal(r.published, 0);
  assert.equal(r.unmatchedPublishes, 1);
  assert.equal(r.rate, 0);
});

test("events outside the window are ignored on BOTH sides", () => {
  const g = [...gens("ads", 5, 3), ...gens("ads", 5, 90)];
  const pubs = [
    { kind: "ad_copy", at: daysAgo(1) },
    { kind: "ad_copy", at: daysAgo(80) },
    { kind: "ad_copy", at: daysAgo(-5) }, // in the future — not a recorded past event
  ];
  const r = publishRateRollup(g, pubs, { now: NOW, windowDays: DEFAULT_PUBLISH_WINDOW_DAYS });
  assert.equal(r.generated, 5);
  assert.equal(r.publishEvents, 1);
  assert.equal(r.published, 1);
});

test("malformed timestamps are dropped, never counted as now", () => {
  const r = publishRateRollup(
    [...gens("ads", 5), { toolId: "ads", at: "not-a-date" }],
    [{ kind: "ad_copy", at: "" }],
    { now: NOW }
  );
  assert.equal(r.generated, 5);
  assert.equal(r.publishEvents, 0);
});

// --- breakout by kind -------------------------------------------------------

test("the breakout keeps each family's arithmetic independent", () => {
  const g = [...gens("ads", 4, 20), ...gens("article-draft", 2, 12), ...gens("repurpose", 4, 8)];
  const pubs = [
    { kind: "ad_copy", at: daysAgo(19) },
    { kind: "article", at: daysAgo(11) },
    { kind: "article", at: daysAgo(10) },
    { kind: "social_post", at: daysAgo(7) },
    { kind: "newsletter", at: daysAgo(6) },
  ];
  const r = publishRateRollup(g, pubs, { now: NOW });
  const by = Object.fromEntries(r.buckets.map((b) => [b.bucket, b]));
  assert.equal(by.ad_copy.generated, 4);
  assert.equal(by.ad_copy.published, 1);
  assert.equal(by.ad_copy.rate, 0.25);
  assert.equal(by.article.rate, 1); // 2 of 2
  // Both the social and the newsletter variant come from the repurpose generations.
  assert.equal(by.channel_variant.generated, 4);
  assert.equal(by.channel_variant.published, 2);
  assert.equal(by.channel_variant.rate, 0.5);
  // A family with no events at all carries a null rate, not a zero.
  assert.equal(by.keyword_list.generated, 0);
  assert.equal(by.keyword_list.rate, null);
  // The overall rate is the sum of the parts, not an average of the ratios.
  assert.equal(r.generated, 10);
  assert.equal(r.published, 5);
  assert.equal(r.rate, 0.5);
});

test("an unmapped tool never enters the denominator", () => {
  const r = publishRateRollup([...gens("ads", 5), ...gens("refine", 50, 5)], [], { now: NOW });
  assert.equal(r.generated, 5);
});

// --- the scheduling row must never be counted -------------------------------

test("only the rows socialPostActivityRow marks as a publish carry the taxonomy", () => {
  for (const outcome of ["scheduled", "published", "failed"]) {
    const fields = socialPostPublishFields(outcome);
    const isPublish = socialPostActivityRow(outcome, "cs").publish;
    assert.equal("publishKind" in fields, isPublish, `${outcome} taxonomy mismatch`);
  }
  assert.deepEqual(socialPostPublishFields("published"), {
    publishKind: "social_post",
    publishVia: "channel",
  });
  assert.deepEqual(socialPostPublishFields("scheduled"), {});
  assert.deepEqual(socialPostPublishFields("failed"), {});
});

test("a scheduled-then-published post counts once; a scheduled-then-failed post counts zero", () => {
  // Feed rows the way the routes write them: only rows with a publishKind reach the
  // rollup at all (the reader filters on it), so this models the whole lifecycle.
  const rowsFor = (outcomes, at) =>
    outcomes
      .map((o) => socialPostPublishFields(o))
      .filter((f) => "publishKind" in f)
      .map((f) => ({ kind: f.publishKind, at }));

  const g = gens("social", 5, 5);
  const shipped = publishRateRollup(g, rowsFor(["scheduled", "published"], daysAgo(1)), { now: NOW });
  assert.equal(shipped.published, 1);

  const bounced = publishRateRollup(g, rowsFor(["scheduled", "failed"], daysAgo(1)), { now: NOW });
  assert.equal(bounced.published, 0);
  assert.equal(bounced.publishEvents, 0);
});
