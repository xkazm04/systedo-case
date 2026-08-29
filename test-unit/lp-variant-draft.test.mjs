/** WP W3-B — the `lp-variant-draft` tool's pure halves: the prompt builder, the
 *  normalizer that COERCES the model's arms onto the server's identities, and the
 *  validator that refuses a draft an A/B test could not use.
 *
 *  The coercion is the security-shaped one. The arms in the result are BUILT from the
 *  request, so a model that invents an arm, drops one or renames an id cannot produce
 *  a payload whose arms are not the arms being measured — which is what would silently
 *  publish a page counting into an identity nothing reads. */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  buildLpVariantDraftPrompt,
  normalizeLpVariantDraft,
  validateLpVariantDraft,
  demoLpVariantDraft,
  baseLpArm,
} = await import("@/lib/ai/tools/lp-variant-draft");
const { validateLpVariantDraftIntent, validateLpVariantDraftRequest } = await import(
  "@/lib/ai/validation"
);

const req = {
  cluster: "projektové řízení nástroj",
  brand: "Taskio",
  brandContext: "Taskio — nástroj na řízení projektů pro malé týmy.",
  arms: [
    { armId: "arm-0", label: "A · Kontrola", hypothesis: "Obecný přehled osloví nejvíc lidí." },
    { armId: "arm-1", label: "B · Šablony", hypothesis: "Šablony zkrátí čas k hodnotě.", headline: "Z hotové šablony" },
  ],
};

const modelArm = (id, n) => ({
  armId: id,
  headline: `Nadpis ${n}`,
  intro: `Úvod ${n}.`,
  bullets: [`Bod ${n}a`, `Bod ${n}b`, `Bod ${n}c`],
  cta: `Akce ${n}`,
});

/* ── the prompt ─────────────────────────────────────────────────────────────── */

test("the prompt carries every arm's identity, label and hypothesis — and no numbers", () => {
  const p = buildLpVariantDraftPrompt(req);
  assert.ok(p.includes("armId: arm-0"));
  assert.ok(p.includes("armId: arm-1"));
  assert.ok(p.includes("Šablony zkrátí čas k hodnotě."), "each arm's own angle reaches the model");
  assert.ok(p.includes("Zadaný nadpis (vyjdi z něj): Z hotové šablony"));
  assert.ok(p.includes("KONTEXT ZNAČKY"));
  assert.ok(p.includes("Nevymýšlej žádná čísla."));
  assert.equal(p.includes("POZNÁMKA: podklady jsou ilustrativní"), false, "no sample hedge when not sampled");
  assert.ok(buildLpVariantDraftPrompt({ ...req, sample: true }).includes("ilustrativní"), "…and one when it is");
});

/* ── normalization ──────────────────────────────────────────────────────────── */

test("the result is BUILT from the request: invented arms are dropped, missing ones floored", () => {
  const parsed = {
    arms: [
      modelArm("arm-1", 2),
      modelArm("arm-hallucinated", 3), // an arm the experiment does not have
    ],
  };
  const { arms } = normalizeLpVariantDraft(parsed, req);
  assert.deepEqual(arms.map((a) => a.armId), ["arm-0", "arm-1"], "exactly the requested arms, in order");
  assert.equal(arms[1].headline, "Nadpis 2", "the arm the model DID write is used");
  // arm-0 falls to its OWN floor. It must NOT inherit arm-1's copy by position: two
  // arms with the same page is not an experiment, and it would burn the whole sample
  // size proving a page converts like itself.
  assert.ok(arms[0].headline.includes(req.cluster), arms[0].headline);
  assert.notEqual(arms[0].headline, arms[1].headline);
  assert.equal(arms.length, 2);
});

test("an arm that answers to a paraphrased id is still matched by POSITION", () => {
  const parsed = { arms: [modelArm("varianta A", 1), modelArm("varianta B", 2)] };
  const { arms } = normalizeLpVariantDraft(parsed, req);
  assert.equal(arms[0].headline, "Nadpis 1", "good copy is not thrown away over a formatting miss");
  assert.equal(arms[1].headline, "Nadpis 2");
  assert.deepEqual(arms.map((a) => a.armId), ["arm-0", "arm-1"], "…but the identities are still the server's");
});

test("a duplicate armId claim keeps the FIRST — the second arm's copy is not handed to the first", () => {
  const parsed = { arms: [modelArm("arm-0", 1), { ...modelArm("arm-0", 9), headline: "Podvržený" }] };
  const { arms } = normalizeLpVariantDraft(parsed, req);
  assert.equal(arms[0].headline, "Nadpis 1");
});

