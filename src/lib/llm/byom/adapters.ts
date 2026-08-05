/** BYOM provider adapters — one uniform `run()` per vendor for a user's own API
 *  key. All three call the vendor's REST API with `fetch` (no vendor SDK) so the
 *  failure path exposes a raw HTTP status the fallback classifier can read, and
 *  so the adapters share one shape. All three request NATIVE structured output:
 *  Gemini via `responseSchema` (the tools' Google-`Type` schema is already its
 *  shape), OpenAI via `response_format: json_schema` (strict) and Anthropic via
 *  `output_config.format`, both fed a JSON Schema from ./schema. If a user-picked
 *  model rejects the structured-output param, the OpenAI/Anthropic adapters retry
 *  once with a prompt-embedded schema (the universal fallback the Claude CLI
 *  provider uses), so any model still works. Output is parsed with the wrapper's
 *  robust `extractJson`. Server-only.
 *
 *  NOTE: raw `fetch` (not the vendor SDKs) is deliberate — it keeps the three
 *  adapters uniform, needs no new dependencies (matching the repo's zero-dep
 *  spirit and the fetch-based embeddings path), and gives the error classifier the
 *  exact HTTP status the user-fault-vs-recoverable decision depends on. */
import { extractJson } from "../claude";
import { classifyByomHttp, LlmCallError, parseRetryAfterMs } from "../errors";
import { byomModel } from "../models";
import { reportByomCallFailure } from "../keys/health";
import { toJsonSchema } from "./schema";
import { anthropicReasoning, geminiThinkingConfig, openaiReasoning, openrouterReasoning } from "./reasoning";
import type { TokenUsage } from "../cost";
import type { ReasoningLevel, ResolvedByomKey } from "../keys/types";
import type { ModelTier } from "../models";

/** The subset of the wrapper's ProviderCall a BYOM adapter needs (kept local to
 *  avoid importing from index.ts, which imports this module). */
export interface ByomCall {
  system: string;
  prompt: string;
  schema: object;
  temperature?: number;
  tier?: ModelTier;
  signal?: AbortSignal;
  /** reasoning depth for this call; mapped to the provider's own param */
  reasoning?: ReasoningLevel;
}

export interface ByomResult {
  parsed: unknown;
  usage?: TokenUsage;
}

/** Build the user-turn content for the prompt-embed fallback: the task prompt plus
 *  a strict "return only one JSON object matching this schema" instruction. */
function embeddedUserContent(prompt: string, schema: object): string {
  return [
    prompt,
    "",
    "Odpověz POUZE jedním JSON objektem — žádný text okolo, žádné markdown bloky, žádné komentáře.",
    "JSON musí přesně odpovídat tomuto schématu (formát Google GenAI Type: OBJECT/ARRAY/STRING/NUMBER/BOOLEAN):",
    JSON.stringify(schema),
  ].join("\n");
}

/** Classify a non-OK BYOM response into the failure the wrapper should see:
 *   - a ByomUserError for a user fault (surfaced, no fallback),
 *   - a typed LlmCallError("rate_limited") for a 429 that carries a Retry-After
 *     header (transient throttle, honored with bounded backoff — not a hard quota),
 *   - a typed LlmCallError("server") for a 5xx/other (recoverable → retry/fallback),
 *   - `null` ONLY for a bare 400, meaning "the model likely rejected the
 *     structured-output param" so the caller should retry with the prompt-embed
 *     request before giving up.
 *  Code-based, not wording-based: an English/reworded provider body is classified
 *  the same as a Czech one. */
