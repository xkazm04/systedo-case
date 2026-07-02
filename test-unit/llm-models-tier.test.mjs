/** Per-tool model-tier routing (llm-provider-wrapper idea #1): the pure tier →
 *  model mapping in src/lib/llm/models.ts. The default (no tier / "quality")
 *  must stay byte-identical to the pre-tier constants so every existing tool is
 *  untouched, and the fast tier must resolve to the tags the cost table and the
 *  real gate tests key on. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAUDE_CLI_MODEL,
  CLAUDE_CLI_MODEL_FAST,
  CLAUDE_MODEL,
  CLAUDE_MODEL_FAST,
  GEMINI_MODEL,
  GEMINI_MODEL_FAST,
  claudeCliAlias,
  claudeModelTag,
  geminiModelTag,
} from "@/lib/llm/models";

test("quality tier (and the no-arg default) resolves to the legacy models", () => {
  assert.equal(claudeModelTag(), CLAUDE_MODEL);
  assert.equal(claudeModelTag("quality"), CLAUDE_MODEL);
  assert.equal(claudeCliAlias(), CLAUDE_CLI_MODEL);
  assert.equal(claudeCliAlias("quality"), CLAUDE_CLI_MODEL);
  assert.equal(geminiModelTag(), GEMINI_MODEL);
  assert.equal(geminiModelTag("quality"), GEMINI_MODEL);
});

test("fast tier resolves to the light models on both providers", () => {
  assert.equal(claudeModelTag("fast"), CLAUDE_MODEL_FAST);
  assert.equal(claudeCliAlias("fast"), CLAUDE_CLI_MODEL_FAST);
  assert.equal(geminiModelTag("fast"), GEMINI_MODEL_FAST);
  // Distinct tags — meta.model stamping must be able to tell the tiers apart.
  assert.notEqual(CLAUDE_MODEL_FAST, CLAUDE_MODEL);
  assert.notEqual(GEMINI_MODEL_FAST, GEMINI_MODEL);
});

test("the fast Gemini tag has a metered rate (cost telemetry stays honest)", async () => {
  const { estimateCostUsd } = await import("@/lib/llm/cost");
  const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 };
  const fast = estimateCostUsd(GEMINI_MODEL_FAST, usage);
  const quality = estimateCostUsd(GEMINI_MODEL, usage);
  assert.ok(fast > 0, "fast tier must not silently report $0");
  assert.ok(fast < quality, "fast tier must actually be cheaper than the quality tier");
});
