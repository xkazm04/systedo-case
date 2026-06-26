/** Token usage + a small per-model rate table that turns provider-reported usage
 *  into an estimated USD cost. Keeps the "subscription (free) vs metered API"
 *  story explicit in the result envelope. Server-only.
 *
 *  Rates are approximate list prices per 1M tokens and only used for a rough
 *  on-screen estimate — not billing. The dev Claude path runs on a subscription,
 *  so it has no per-token rate here and is reported as costUsd: 0 by the wrapper.
 */
import { GEMINI_MODEL } from "./models";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface Rate {
  inPerMTok: number;
  outPerMTok: number;
}

// Approximate list prices per 1M tokens for a rough on-screen estimate (not
// billing). Source: Google Gemini API flash-tier public pricing, as of 2026-06.
// NOTE: keyed by the GEMINI_MODEL literal — if that model is renamed or GA'd, add
// the new key here or estimateCostUsd silently returns 0 (guarded with a warn below).
const RATES: Record<string, Rate> = {
  [GEMINI_MODEL]: { inPerMTok: 0.075, outPerMTok: 0.3 },
};

/** Estimated USD cost for a call, or 0 when the model has no metered rate. */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const rate = RATES[model];
  if (!rate) {
    // A metered call with no rate would report a clean $0 — credible-looking but
    // wrong. Warn so a model rename/GA can't quietly zero out the "cost-tracked"
    // story; still return 0 since we have no rate to estimate with.
    if (usage.totalTokens > 0) {
      console.warn(
        `[llm/cost] no rate for model "${model}" — reporting estCostUsd 0 despite ${usage.totalTokens} tokens. Add it to RATES in src/lib/llm/cost.ts.`
      );
    }
    return 0;
  }
  const cost =
    (usage.inputTokens / 1_000_000) * rate.inPerMTok +
    (usage.outputTokens / 1_000_000) * rate.outPerMTok;
  // round to 6 decimal places — sub-cent calls still show a non-zero figure.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
