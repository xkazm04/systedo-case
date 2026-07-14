/** Gemini provider (server-only, production). Wraps the official `@google/genai`
 *  SDK with native structured output (responseSchema). Used when the wrapper runs
 *  outside development, or as the production fallback. The API key stays on the
 *  server and never reaches the client. */
import { GoogleGenAI } from "@google/genai";
import { geminiModelTag, type ModelTier } from "./models";
import { LlmCallError } from "./errors";
import type { TokenUsage } from "./cost";

/** Parsed model output plus the provider-reported token usage (when available). */
export interface GeminiResult {
  parsed: unknown;
  usage?: TokenUsage;
}

/** Is a Gemini API key configured? */
export function geminiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Run a structured generation through Gemini. Returns the parsed JSON object
 *  (pre-normalization) and token usage. Throws when the key is missing or the
 *  model returns an empty body. `tier` picks the model tag (flash vs flash-lite);
 *  `signal` aborts the SDK request when the client goes away. */
export async function runGemini(args: {
  system: string;
  prompt: string;
  schema: object;
  temperature?: number;
  tier?: ModelTier;
  signal?: AbortSignal;
}): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  // A missing key is a configuration fault, not a transient one — code "unknown"
  // so it is never retried (nor mistaken for a provider outage).
  if (!apiKey) throw new LlmCallError("unknown", "Chybí GEMINI_API_KEY.", { provider: "gemini" });

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: geminiModelTag(args.tier),
    contents: args.prompt,
    config: {
      systemInstruction: args.system,
      responseMimeType: "application/json",
      responseSchema: args.schema,
      // Default to a conservative 0.7 (not the API's 1.0): every tool here emits
      // grounded JSON-schema output, where high creativity raises malformed/repair
      // rates. Tools needing stricter output pass lower (analysis: 0.4). NOTE:
      // temperature is Gemini-only — the Claude CLI path (dev) ignores it.
      temperature: args.temperature ?? 0.7,
      // Client abort propagation: stop the HTTP call when the caller aborted
      // (the SDK cancels client-side; see GenerateContentConfig.abortSignal).
      abortSignal: args.signal,
    },
  });

  const text = response.text;
  if (!text) {
    // Distinguish a content-safety block from a plain empty body: a block is not
    // worth retrying (code "safety_blocked" → falls straight to the next provider),
    // an empty body is a transient glitch (code "empty" → bounded retry). The SDK
    // surfaces the reason on promptFeedback.blockReason and/or the candidate's
    // finishReason (SAFETY / RECITATION / PROHIBITED_CONTENT / BLOCKLIST).
    const r = response as {
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string }[];
    };
    const blockReason = r.promptFeedback?.blockReason;
    const finishReason = r.candidates?.[0]?.finishReason;
    const blocked =
      Boolean(blockReason) ||
      (finishReason !== undefined && ["SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"].includes(finishReason));
    if (blocked) {
      throw new LlmCallError(
        "safety_blocked",
        `Gemini zablokoval odpověď (${blockReason ?? finishReason}).`,
        { provider: "gemini" }
      );
    }
    throw new LlmCallError("empty", "Model vrátil prázdnou odpověď.", { provider: "gemini" });
  }

  const um = (response as {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  }).usageMetadata;
  const usage: TokenUsage | undefined = um
    ? {
        inputTokens: um.promptTokenCount ?? 0,
        outputTokens: um.candidatesTokenCount ?? 0,
        totalTokens: um.totalTokenCount ?? (um.promptTokenCount ?? 0) + (um.candidatesTokenCount ?? 0),
      }
    : undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Code "malformed_json" → one bounded retry, matching Claude's parse-failure
    // path (a native SyntaxError would otherwise never be classified as retryable).
    throw new LlmCallError("malformed_json", "Gemini nevrátil platný JSON.", { provider: "gemini" });
  }
  return { parsed, usage };
}