function classifyByomResponse(vendor: string, status: number, body: string, headers?: Headers): Error | null {
  // A 429 with a Retry-After header is a transient throttle we can wait out
  // (retryable), distinct from an account whose quota is exhausted (user fault).
  if (status === 429) {
    const retryAfterMs = parseRetryAfterMs(headers);
    if (retryAfterMs !== undefined) {
      return new LlmCallError("rate_limited", `Poskytovatel ${vendor} dočasně omezuje požadavky (HTTP 429).`, {
        provider: vendor,
        status,
        retryAfterMs,
      });
    }
  }
  const userErr = classifyByomHttp(vendor, status, body);
  if (userErr) return userErr;
  // A bare 400 = our request/schema; the caller can still try the prompt-embed
  // fallback (some models reject the structured-output param with 400).
  if (status === 400) return null;
  // 5xx and everything else: provider-side / transient → retryable server error.
  return new LlmCallError("server", `Poskytovatel ${vendor} selhal (HTTP ${status}). ${body.slice(0, 200)}`, {
    provider: vendor,
    status,
  });
}

/** Turn a non-OK response into the right error. A bare 400 that reaches here has
 *  already exhausted the prompt-embed fallback, so it is treated as a retryable
 *  server error rather than a "try embed" signal. */
async function byomHttpError(vendor: string, res: Response): Promise<Error> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* body unreadable — classify on status alone */
  }
  return (
    classifyByomResponse(vendor, res.status, body, res.headers) ??
    new LlmCallError("server", `Poskytovatel ${vendor} selhal (HTTP ${res.status}). ${body.slice(0, 200)}`, {
      provider: vendor,
      status: res.status,
    })
  );
}

/** Try a native-structured-output request first; on a USER fault / throttle / 5xx
 *  surface it immediately (no wasted embed retry), on a bare-400 (the model likely
 *  doesn't support the structured-output param) retry once with the universal
 *  prompt-embed request, so any user-chosen model still works. The returned
 *  Response is guaranteed `ok`. */
async function fetchWithFallback(
  vendor: string,
  doStructured: () => Promise<Response>,
  doPromptEmbed: () => Promise<Response>
): Promise<Response> {
  const res = await doStructured();
  if (res.ok) return res;
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* body unreadable — classify on status alone */
  }
  const err = classifyByomResponse(vendor, res.status, body, res.headers);
  if (err) throw err; // user fault, throttle, or 5xx — don't waste a prompt-embed try
  const res2 = await doPromptEmbed(); // null == bare 400 → the structured param was likely rejected
  if (!res2.ok) throw await byomHttpError(vendor, res2);
  return res2;
}

// ── OpenAI (Chat Completions, native json_schema → prompt-embed fallback) ──────
async function runOpenAi(byom: ResolvedByomKey, call: ByomCall): Promise<ByomResult> {
  const model = byomModel("openai", call.tier, byom.model, byom.fastModel);
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const headers = { Authorization: `Bearer ${byom.apiKey}`, "Content-Type": "application/json" };
  const common = {
    model,
    ...(call.temperature !== undefined ? { temperature: call.temperature } : {}),
    ...openaiReasoning(call.reasoning ?? "default"),
  };
  const post = (payload: object) =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: call.signal,
    });

  const res = await fetchWithFallback(
    "openai",
    () =>
      post({
        ...common,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "structured_output", strict: true, schema: toJsonSchema(call.schema) },
        },
      }),
    () =>
      post({
        ...common,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: embeddedUserContent(call.prompt, call.schema) },
        ],
      })
  );

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content;
  const parsed = text ? extractJson(text) : null;
  if (!parsed) throw new LlmCallError(text ? "malformed_json" : "empty", "OpenAI nevrátil platný JSON.", { provider: "openai" });

  const u = json.usage;
  const usage: TokenUsage | undefined = u
    ? {
        inputTokens: u.prompt_tokens ?? 0,
        outputTokens: u.completion_tokens ?? 0,
        totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
      }
    : undefined;
  return { parsed, usage };
}

