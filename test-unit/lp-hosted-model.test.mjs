/** WP W3-B — the PURE half of hosted LP experiments: how an arm is assigned, what a
 *  submitted arm payload is allowed to be, and the three state transitions that
 *  publish, unpublish and sync an experiment.
 *
 *  The uniformity test is the load-bearing one. `evaluate()`'s two-proportion
 *  significance math assumes equal, independent allocation; a split that drifted (or
 *  that quietly favoured the arm winning so far) would make every verdict the module
 *  prints wrong in a way no other test could see. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { pickArm, mintArmId, isServedArm } = await import("@/lib/lp-exp/serve");
const { sanitizeLpArms, sanitizeLpArm, mintLpSlug, isOperatorTarget } = await import(
  "@/lib/microsite/lp-page"
);
const { hostExperiment, unhostExperiment, syncArmCounts, replaceExperiment, sanitizeVariant } =
  await import("@/lib/lp-exp/types");

const arms = (...ids) => ids.map((armId) => ({ armId }));

/* ── assignment ─────────────────────────────────────────────────────────────── */

test("pickArm splits UNIFORMLY over 10k draws (±2 %) — the significance math depends on it", () => {
  // A deterministic, well-spread sequence rather than Math.random, so the assertion
  // is a property of pickArm and not a coin-flip that fails once a fortnight in CI.
  let i = 0;
  const rng = () => ((i++ * 2654435761) % 1_000_003) / 1_000_003;
  const three = arms("a", "b", "c");
  const hits = { a: 0, b: 0, c: 0 };
  const N = 10_000;
  for (let n = 0; n < N; n++) hits[pickArm(three, rng).armId]++;
  const expected = N / 3;
  for (const id of ["a", "b", "c"]) {
    const drift = Math.abs(hits[id] - expected) / expected;
    assert.ok(drift < 0.02, `${id} drew ${hits[id]} of ${N} (drift ${(drift * 100).toFixed(2)} %)`);
  }
  assert.equal(hits.a + hits.b + hits.c, N, "every draw landed on exactly one arm");
});

test("pickArm never runs off the end, and an empty arm list is null (not a throw)", () => {
  const two = arms("a", "b");
  assert.equal(pickArm(two, () => 0).armId, "a");
  assert.equal(pickArm(two, () => 0.9999999999).armId, "b", "r→1 clamps to the last arm");
  assert.equal(pickArm(two, () => 1).armId, "b", "a badly-behaved RNG cannot index past the end");
  assert.equal(pickArm(two, () => NaN).armId, "a", "a non-finite draw degrades, never crashes");
  assert.equal(pickArm([], () => 0.5), null);
});

test("a minted arm id is opaque, bounded and not derived from the label", () => {
  const a = mintArmId(() => 0.123456);
  const b = mintArmId(() => 0.987654);
  assert.match(a, /^a[a-z0-9]+$/);
  assert.ok(a.length <= 40, "fits ARM_ID_MAX");
  assert.notEqual(a, b, "different draws mint different ids");
});

test("isServedArm is the beacon's whole authorization check", () => {
  const three = arms("a", "b", "c");
  assert.equal(isServedArm(three, "b"), true);
  assert.equal(isServedArm(three, "zzz"), false, "an arm the page never rendered is not a hit");
  assert.equal(isServedArm([], "a"), false);
});

/* ── the wire door ──────────────────────────────────────────────────────────── */

const copy = (n) => ({
  label: `V${n}`,
  headline: `Nadpis ${n}`,
  intro: `Úvodní odstavec varianty ${n}.`,
  bullets: [`Bod ${n}a`, `Bod ${n}b`],
  cta: "Mám zájem",
});

test("sanitizeLpArms keys the arms by the SERVER's ids, never the body's", () => {
  const submitted = [
    { ...copy(1), armId: "hostile-1" },
    { ...copy(2), armId: "hostile-2" },
  ];
  const out = sanitizeLpArms(submitted, ["srv-1", "srv-2"]);
  assert.deepEqual(
    out.map((a) => a.armId),
    ["srv-1", "srv-2"],
    "a body-supplied armId is ignored entirely"
  );
});

