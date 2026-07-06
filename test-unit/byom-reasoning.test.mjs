/** Unit tests for the per-provider reasoning mapping — each provider expresses
 *  reasoning differently, so the mapping is the correctness-critical part. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anthropicReasoning,
  geminiThinkingConfig,
  openaiReasoning,
  openrouterReasoning,
} from "@/lib/llm/byom/reasoning.ts";

test("OpenAI → reasoning_effort (off = minimal, default = omit)", () => {
  assert.deepEqual(openaiReasoning("default"), {});
  assert.deepEqual(openaiReasoning("off"), { reasoning_effort: "minimal" });
  assert.deepEqual(openaiReasoning("low"), { reasoning_effort: "low" });
  assert.deepEqual(openaiReasoning("high"), { reasoning_effort: "high" });
});

test("OpenRouter → reasoning object (off = effort none, default = omit)", () => {
  assert.deepEqual(openrouterReasoning("default"), {});
  assert.deepEqual(openrouterReasoning("off"), { reasoning: { effort: "none" } });
  assert.deepEqual(openrouterReasoning("medium"), { reasoning: { effort: "medium" } });
});

test("Gemini 3 → thinkingConfig.thinkingLevel (off = low, default = null/omit)", () => {
  assert.equal(geminiThinkingConfig("default"), null);
  assert.deepEqual(geminiThinkingConfig("off"), { thinkingLevel: "low" });
  assert.deepEqual(geminiThinkingConfig("high"), { thinkingLevel: "high" });
});

test("Anthropic → thinking + effort, but effort only on opus/sonnet (haiku no-op)", () => {
  assert.deepEqual(anthropicReasoning("claude-sonnet-5", "low"), {
    thinking: { type: "adaptive" },
    effort: "low",
  });
  assert.deepEqual(anthropicReasoning("claude-opus-4-8", "high"), {
    thinking: { type: "adaptive" },
    effort: "high",
  });
  assert.deepEqual(anthropicReasoning("claude-sonnet-5", "off"), { thinking: { type: "disabled" } });
  assert.deepEqual(anthropicReasoning("claude-sonnet-5", "default"), {});
  // haiku has no reasoning knob → every level is a no-op
  assert.deepEqual(anthropicReasoning("claude-haiku-4-5", "high"), {});
  assert.deepEqual(anthropicReasoning("claude-haiku-4-5", "off"), {});
});
