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
import { classifyByomHttp } from "../errors";
import { byomModel } from "../models";
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

/** Turn a non-OK response into the right error: a ByomUserError for user faults,
 *  else a recoverable Error whose wording carries a RETRYABLE marker ("selhal")
 *  so the wrapper gives it a couple of tries before falling to the app provider. */
async function byomHttpError(vendor: string, res: Response): Promise<Error> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* body unreadable — classify on status alone */
  }
  return (
    classifyByomHttp(vendor, res.status, body) ??
    new Error(`Poskytovatel ${vendor} selhal (HTTP ${res.status}). ${body.slice(0, 200)}`)
  );
}

/** Try a native-structured-output request first; on a USER fault surface it
 *  immediately (no wasted retry), on a RECOVERABLE failure (e.g. the model doesn't
 *  support the structured-output param → 400, or a transient 5xx) retry once with
 *  the universal prompt-embed request, so any user-chosen model still works. The
 *  returned Response is guaranteed `ok`. */
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
  const userErr = classifyByomHttp(vendor, res.status, body);
  if (userErr) throw userErr;
  const res2 = await doPromptEmbed();
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
  if (!parsed) throw new Error("OpenAI nevrátil platný JSON.");

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
  // A safety refusal is neither the user's key fault nor our request bug — let it
  // fall through to the app provider (recoverable, no RETRYABLE marker → one shot).
  if (json.stop_reason === "refusal") throw new Error("Anthropic odmítl požadavek (refusal).");

  const text = Array.isArray(json.content)
    ? json.content
        .filter((b) => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("")
    : "";
  const parsed = text ? extractJson(text) : null;
  if (!parsed) throw new Error("Anthropic nevrátil platný JSON.");

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
  const res = await fetch(`${base}/models/${model}:generateContent?key=${encodeURIComponent(byom.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: call.system }] },
      contents: [{ parts: [{ text: call.prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: call.schema,
        temperature: call.temperature ?? 0.7,
        ...(geminiThinkingConfig(call.reasoning ?? "default")
          ? { thinkingConfig: geminiThinkingConfig(call.reasoning ?? "default") }
          : {}),
      },
    }),
    signal: call.signal,
  });
  if (!res.ok) throw await byomHttpError("gemini", res);

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini vrátil prázdnou odpověď.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini nevrátil platný JSON.");
  }

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
    ...(call.temperature !== undefined ? { temperature: call.temperature } : {}),
    ...openrouterReasoning(call.reasoning ?? "default"),
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
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content;
  const parsed = text ? extractJson(text) : null;
  if (!parsed) throw new Error("OpenRouter nevrátil platný JSON.");

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

/** Dispatch one structured generation to the user's active BYOM vendor. Throws a
 *  ByomUserError on a user fault (surfaced, no fallback) or a recoverable Error
 *  (the wrapper falls through to the app's own provider). */
export function runByom(byom: ResolvedByomKey, call: ByomCall): Promise<ByomResult> {
  switch (byom.vendor) {
    case "openai":
      return runOpenAi(byom, call);
    case "anthropic":
      return runAnthropic(byom, call);
    case "gemini":
      return runGemini(byom, call);
    case "openrouter":
      return runOpenRouter(byom, call);
  }
}
