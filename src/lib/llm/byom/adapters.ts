/** BYOM provider adapters — one uniform `run()` per vendor for a user's own API
 *  key. All three call the vendor's REST API with `fetch` (no vendor SDK) so the
 *  failure path exposes a raw HTTP status the fallback classifier can read, and so
 *  the adapters share one shape. Gemini uses native structured output (the tools'
 *  Google-`Type` schema is already the shape `responseSchema` wants); OpenAI and
 *  Anthropic embed the schema in the prompt and parse with the wrapper's robust
 *  `extractJson` (the same approach the Claude CLI provider uses). Server-only.
 *
 *  NOTE: raw `fetch` (not the vendor SDKs) is deliberate — it keeps the three
 *  adapters uniform, needs no new dependencies (matching the repo's zero-dep
 *  spirit and the fetch-based embeddings path), and gives the error classifier the
 *  exact HTTP status the user-fault-vs-recoverable decision depends on. */
import { extractJson } from "../claude";
import { classifyByomHttp } from "../errors";
import { byomModel } from "../models";
import type { TokenUsage } from "../cost";
import type { ResolvedByomKey } from "../keys/types";
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
}

export interface ByomResult {
  parsed: unknown;
  usage?: TokenUsage;
}

/** Build the user-turn content for the prompt-embed vendors: the task prompt plus
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

// ── OpenAI (Chat Completions, prompt-embed) ───────────────────────────────────
async function runOpenAi(byom: ResolvedByomKey, call: ByomCall): Promise<ByomResult> {
  const model = byomModel("openai", call.tier, byom.model, byom.fastModel);
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${byom.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: call.system },
        { role: "user", content: embeddedUserContent(call.prompt, call.schema) },
      ],
      ...(call.temperature !== undefined ? { temperature: call.temperature } : {}),
    }),
    signal: call.signal,
  });
  if (!res.ok) throw await byomHttpError("openai", res);

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

// ── Anthropic (Messages API, prompt-embed) ────────────────────────────────────
async function runAnthropic(byom: ResolvedByomKey, call: ByomCall): Promise<ByomResult> {
  const model = byomModel("anthropic", call.tier, byom.model, byom.fastModel);
  const base = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": byom.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    // No temperature (removed on current Claude models — a value 400s). No thinking
    // (structured extraction doesn't need it). max_tokens sized for the heaviest
    // tool while staying under the non-streaming HTTP-timeout guidance.
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      system: call.system,
      messages: [{ role: "user", content: embeddedUserContent(call.prompt, call.schema) }],
    }),
    signal: call.signal,
  });
  if (!res.ok) throw await byomHttpError("anthropic", res);

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
  }
}
