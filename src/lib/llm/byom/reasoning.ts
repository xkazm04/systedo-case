/** Per-provider reasoning-config mapping. The matrix exposes ONE reasoning knob
 *  (ReasoningLevel: default | off | low | medium | high); each provider's API
 *  expresses reasoning differently, so this module turns the level into the right
 *  request fragment for each vendor. Pure + framework-free (unit-tested). See the
 *  provider docs referenced per function. */
import type { ReasoningLevel } from "../keys/types";

/** OpenAI Chat Completions: `reasoning_effort` (top-level). GPT-5 reasoning models
 *  accept minimal | low | medium | high. "off" → "minimal" (the floor); "default"
 *  omits the param (model default). */
export function openaiReasoning(level: ReasoningLevel): Record<string, unknown> {
  if (level === "default") return {};
  return { reasoning_effort: level === "off" ? "minimal" : level };
}

/** OpenRouter: the unified `reasoning` object. `effort: "none"` disables reasoning;
 *  low | medium | high pass through; "default" omits (model default). */
export function openrouterReasoning(level: ReasoningLevel): Record<string, unknown> {
  if (level === "default") return {};
  return { reasoning: { effort: level === "off" ? "none" : level } };
}

/** Gemini 3.x: `generationConfig.thinkingConfig.thinkingLevel` (NOT 2.5's
 *  `thinkingBudget`). Gemini 3 can't fully disable thinking (Pro especially), so
 *  "off" maps to the minimum "low"; "default" omits the config (model default).
 *  Returns the thinkingConfig object to nest under generationConfig, or null. */
export function geminiThinkingConfig(level: ReasoningLevel): { thinkingLevel: string } | null {
  if (level === "default") return null;
  return { thinkingLevel: level === "off" ? "low" : level };
}

/** Anthropic Messages API: `thinking` (top-level) + `output_config.effort`.
 *  `effort` is only supported on the opus/sonnet-class models — haiku (and any
 *  model without it) has no reasoning knob, so this returns {} there and the
 *  reasoning selection is a no-op. Returns the top-level `thinking` fragment plus
 *  the `effort` string to nest into output_config. */
export function anthropicReasoning(
  model: string,
  level: ReasoningLevel
): { thinking?: object; effort?: string } {
  const supportsEffort = /opus|sonnet/i.test(model) && !/haiku/i.test(model);
  if (!supportsEffort || level === "default") return {};
  if (level === "off") return { thinking: { type: "disabled" } };
  return { thinking: { type: "adaptive" }, effort: level };
}
