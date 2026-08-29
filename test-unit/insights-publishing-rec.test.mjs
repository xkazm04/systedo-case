/** The Overview's cadence recs — the producer that turns an enforced cap into
 *  something the operator is told about.
 *
 *  It is threaded exactly like the other resolved seams (local signals, SEO
 *  queries, the channel plan): one optional trailing input on
 *  `collectRecommendations`, resolved by the caller, with async I/O kept out of
 *  the pure aggregator. Two properties are pinned here:
 *
 *   • THE SEAM IS INVISIBLE UNTIL ADOPTED. The portfolio model and ProjectOverview
 *     do not pass it, so omitting it must be byte-identical to the pre-seam
 *     output — deep-equality, not "roughly the same recs".
 *   • NO SAMPLE PATH. Unlike every other producer, this one has no fixture to fall
 *     back to: a cadence rec is derived from the tenant's own tracked caps and
 *     their own four schedulers, so it is never `sample`-tagged and never invented
 *     from a seed. No input ⇒ silence.
 *
 *  Pure — no store, no model, no clock. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { collectRecommendations } = await import("@/lib/insights/aggregate");

const project = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  name: "Mionelo",
  type: "content",
  domain: "mionelo.cz",
  accentColor: "#123456",
};

const check = (over = {}) => ({
  channel: "instagram",
  weekStart: "2026-08-24",
  count: 1,
  cap: 3,
  exceeded: false,
  ...over,
});

const cadenceRecs = (recs) =>
  recs.filter((r) => r.module === "kanaly" && /limitem kadence|nic v plánu|cadence cap|nothing planned/.test(r.title));

test("omitting the seam is byte-identical to the recs before it existed", () => {
  const before = collectRecommendations(project, "cs", null, null, false, null);
  const after = collectRecommendations(project, "cs", null, null, false, null, undefined);
  assert.deepEqual(before, after);
  // An explicit null is the same silence as an omission.
  assert.deepEqual(collectRecommendations(project, "cs", null, null, false, null, null), before);
  assert.equal(cadenceRecs(before).length, 0);
});

test("a channel over its cap is a WARNING that names the override, not an alarm", () => {
  const recs = collectRecommendations(project, "cs", null, null, false, null, {
    checks: [check({ count: 5, cap: 3, exceeded: true })],
  });
  const [over] = cadenceRecs(recs);
  assert.ok(over, "the rec is produced");
  assert.equal(over.severity, "warning");
  assert.equal(over.module, "kanaly");
  assert.match(over.title, /Instagram/);
  assert.equal(over.metric, "5/3");
  assert.match(over.detail, /výslovným potvrzením/);
});

test("a capped channel with an empty week is an INFO, not a warning", () => {
  const recs = collectRecommendations(project, "cs", null, null, false, null, {
    checks: [check({ channel: "linkedin", count: 0, cap: 2 })],
  });
  const [idle] = cadenceRecs(recs);
  assert.equal(idle.severity, "info");
  assert.match(idle.title, /LinkedIn/);
  assert.equal(idle.metric, "0/2");
});

test("a channel comfortably inside its cap says nothing at all", () => {
  const recs = collectRecommendations(project, "cs", null, null, false, null, {
    checks: [check({ count: 2, cap: 3 }), check({ channel: "linkedin", count: 3, cap: 3 })],
  });
  // Exactly at the cap is the cap being KEPT — the promise working, not news.
  assert.equal(cadenceRecs(recs).length, 0);
});

test("a channel with no cap produces nothing — an unconfigured channel is not advice", () => {
  const recs = collectRecommendations(project, "cs", null, null, false, null, {
    checks: [check({ count: 0, cap: null })],
  });
  assert.equal(cadenceRecs(recs).length, 0);
});

test("cadence recs are the tenant's own data — they never wear the sample badge", () => {
  const recs = collectRecommendations(project, "cs", null, null, false, null, {
    checks: [check({ count: 9, cap: 1 }), check({ channel: "linkedin", count: 0, cap: 2 })],
  });
  const produced = cadenceRecs(recs);
  assert.equal(produced.length, 2);
  for (const r of produced) assert.notEqual(r.sample, true);
});

test("both cadence sentences are localized, not Czech-only", () => {
  const recs = collectRecommendations(project, "en", null, null, false, null, {
    checks: [check({ count: 5, cap: 3 }), check({ channel: "linkedin", count: 0, cap: 2 })],
  });
  const [over, idle] = cadenceRecs(recs);
  assert.match(over.title, /over the cadence cap/);
  assert.match(over.detail, /explicit override/);
  assert.match(idle.title, /nothing planned this week/);
  assert.match(idle.detail, /cadence of 2× a week/);
});

test("a warning outranks the info in the same list", () => {
  const recs = collectRecommendations(project, "cs", null, null, false, null, {
    checks: [check({ channel: "linkedin", count: 0, cap: 2 }), check({ count: 5, cap: 3 })],
  });
  const produced = cadenceRecs(recs);
  assert.equal(produced[0].severity, "warning");
  assert.equal(produced[1].severity, "info");
});