test("sanitizeLpArms is all-or-nothing, count-fixed and duplicate-proof", () => {
  assert.equal(sanitizeLpArms([copy(1), { label: "V2" }], ["a", "b"]).length, 0, "one hollow arm refuses the whole set");
  assert.equal(sanitizeLpArms([copy(1), copy(2), copy(3)], ["a", "b"]).length, 2, "extra submitted arms are ignored");
  assert.equal(sanitizeLpArms([copy(1), copy(2)], ["a"]).length, 1);
  assert.equal(sanitizeLpArms([copy(1), copy(2)], ["a", "a"]).length, 0, "duplicate ids would collapse two arms onto one counter");
  assert.equal(sanitizeLpArms(copy(1), ["a"]).length, 0, "a non-array body is not an arm set");
  assert.equal(sanitizeLpArms([copy(1)], []).length, 0);
});

test("one arm is clamped to the published caps and drops unknown keys", () => {
  const arm = sanitizeLpArm(
    {
      label: "L".repeat(200),
      headline: "H".repeat(400),
      intro: "I".repeat(900),
      bullets: ["a", "", "  ", "b", "c", "d", "e", "f"],
      cta: "C".repeat(200),
      price: 999,
      visitors: 5,
    },
    "srv-1"
  );
  assert.equal(arm.headline.length, 120);
  assert.equal(arm.intro.length, 600);
  assert.equal(arm.label.length, 60);
  assert.equal(arm.cta.length, 60);
  assert.equal(arm.bullets.length, 5, "capped at five, blanks dropped");
  assert.equal(arm.price, undefined, "the payload is BUILT, so no numeric field can ride in");
  assert.equal(arm.visitors, undefined);
});

test("the CTA target admits only schemes an operator can have meant", () => {
  for (const ok of ["https://taskio.cz/registrace", "mailto:info@taskio.cz", "tel:+420111222333"]) {
    assert.equal(isOperatorTarget(ok), true, ok);
  }
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://taskio.cz", "taskio.cz", "", 42]) {
    assert.equal(isOperatorTarget(bad), false, String(bad));
  }
});

test("mintLpSlug folds client + cluster to the registry grammar, trimming at a word", () => {
  assert.equal(mintLpSlug("Taskio", "projektové řízení nástroj"), "taskio-projektove-rizeni-nastroj");
  const long = mintLpSlug("Taskio", "nástroj na řízení projektů pro malé i větší týmy");
  assert.ok(long.length <= 40 && !long.endsWith("-"), long);
  assert.equal(mintLpSlug("!!!", "???"), "", "nothing slug-shaped → the caller's 422");
});

/* ── the state transitions ──────────────────────────────────────────────────── */

const state = (variants, hosted) => ({
  items: [{ id: "e1", cluster: "CRM zdarma", status: "running", variants, ...(hosted ? { hosted } : {}) }],
  updatedAt: "2026-08-30T00:00:00.000Z",
});
const hand = [
  { label: "A", visitors: 100, signups: 10 },
  { label: "B", visitors: 100, signups: 20 },
];

test("hostExperiment stamps ids positionally and REUSES an existing id on re-publish", () => {
  const first = hostExperiment(state(hand), "e1", ["x1", "x2"], "taskio-crm").state;
  assert.deepEqual(first.items[0].variants.map((v) => v.armId), ["x1", "x2"]);
  assert.equal(first.items[0].hosted.slug, "taskio-crm");
  // A re-publish passing blanks keeps the identities the counters already use.
  const again = hostExperiment(first, "e1", ["", ""], "taskio-crm").state;
  assert.deepEqual(again.items[0].variants.map((v) => v.armId), ["x1", "x2"]);
  assert.equal(hostExperiment(state(hand), "nope", ["x"], "s").found, false);
});