test("every field is clamped and the label comes from the SEED, not the model", () => {
  const parsed = {
    arms: [
      { armId: "arm-0", label: "podvržený štítek", headline: "H".repeat(400), intro: "I".repeat(900), bullets: Array(9).fill("b"), cta: "C".repeat(200) },
      modelArm("arm-1", 2),
    ],
  };
  const { arms } = normalizeLpVariantDraft(parsed, req);
  assert.equal(arms[0].label, "A · Kontrola", "the operator's arm name is not the model's to change");
  assert.equal(arms[0].headline.length, 120);
  assert.equal(arms[0].intro.length, 600);
  assert.equal(arms[0].cta.length, 60);
  assert.equal(arms[0].bullets.length, 5);
});

test("garbage parses fall to the deterministic floor rather than to nothing", () => {
  for (const junk of [null, "text", [], { arms: "nope" }, {}]) {
    const { arms } = normalizeLpVariantDraft(junk, req);
    assert.equal(arms.length, 2, JSON.stringify(junk));
    assert.ok(arms.every((a) => a.headline && a.intro && a.cta));
  }
});

/* ── validation ─────────────────────────────────────────────────────────────── */

test("a draft missing an arm, or repeating a headline, is re-prompted", () => {
  assert.deepEqual(validateLpVariantDraft({ arms: [modelArm("arm-0", 1), modelArm("arm-1", 2)] }, req), []);

  const missing = validateLpVariantDraft({ arms: [modelArm("arm-0", 1)] }, req);
  assert.equal(missing.length, 1);
  assert.ok(missing[0].includes("arm-1"), "the violation names the arm that is missing");

  const same = validateLpVariantDraft(
    { arms: [modelArm("arm-0", 1), { ...modelArm("arm-1", 2), headline: "Nadpis 1" }] },
    req
  );
  assert.equal(same.length, 1, "identical arms are one page served twice, not a test");
  assert.ok(same[0].includes("nadpis"));

  const hollow = validateLpVariantDraft({ arms: [modelArm("arm-0", 1), { armId: "arm-1", headline: "x" }] }, req);
  assert.equal(hollow.length, 1, "an arm with no intro is not a page");
  assert.equal(validateLpVariantDraft("not an object", req).length, 1, "a non-object always fails (→ one repair)");
});

/* ── the floor + the demo ───────────────────────────────────────────────────── */

test("the deterministic floor invents nothing and the demo is honestly marked", () => {
  const floor = baseLpArm(req.arms[1], req);
  assert.equal(floor.armId, "arm-1");
  assert.equal(floor.headline, "Z hotové šablony", "a seeded headline is kept, not replaced");
  assert.ok(floor.intro.includes("Taskio") && floor.intro.includes(req.cluster));
  assert.doesNotMatch(JSON.stringify(floor), /\d+\s?%/, "no invented statistic anywhere in the floor");

  const demo = demoLpVariantDraft(req);
  assert.equal(demo.arms.length, 2);
  assert.ok(demo.arms[0].intro.includes("Ukázkový výstup"), "the keyless path says so");
  assert.equal(demo.arms[1].intro.includes("Ukázkový výstup"), false, "…once, not on every arm");
});

/* ── the wire + grounding bounds ────────────────────────────────────────────── */

test("the wire intent carries WHICH experiment and nothing else", () => {
  assert.equal(validateLpVariantDraftIntent({ projectId: "p1", experimentId: "e1" }).valid, true);
  assert.equal(validateLpVariantDraftIntent({ projectId: "p1" }).valid, false, "no experiment named");
  assert.equal(validateLpVariantDraftIntent({ experimentId: "e1" }).valid, false, "no project named");
  assert.equal(validateLpVariantDraftIntent(null).valid, false);
  const withRefine = validateLpVariantDraftIntent({ projectId: "p1", experimentId: "e1", refine: "kratší" });
  assert.equal(withRefine.value.refine, "kratší");
});

test("the rebuilt request is bounded: unique ids, at least two arms, capped strings", () => {
  const ok = validateLpVariantDraftRequest({
    cluster: "c",
    brand: "b",
    arms: [
      { armId: "a1", label: "A" },
      { armId: "a1", label: "duplicate" },
      { armId: "a2", label: "B", hypothesis: "h".repeat(500) },
    ],
    brandContext: "x".repeat(5000),
  });
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.value.arms.map((a) => a.armId), ["a1", "a2"], "the duplicate id is dropped");
  assert.equal(ok.value.arms[1].hypothesis.length, 280);
  assert.equal(ok.value.brandContext.length, 1200);

  assert.equal(validateLpVariantDraftRequest({ cluster: "c", brand: "b", arms: [{ armId: "a1", label: "A" }] }).valid, false, "one arm is not a test");
  assert.equal(validateLpVariantDraftRequest({ cluster: "", brand: "b", arms: [] }).valid, false);
  assert.equal(validateLpVariantDraftRequest({ cluster: "c", brand: "", arms: [] }).valid, false);
  const idless = validateLpVariantDraftRequest({ cluster: "c", brand: "b", arms: [{ label: "A" }, { label: "B" }] });
  assert.equal(idless.valid, false, "an arm with no identity cannot be counted, so it is not drafted");
});
