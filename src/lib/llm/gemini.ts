/** Gemini provider (server-only, production). Wraps the official `@google/genai`
 *  SDK with native structured output (responseSchema). Used when the wrapper runs
 *  outside development, or as the production fallback. The API key stays on the
 *  server and never reaches the client. */
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from "./models";
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
 *  model returns an empty body. */
export async function runGemini(args: {
  system: string;
  prompt: string;
  schema: object;
  temperature?: number;
}): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Chybí GEMINI_API_KEY.");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
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
    },
  });

  const text = response.text;
  if (!text) throw new Error("Model vrátil prázdnou odpověď.");

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
    // Throw the retryable wording (see isRetryable in index.ts) so a malformed
    // Gemini response gets one retry — matching Claude's "nevrátil platný JSON"
    // path. A native SyntaxError matched none of the RETRYABLE strings, so prod
    // (Gemini) previously got strictly weaker malformed-output handling than dev.
    throw new Error("Gemini nevrátil platný JSON.");
  }
  return { parsed, usage };
}
