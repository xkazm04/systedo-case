/** LP variant-ideas validator + normalizer (src/lib/ai/tools/lp-variant-ideas.ts):
 *  Direction 3 tightens the contract from "≥1 concept" to "≥2 DISTINCT concepts,
 *  none re-proposing the control or a disproven loser" (case/whitespace-insensitive).
 *  Pure — no model calls. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { validateLpVariantIdeas, normalizeLpVariantIdeas, demoLpVariantIdeas } = await import(
  "@/lib/ai/tools/lp-variant-ideas"
);

const variant = (label, hypothesis = "protože to zlepší konverzi oproti kontrole") => ({
  label,
  hypothesis,
  headline: "Nadpis",
  primaryCTA: "Akce",
  rationale: "Dává smysl vzhledem k tématu.",
});

test("validateLpVariantIdeas requires at least TWO distinct variants (one arm is not a test)", () => {
  assert.ok(validateLpVariantIdeas({ variants: [variant("A")] }, { topic: "t" }).length > 0);
  assert.deepEqual(
    validateLpVariantIdeas({ variants: [variant("A"), variant("B")] }, { topic: "t" }),
    []
  );
});

test("validateLpVariantIdeas de-dupes labels case/whitespace-insensitively before counting", () => {
  // "Sociální důkaz" and "sociální  DŮKAZ" are the same concept → only one distinct.
  const out = validateLpVariantIdeas(
    { variants: [variant("Sociální důkaz"), variant("sociální  DŮKAZ")] },
    { topic: "t" }
  );
  assert.ok(out.length > 0, "two labels that normalize equal count as one → below the ≥2 bar");
});

test("validateLpVariantIdeas rejects a variant matching the control or a disproven loser", () => {
  const req = { topic: "t", controlLabel: "Původní verze", losers: ["Sleva 10 %"] };
  // Matches the control label (whitespace/case-insensitive).
  const ctrl = validateLpVariantIdeas(
    { variants: [variant("  původní   verze "), variant("Nový úhel")] },
    req
  );
  assert.ok(ctrl.some((m) => m.includes("kontrol")), "control re-proposal is a violation");
  // Matches a disproven loser.
  const loser = validateLpVariantIdeas(
    { variants: [variant("Sleva 10 %"), variant("Jiný benefit")] },
    req
  );
  assert.ok(loser.length > 0, "loser re-proposal is a violation");
  // Two fresh, distinct, non-banned angles pass.
  assert.deepEqual(
    validateLpVariantIdeas({ variants: [variant("Nový úhel"), variant("Jiný benefit")] }, req),
    []
  );
});

test("validateLpVariantIdeas flags a non-object output (repair floor)", () => {
  assert.ok(validateLpVariantIdeas("nope", { topic: "t" }).length > 0);
  assert.ok(validateLpVariantIdeas(null, { topic: "t" }).length > 0);
});

test("normalizeLpVariantIdeas drops banned labels + falls back to the demo below 2 distinct", () => {
  const req = { topic: "widgety", controlLabel: "Kontrola", losers: ["Levná varianta"] };
  // One banned + one real → only one usable → demo floor (which has 2 distinct arms).
  const floored = normalizeLpVariantIdeas(
    { variants: [variant("Kontrola"), variant("Skutečný úhel")] },
    req
  );
  assert.equal(floored.variants.length, 2, "falls back to the 2-arm demo floor");
  // Two clean, distinct challengers survive as-is.
  const kept = normalizeLpVariantIdeas(
    { variants: [variant("Úhel A"), variant("Úhel B"), variant("úhel a")] },
    req
  );
  assert.equal(kept.variants.length, 2, "the duplicate label is de-duped");
  assert.deepEqual(
    kept.variants.map((v) => v.label),
    ["Úhel A", "Úhel B"]
  );
});

test("demoLpVariantIdeas is deterministic and yields two distinct arms", () => {
  const a = demoLpVariantIdeas({ topic: "kurzy" });
  const b = demoLpVariantIdeas({ topic: "kurzy" });
  assert.deepEqual(a, b);
  assert.equal(a.variants.length, 2);
  assert.notEqual(a.variants[0].label, a.variants[1].label);
});
