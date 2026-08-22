/** `nullable-cost-never-zero` + `price-tables` — the RATES ↔ models.ts join.
 *
 *  Two invariants, both previously held by hand-written convention only:
 *
 *  1. Every METERED model tag models.ts can produce has a rate row in cost.ts.
 *     The table is keyed by model-tag STRINGS; a rename or a new BYOM vendor
 *     default used to slip through and silently reprice that model to free across
 *     every spend surface. The join is now checked, not conventional.
 *  2. An unknown model reports an ABSENCE (null), never 0 — a zero is the claim
 *     "this call was free", which is exactly the lie the technique forbids.
 *
 *  Pure — no model, no Firestore. */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  BYOM_DEFAULT_MODELS,
  claudeModelTag,
  geminiModelTag,
} = await import("@/lib/llm/models");
const { RATES, estimateCostUsd } = await import("@/lib/llm/cost");

/** The dev Claude CLI runs on a monthly SUBSCRIPTION and reports no token usage at
 *  all, so there is nothing to price per token — the wrapper omits estCostUsd for
 *  it entirely rather than inventing a rate. These tags are exempt BY DESIGN, and
 *  naming them here is the record of that decision (a new tag is not exempt just
 *  because nobody added it). */
const SUBSCRIPTION_TAGS = new Set([claudeModelTag("quality"), claudeModelTag("fast")]);

/** Every model tag the app can stamp on `meta.model`, from the single source of
 *  truth — not a copy of the list. */
function allModelTags() {
  const tags = new Set([
    claudeModelTag("quality"),
    claudeModelTag("fast"),
    geminiModelTag("quality"),
    geminiModelTag("fast"),
  ]);
  for (const defaults of Object.values(BYOM_DEFAULT_MODELS)) {
    tags.add(defaults.quality);
    tags.add(defaults.fast);
  }
  return [...tags];
}

test("every metered model tag models.ts can produce has a RATES row", () => {
  const tags = allModelTags();
  // Instrument assertion: an empty walk must fail loudly, not pass vacuously.
  assert.ok(tags.length >= 6, `expected a populated tag set, got ${tags.length}`);

  const missing = tags.filter((tag) => !SUBSCRIPTION_TAGS.has(tag) && !(tag in RATES));
  assert.deepEqual(
    missing,
    [],
    `model tags with no rate row in src/lib/llm/cost.ts (they would report as UNPRICED): ${missing.join(", ")}`
  );
});

test("subscription tags are deliberately unpriced, not silently missing", () => {
  for (const tag of SUBSCRIPTION_TAGS) {
    assert.ok(!(tag in RATES), `${tag} runs on the subscription — it must have no rate row`);
  }
});

test("estimateCostUsd: an unknown model reports null, never 0", () => {
  const usage = { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 };
  assert.equal(estimateCostUsd("no-such-model-9000", usage), null);
  // A zero-token call is still unpriceable without a rate — and still not free.
  assert.equal(
    estimateCostUsd("no-such-model-9000", { inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    null
  );
});

test("estimateCostUsd: a priced model still returns a number", () => {
  const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 };
  const quality = estimateCostUsd(geminiModelTag("quality"), usage);
  assert.equal(typeof quality, "number");
  assert.ok(quality > 0);
  // The explicit $0 rates (local Ollama) are a real zero, not an absence.
  const ollama = estimateCostUsd(BYOM_DEFAULT_MODELS.ollama.quality, usage);
  assert.equal(ollama, 0);
});
