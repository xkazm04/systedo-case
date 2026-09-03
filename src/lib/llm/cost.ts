/** Token usage + a small per-model rate table that turns provider-reported usage
 *  into an estimated USD cost. Keeps the "subscription (free) vs metered API"
 *  story explicit in the result envelope. Server-only.
 *
 *  Rates are approximate list prices per 1M tokens and only used for a rough
 *  on-screen estimate — not billing. The dev Claude path runs on a subscription
 *  and reports no usage at all, so it has no per-token rate here and the wrapper
 *  OMITS the cost rather than claiming zero.
 *
 *  `nullable-cost-never-zero`: an unpriced call must report an ABSENCE, not a $0.
 *  A zero is a claim ("this was free"); an absence is a fact ("we cannot price
 *  this"). estimateCostUsd therefore returns `null` — never 0 — for a model with
 *  no rate row, and every aggregate over these entries discloses how many of its
 *  calls were unpriced (see telemetry-stats.countUnpriced).
 */
import {
  CLAUDE_API_MODEL,
  CLAUDE_API_MODEL_FAST,
  GEMINI_MODEL,
  GEMINI_MODEL_FAST,
} from "./models";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Provider-reported ACTUAL USD cost for this call, when the API returns one
   *  (e.g. OpenRouter's `usage.cost`). Preferred over the local RATES estimate. */
  costUsd?: number;
}

interface Rate {
  inPerMTok: number;
  outPerMTok: number;
}

// Approximate list prices per 1M tokens for a rough on-screen estimate (not
// billing). Source: Google Gemini API flash-tier public pricing, as of 2026-06.
// NOTE: keyed by the GEMINI_MODEL literal — if that model is renamed or GA'd, add
// the new key here or estimateCostUsd returns null (unpriced) for it. The join to
// src/lib/llm/models.ts is CHECKED, not conventional: test-unit/llm-cost-rates.test.mjs
// asserts every metered model tag models.ts can produce has a row here.
//
// THAT CHECK HAS A BLIND SPOT, AND 2026-09-02 WALKED INTO IT. The gemini rows are
// keyed by the CONSTANT, not by a string literal, so when GEMINI_MODEL moved from
// gemini-3-flash-preview to gemini-3.8-flash the KEY followed automatically and the
// rates test stayed green - while the VALUE below still described the preview's
// pricing, understating the new model by 10x. A computed key proves a row EXISTS for
// the current model; nothing here proves the row is that model's. When you bump
// GEMINI_MODEL, the number underneath it is a separate edit that no test will ask for.
export const RATES: Record<string, Rate> = {
  // gemini-3.8-flash, announced 2026-09-02. INTRODUCTORY rate: 0.75/3.75 runs through
  // 2026-12-31 and doubles to 1.50/7.50 on 2027-01-01. The intro figure is the right
  // one here because this estimate is shown to a user as what the app is spending now,
  // not used for cross-model comparison - but it is wrong from that date, and only
  // this comment says so.
  [GEMINI_MODEL]: { inPerMTok: 0.75, outPerMTok: 3.75 },
  // Fast tier (flash-lite class) — roughly half the flash rate, so the cheaper
  // routing of light tools stays visible (and honest) in the cost telemetry.
  [GEMINI_MODEL_FAST]: { inPerMTok: 0.0375, outPerMTok: 0.15 },
  // BYOM default models. Approximate public list prices per 1M tokens, only for an
  // on-screen estimate — the BYOM user pays the provider directly. A user who
  // picks a model not listed here reports est. $0 (guarded with a warn below).
  [CLAUDE_API_MODEL]: { inPerMTok: 3, outPerMTok: 15 }, // claude-sonnet-5
  [CLAUDE_API_MODEL_FAST]: { inPerMTok: 1, outPerMTok: 5 }, // claude-haiku-4-5
  "gpt-4o": { inPerMTok: 2.5, outPerMTok: 10 },
  "gpt-4o-mini": { inPerMTok: 0.15, outPerMTok: 0.6 },
  // BYOM_DEFAULT_MODELS.openai (both tiers) — OpenAI mini-tier list price.
  "gpt-5.4-mini": { inPerMTok: 0.25, outPerMTok: 2 },
  // BYOM_DEFAULT_MODELS.gemini — the user's OWN Gemini key (HTTP API), distinct
  // from the app's GEMINI_MODEL preview tags above.
  "gemini-3.5-flash": { inPerMTok: 0.3, outPerMTok: 2.5 },
  "gemini-3.1-flash-lite": { inPerMTok: 0.1, outPerMTok: 0.4 },
  // Qwen Cloud (qwencloud.com model pages, 2026-08-05 list prices).
  "qwen3.8-max": { inPerMTok: 2, outPerMTok: 6 },
  "glm-5.2": { inPerMTok: 1.4, outPerMTok: 4.4 },
  "deepseek-v4-flash-0731": { inPerMTok: 0.2, outPerMTok: 0.4 },
  // OpenRouter routes the same two models under vendor-prefixed ids — a separate
  // RATES key, or a BYOM OpenRouter user's spend reads as unpriced.
  "z-ai/glm-5.2": { inPerMTok: 1.4, outPerMTok: 4.4 },
  "deepseek/deepseek-v4-flash": { inPerMTok: 0.2, outPerMTok: 0.4 },
  // Local Ollama: genuinely $0 — an explicit zero rate so the call doesn't trip
  // the "no rate for model" warning on every generation.
  "lfm2.5:8b": { inPerMTok: 0, outPerMTok: 0 },
  "qwen2.5:14b-instruct": { inPerMTok: 0, outPerMTok: 0 },
};

/** Sum two usages into one — used when a call is repaired (a second metered
 *  re-prompt): both real calls must be reflected, not just the latest. Fields are
 *  plain counters, so they add; `costUsd` (a provider-reported real dollar figure)
 *  is summed only when BOTH calls report one — a single missing figure would make a
 *  half-real total look authoritative, so we drop to undefined and let the estimate
 *  stand. Undefined operands pass the other through unchanged. */
export function addUsage(
  a: TokenUsage | undefined,
  b: TokenUsage | undefined
): TokenUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  const bothCost = a.costUsd != null && b.costUsd != null;
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    ...(bothCost ? { costUsd: (a.costUsd ?? 0) + (b.costUsd ?? 0) } : {}),
  };
}

/** Estimated USD cost for a call, or `null` when the model has no metered rate.
 *  NEVER 0 for an unknown model: a clean $0 is a credible-looking claim that the
 *  call was free, and a model rename would silently reprice a whole provider to
 *  free across every spend surface. The caller omits the field instead, and the
 *  aggregates count the call as unpriced. */
export function estimateCostUsd(model: string, usage: TokenUsage): number | null {
  const rate = RATES[model];
  if (!rate) {
    // Warn so a model rename/GA is noticed, and report an ABSENCE, not a zero.
    if (usage.totalTokens > 0) {
      console.warn(
        `[llm/cost] no rate for model "${model}" — reporting estCostUsd as UNPRICED (absent) despite ${usage.totalTokens} tokens. Add it to RATES in src/lib/llm/cost.ts.`
      );
    }
    return null;
  }
  const cost =
    (usage.inputTokens / 1_000_000) * rate.inPerMTok +
    (usage.outputTokens / 1_000_000) * rate.outPerMTok;
  // round to 6 decimal places — sub-cent calls still show a non-zero figure.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
