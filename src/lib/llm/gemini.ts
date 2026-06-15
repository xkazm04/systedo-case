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
      temperature: args.temperature ?? 1.0,
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

  return { parsed: JSON.parse(text), usage };
}
