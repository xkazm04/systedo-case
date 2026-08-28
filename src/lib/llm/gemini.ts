/** Gemini provider (server-only, production). Wraps the official `@google/genai`
 *  SDK with native structured output (responseSchema). Used when the wrapper runs
 *  outside development, or as the production fallback. The API key stays on the
 *  server and never reaches the client. */
import { GoogleGenAI } from "@google/genai";
import { geminiModelTag, type ModelTier } from "./models";
import { isAbortLikeError, LlmCallError, parseRetryAfterMs } from "./errors";
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

/** Transport-level failure codes: the socket never carried a request/response, so
 *  the call is worth a bounded retry exactly like a rejecting `fetch`. */
const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
]);

/** The HTTP status behind an SDK rejection. `@google/genai` throws its own
 *  `ApiError` carrying `.status`; a proxy/gateway wrapper may expose it only on a
 *  nested response. Non-numeric `code`s (Node's `ECONNRESET` & co.) are ignored. */
function sdkErrorStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; code?: unknown; response?: { status?: unknown } } | null | undefined;
  for (const raw of [e?.status, e?.code, e?.response?.status]) {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return undefined;
}

/** True for a rejection that never reached the API (a raw `fetch` reject is a
 *  TypeError; an undici/Node socket failure carries a system code). */
function isNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null | undefined;
  const code = typeof e?.code === "string" ? e.code : typeof e?.cause?.code === "string" ? e.cause.code : undefined;
  return code !== undefined && NETWORK_ERROR_CODES.has(code);
}

/** How long to back off after a 429. The SDK's `ApiError` drops the response
 *  headers, so honor a Headers-like carrier when the rejection has one and fall
 *  back to the RetryInfo `retryDelay` Google stringifies into the error body. */
function geminiRetryAfterMs(err: unknown): number | undefined {
  const e = err as
    | { message?: unknown; headers?: { get?: (n: string) => string | null }; response?: { headers?: { get?: (n: string) => string | null } } }
    | null
    | undefined;
  const fromHeader = parseRetryAfterMs(e?.headers ?? e?.response?.headers);
  if (fromHeader !== undefined) return fromHeader;
  const delay = /"retryDelay"\s*:\s*"?(\d+(?:\.\d+)?)s/.exec(typeof e?.message === "string" ? e.message : "");
  return delay ? Math.round(Number(delay[1]) * 1000) : undefined;
}

/** Map a Gemini SDK rejection onto the wrapper's typed taxonomy. The SDK throws
 *  its own `ApiError` (or a transport failure), which is neither an LlmCallError
 *  nor a TypeError — so without this every provider-side failure reached the
 *  wrapper untyped, i.e. NOT retryable and with no Retry-After honored: in prod
 *  (gemini→claude, and the Claude CLI does not exist on serverless) one transient
 *  429 or 503 dropped the user straight to the canned demo. The BYOM adapters
 *  classify their raw HTTP statuses this way already; this is the same decision
 *  for the app's own key, exported for the same reason as `classifyByomHttp` —
 *  it is the decision, so it is unit-testable on its own.
 *
 *  Abort-shaped rejections pass through UNTOUCHED: only deadline.ts can tell a
 *  caller abort (`aborted`) from a deadline fire (`timeout`). */
export function classifyGeminiError(err: unknown): unknown {
  if (err instanceof LlmCallError) return err;
  if (isAbortLikeError(err)) return err;

  const detail = (err instanceof Error ? err.message : String(err)).slice(0, 200);
  const status = sdkErrorStatus(err);

  if (status === 429) {
    const retryAfterMs = geminiRetryAfterMs(err);
    return new LlmCallError("rate_limited", `Gemini dočasně omezuje požadavky (HTTP 429). ${detail}`, {
      provider: "gemini",
      status,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      cause: err,
    });
  }
  if (status !== undefined && status >= 500) {
    return new LlmCallError("server", `Gemini selhal (HTTP ${status}). ${detail}`, { provider: "gemini", status, cause: err });
  }
  if (status !== undefined && status >= 400) {
    // Our request, our key or our project quota: replaying it unchanged would fail
    // identically, so it stays non-retryable — but still falls to the next provider.
    return new LlmCallError("unknown", `Gemini odmítl požadavek (HTTP ${status}). ${detail}`, {
      provider: "gemini",
      status,
      cause: err,
    });
  }
  if (isNetworkFailure(err)) {
    return new LlmCallError("network", `Chyba spojení s Gemini: ${detail}`, { provider: "gemini", cause: err });
  }
  // Unrecognized shape — typed so telemetry names the provider, coded "unknown" so
  // it is conservatively not retried (exactly what an untyped error did before).
  return new LlmCallError("unknown", `Volání Gemini selhalo: ${detail}`, { provider: "gemini", cause: err });
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
  }).catch((err: unknown) => {
    // Classify BEFORE the rejection escapes: everything below this call already
    // throws typed LlmCallErrors, and the wrapper's retry gate reads the code.
    throw classifyGeminiError(err);
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