// ── Anthropic (Messages API, native output_config → prompt-embed fallback) ─────
async function runAnthropic(byom: ResolvedByomKey, call: ByomCall): Promise<ByomResult> {
  const model = byomModel("anthropic", call.tier, byom.model, byom.fastModel);
  const base = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
  const headers = {
    "x-api-key": byom.apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
  // No temperature (removed on current Claude models — a value 400s). No thinking
  // (structured extraction doesn't need it). max_tokens sized for the heaviest
  // tool while staying under the non-streaming HTTP-timeout guidance.
  const common = { model, max_tokens: 16000, system: call.system };
  // Reasoning: thinking is top-level, effort nests in output_config; both are
  // no-ops on models without a reasoning knob (e.g. haiku).
  const reason = anthropicReasoning(model, call.reasoning ?? "default");
  const thinking = reason.thinking ? { thinking: reason.thinking } : {};
  const post = (payload: object) =>
    fetch(`${base}/v1/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: call.signal,
    });

  const res = await fetchWithFallback(
    "anthropic",
    () =>
      post({
        ...common,
        ...thinking,
        messages: [{ role: "user", content: call.prompt }],
        output_config: {
          format: { type: "json_schema", schema: toJsonSchema(call.schema) },
          ...(reason.effort ? { effort: reason.effort } : {}),
        },
      }),
    () =>
      post({
        ...common,
        ...thinking,
        messages: [{ role: "user", content: embeddedUserContent(call.prompt, call.schema) }],
        ...(reason.effort ? { output_config: { effort: reason.effort } } : {}),
      })
  );

  const json = (await res.json()) as {
    stop_reason?: string;
    content?: { type?: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  // A safety refusal is neither the user's key fault nor our request bug, and
  // re-prompting won't change it — code "safety_blocked" (not retried) still falls
  // through to the app provider.
  if (json.stop_reason === "refusal") throw new LlmCallError("safety_blocked", "Anthropic odmítl požadavek (refusal).", { provider: "anthropic" });

  const text = Array.isArray(json.content)
    ? json.content
        .filter((b) => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("")
    : "";
  const parsed = text ? extractJson(text) : null;
  if (!parsed) throw new LlmCallError(text ? "malformed_json" : "empty", "Anthropic nevrátil platný JSON.", { provider: "anthropic" });

  const u = json.usage;
  const usage: TokenUsage | undefined = u
    ? {
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
      }
    : undefined;
  return { parsed, usage };
}

// ── Gemini (REST generateContent, native responseSchema) ──────────────────────
async function runGemini(byom: ResolvedByomKey, call: ByomCall): Promise<ByomResult> {
  const model = byomModel("gemini", call.tier, byom.model, byom.fastModel);
  const base = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
  const thinking = geminiThinkingConfig(call.reasoning ?? "default");
  // Match the other adapters: when the caller sets no temperature, omit the param
  // and let the model default stand — Gemini used to pin an unexplained 0.7, so the
  // SAME unset tool call sampled differently on Gemini than on OpenAI/Anthropic/
  // OpenRouter, silently confounding any A/B of providers for output quality.
  const temp = call.temperature !== undefined ? { temperature: call.temperature } : {};
  // The key travels in the x-goog-api-key HEADER (equally supported by the REST
  // API), never the `?key=` query param: URLs land in proxy/gateway/APM logs and
  // error messages, so a query-string key would leak the user's plaintext secret
  // to every layer that logs request URLs. Headers don't.
  const post = (generationConfig: object, userText: string) =>
    fetch(`${base}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": byom.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: call.system }] },
        contents: [{ parts: [{ text: userText }] }],
        generationConfig,
      }),
      signal: call.signal,
    });

  // Same native-structured → prompt-embed fallback as the other adapters (the
  // module contract promises "any model still works"): a model/endpoint that 400s
  // on `responseSchema` retries once with the schema embedded in the prompt and
  // only `responseMimeType: application/json`, instead of the old bare-400 path
  // that byomHttpError rebranded as a retryable "server" error the wrapper wasted
  // its retries replaying identically.
  const res = await fetchWithFallback(
    "gemini",
    () =>
      post(
        {
          responseMimeType: "application/json",
          responseSchema: call.schema,
          ...temp,
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
        call.prompt
      ),
    () =>
      post(
        {
          responseMimeType: "application/json",
          ...temp,
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
        embeddedUserContent(call.prompt, call.schema)
      )
  );

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new LlmCallError("empty", "Gemini vrátil prázdnou odpověď.", { provider: "gemini" });
  const parsed = extractJson(text);
  if (!parsed) throw new LlmCallError("malformed_json", "Gemini nevrátil platný JSON.", { provider: "gemini" });

  const um = json.usageMetadata;
  const usage: TokenUsage | undefined = um
    ? {
        inputTokens: um.promptTokenCount ?? 0,
        outputTokens: um.candidatesTokenCount ?? 0,
        totalTokens: um.totalTokenCount ?? (um.promptTokenCount ?? 0) + (um.candidatesTokenCount ?? 0),
      }
    : undefined;
  return { parsed, usage };
}

// ── OpenRouter (OpenAI-compatible chat completions; unified reasoning param) ───
async function runOpenRouter(byom: ResolvedByomKey, call: ByomCall): Promise<ByomResult> {
  const model = byomModel("openrouter", call.tier, byom.model, byom.fastModel);
  const base = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${byom.apiKey}`,
    "Content-Type": "application/json",
  };
  // Optional attribution headers OpenRouter recommends (skipped when unset).
  if (process.env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  if (process.env.OPENROUTER_APP_NAME) headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
  const common = {
    model,
    // Give every model a generous output budget (matching the Anthropic adapter). Without this,
    // OpenRouter applies each model's own — sometimes low — default cap, truncating structured JSON
    // mid-object so it fails to parse. One knob so all OpenRouter targets return complete outputs.
    max_tokens: 16000,
    ...(call.temperature !== undefined ? { temperature: call.temperature } : {}),
    ...openrouterReasoning(call.reasoning ?? "default"),
    // Ask OpenRouter to return the ACTUAL credits/USD cost of the call in the usage
    // block, so the wrapper reports real BYOM cost instead of a rate estimate.
    usage: { include: true },
  };
  const post = (payload: object) =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: call.signal,
    });

  const res = await fetchWithFallback(
    "openrouter",
    () =>
      post({
        ...common,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "structured_output", strict: true, schema: toJsonSchema(call.schema) },
        },
      }),
    () =>
      post({
        ...common,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: embeddedUserContent(call.prompt, call.schema) },
        ],
      })
  );

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
  };
  const text = json.choices?.[0]?.message?.content;
  const parsed = text ? extractJson(text) : null;
  if (!parsed) throw new LlmCallError(text ? "malformed_json" : "empty", "OpenRouter nevrátil platný JSON.", { provider: "openrouter" });

  const u = json.usage;
  const usage: TokenUsage | undefined = u
    ? {
        inputTokens: u.prompt_tokens ?? 0,
        outputTokens: u.completion_tokens ?? 0,
        totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
        ...(typeof u.cost === "number" ? { costUsd: u.cost } : {}),
      }
    : undefined;
  return { parsed, usage };
}

// ── Qwen Cloud (DashScope-intl compatible mode — OpenAI chat-completions shape) ─
async function runQwen(byom: ResolvedByomKey, call: ByomCall): Promise<ByomResult> {
  const model = byomModel("qwen", call.tier, byom.model, byom.fastModel);
  const base = process.env.QWEN_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const headers = { Authorization: `Bearer ${byom.apiKey}`, "Content-Type": "application/json" };
  // No reasoning params: compatible mode rejects OpenAI's reasoning_effort, and the
  // catalog marks every qwen model noReasoning so the matrix can't ask for one.
  const common = {
    model,
    // Same generous output budget as the OpenRouter adapter, for the same reason:
    // gateway-side per-model default caps truncate structured JSON mid-object.
    max_tokens: 16000,
    ...(call.temperature !== undefined ? { temperature: call.temperature } : {}),
  };
  const post = (payload: object) =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: call.signal,
    });

  const res = await fetchWithFallback(
    "qwen",
    () =>
      post({
        ...common,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "structured_output", strict: true, schema: toJsonSchema(call.schema) },
        },
      }),
    () =>
      post({
        ...common,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: embeddedUserContent(call.prompt, call.schema) },
        ],
      })
  );

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content;
  const parsed = text ? extractJson(text) : null;
  if (!parsed) throw new LlmCallError(text ? "malformed_json" : "empty", "Qwen Cloud nevrátil platný JSON.", { provider: "qwen" });

  const u = json.usage;
  const usage: TokenUsage | undefined = u
    ? {
        inputTokens: u.prompt_tokens ?? 0,
        outputTokens: u.completion_tokens ?? 0,
        totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
      }
    : undefined;
  return { parsed, usage };
}

// ── Ollama (local OpenAI-compatible /v1 — keyless by default) ──────────────────
async function runOllama(byom: ResolvedByomKey, call: ByomCall): Promise<ByomResult> {
  const model = byomModel("ollama", call.tier, byom.model, byom.fastModel);
  const base = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
  // A stock Ollama server authenticates nothing — the stored "key" is a
  // placeholder. Send Authorization anyway (harmless locally, and it makes an
  // authenticating proxy in front of Ollama just work).
  const headers = { Authorization: `Bearer ${byom.apiKey}`, "Content-Type": "application/json" };
  const common = {
    model,
    ...(call.temperature !== undefined ? { temperature: call.temperature } : {}),
  };
  const post = (payload: object) =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: call.signal,
    });

  const res = await fetchWithFallback(
    "ollama",
    () =>
      post({
        ...common,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "structured_output", strict: true, schema: toJsonSchema(call.schema) },
        },
      }),
    () =>
      post({
        ...common,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: embeddedUserContent(call.prompt, call.schema) },
        ],
      })
  );

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content;
  const parsed = text ? extractJson(text) : null;
  if (!parsed) throw new LlmCallError(text ? "malformed_json" : "empty", "Ollama nevrátil platný JSON.", { provider: "ollama" });

  const u = json.usage;
  const usage: TokenUsage | undefined = u
    ? {
        inputTokens: u.prompt_tokens ?? 0,
        outputTokens: u.completion_tokens ?? 0,
        totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
      }
    : undefined;
  return { parsed, usage };
}

function dispatchByom(byom: ResolvedByomKey, call: ByomCall): Promise<ByomResult> {
  switch (byom.vendor) {
    case "openai":
      return runOpenAi(byom, call);
    case "anthropic":
      return runAnthropic(byom, call);
    case "gemini":
      return runGemini(byom, call);
    case "openrouter":
      return runOpenRouter(byom, call);
    case "qwen":
      return runQwen(byom, call);
    case "ollama":
      return runOllama(byom, call);
  }
}

/** Dispatch one structured generation to the user's active BYOM vendor. Throws a
 *  ByomUserError on a user fault (surfaced, no fallback) or a recoverable Error
 *  (the wrapper falls through to the app's own provider).
 *
 *  Every failure is ALSO reported to the key-health write-back before it is
 *  re-thrown, so a key the provider has revoked is marked from real use instead of
 *  waiting for the user to press "test" (keys/health.ts). This is the single funnel
 *  for every BYOM provider call, which is why the observer sits here rather than in
 *  the wrapper: no extra provider call, no change to what is thrown, and — because
 *  `reportByomCallFailure` is synchronous, fire-and-forget and swallows its own
 *  errors — no added latency or new failure mode on an already-failing call. It
 *  no-ops for the "test connection" probe, whose key carries no `owner`. */
export async function runByom(byom: ResolvedByomKey, call: ByomCall): Promise<ByomResult> {
  try {
    return await dispatchByom(byom, call);
  } catch (err) {
    reportByomCallFailure(byom, err);
    throw err;
  }
}