test("unhostExperiment keeps the arm ids — the counters already collected are real", () => {
  const hosted = hostExperiment(state(hand), "e1", ["x1", "x2"], "s").state;
  const off = unhostExperiment(hosted, "e1").state;
  assert.equal(off.items[0].hosted, undefined, "the binding is gone");
  assert.deepEqual(off.items[0].variants.map((v) => v.armId), ["x1", "x2"], "…the identities are not");
  assert.equal(unhostExperiment(off, "e1").found, false, "unhosting twice is a no-op");
});

test("syncArmCounts OVERWRITES identified arms and NEVER touches hand-typed ones", () => {
  const mixed = state([
    { label: "A", visitors: 100, signups: 10, armId: "x1" },
    { label: "B", visitors: 999, signups: 500 }, // hand-typed: no armId
  ]);
  const totals = new Map([
    ["x1", { views: 40, conversions: 3 }],
    ["x2", { views: 77, conversions: 7 }], // an arm this experiment does not have
  ]);
  const { state: next, changed } = syncArmCounts(mixed, "e1", totals);
  assert.equal(changed, true);
  assert.deepEqual(next.items[0].variants[0], { label: "A", visitors: 40, signups: 3, armId: "x1" });
  assert.deepEqual(
    next.items[0].variants[1],
    { label: "B", visitors: 999, signups: 500 },
    "the operator's own numbers are not ours to rewrite"
  );
  // Recompute, not accumulate: a LOWER total (retention aged a day out) moves it down.
  const lower = syncArmCounts(next, "e1", new Map([["x1", { views: 12, conversions: 1 }]]));
  assert.equal(lower.state.items[0].variants[0].visitors, 12);
  // A served arm with no rows at all reads as zero, not as its stale previous number.
  const none = syncArmCounts(next, "e1", new Map());
  assert.equal(none.state.items[0].variants[0].visitors, 0);
});

test("the signups ≤ visitors clamp still holds AFTER a sync (the integrity boundary)", () => {
  const hosted = state([{ label: "A", visitors: 0, signups: 0, armId: "x1" }]);
  // More conversions than views: a bot filtered on the way in but not on the way out,
  // or a page cached upstream. It must never publish a >100 % conversion rate into
  // evaluate() — and from there into a live tenant's AI prompts.
  const { state: next } = syncArmCounts(hosted, "e1", new Map([["x1", { views: 3, conversions: 9 }]]));
  const arm = next.items[0].variants[0];
  assert.equal(arm.visitors, 3);
  assert.equal(arm.signups, 3, "clamped to the traffic that produced it");
  assert.ok(arm.signups <= arm.visitors);
  // …and the same clamp survives a round-trip through the wire sanitizer.
  const round = sanitizeVariant(arm);
  assert.ok(round.signups <= round.visitors);
});

test("syncArmCounts reports `changed:false` when nothing moved, so an idle project writes nothing", () => {
  const hosted = state([{ label: "A", visitors: 40, signups: 3, armId: "x1" }]);
  const totals = new Map([["x1", { views: 40, conversions: 3 }]]);
  assert.equal(syncArmCounts(hosted, "e1", totals).changed, false);
});

test("a manual edit carries the hosted binding and each arm's id forward (no orphaned counters)", () => {
  const hosted = hostExperiment(state(hand), "e1", ["x1", "x2"], "taskio-crm").state;
  // The manager's PATCH body: labels and numbers, no armId, no hosted — exactly what
  // the edit form sends.
  const edited = replaceExperiment(hosted, "e1", {
    cluster: "CRM zdarma",
    status: "running",
    variants: [
      { label: "A · přejmenováno", visitors: 1, signups: 0 },
      { label: "B · přejmenováno", visitors: 1, signups: 0 },
    ],
  }).state;
  assert.deepEqual(edited.items[0].variants.map((v) => v.armId), ["x1", "x2"]);
  assert.equal(edited.items[0].hosted.slug, "taskio-crm");
  assert.equal(edited.items[0].variants[0].label, "A · přejmenováno");
});
