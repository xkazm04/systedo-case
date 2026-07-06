/** LightTrack mirror — send every LLM call the app records to a self-hosted
 *  LightTrack observability server (POST /v1/events). This is the one seam that
 *  fans systedo's whole LLM footprint into LightTrack: it is called from
 *  `recordLlmCall` (src/lib/llm/telemetry.ts), the single funnel that every AI
 *  path in the app already flows through — the text tools (generateStructured),
 *  RAG embeddings (patterns/embeddings), and Creative Studio (Leonardo image gen
 *  + Gemini vision scoring). Wire one hook, capture them all.
 *
 *  Fire-and-forget by design (mirrors the official lighttrack-client contract):
 *  it never blocks the request path, never throws into the caller, and aborts a
 *  stuck send after a short timeout. A telemetry mirror must never degrade — or
 *  break — the generation it observes.
 *
 *  Opt-in: it stays a no-op until a LightTrack project (dev) or key (enforced /
 *  cloud) is configured, so a clean checkout without LightTrack running sends
 *  nothing and makes no stray requests.
 *
 *  Config (env):
 *    LIGHTTRACK_URL      API base URL (default http://127.0.0.1:8787 — local).
 *    LIGHTTRACK_PROJECT  project id events are stamped with. Required to enable
 *                        in local/dev mode (the server has no key to derive it).
 *    LIGHTTRACK_KEY      bearer key for enforced/cloud mode; also enables sending.
 *                        A project key pins the project server-side (overrides
 *                        LIGHTTRACK_PROJECT).
 *    LIGHTTRACK_SOURCE   source label stamped on events (default "systedo").
 *    LIGHTTRACK_ENABLED  set to "false" to hard-disable even when configured.
 *
 *  Future: point LIGHTTRACK_URL/LIGHTTRACK_KEY at the cloud instance to track
 *  production traffic — no code change, only env. Server-only.
 */
import type { LlmTelemetryEntry } from "./telemetry";

const URL_BASE = (process.env.LIGHTTRACK_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
const KEY = process.env.LIGHTTRACK_KEY || undefined;
const PROJECT = process.env.LIGHTTRACK_PROJECT || undefined;
const SOURCE = process.env.LIGHTTRACK_SOURCE || "systedo";
const TIMEOUT_MS = 2000;

/** Opt-in: emit only when a project or key is configured and not hard-disabled.
 *  Without either, the local server (dev mode) would reject an event that has no
 *  project anyway — so we skip the request entirely. */
const ENABLED = process.env.LIGHTTRACK_ENABLED !== "false" && Boolean(PROJECT || KEY);

/** Environment tag so dev and production traffic stay separable in one project. */
const ENV_TAG = process.env.NODE_ENV === "production" ? "env:prod" : "env:dev";

/** Map the app's model/provider tag to LightTrack's provider enum
 *  (openai | anthropic | google). systedo records the *model tag* as the
 *  provider at the text chokepoint ("claude-sonnet", "gemini-3-flash-preview")
 *  and a bare provider name elsewhere ("gemini", "leonardo") — this collapses
 *  both. Anything unmapped (e.g. "leonardo") is stored server-side as `unknown`. */
function normProvider(tag: string): string {
  const s = tag.toLowerCase();
  if (s.includes("claude") || s.includes("anthropic")) return "anthropic";
  if (s.includes("gemini") || s.includes("google") || s.includes("vertex")) return "google";
  if (s.includes("gpt") || s.includes("openai")) return "openai";
  return s; // leonardo, etc. → server maps unknown providers to `unknown`
}

/** chat | embedding | other, inferred from the recorded call's shape. */
function operationFor(entry: LlmTelemetryEntry): "chat" | "embedding" | "other" {
  if (entry.toolId.includes("embed") || entry.model.includes("embedding")) return "embedding";
  if (entry.provider === "leonardo" || entry.model.includes("vision") || entry.model.includes("image")) {
    return "other";
  }
  return "chat";
}

/** POST a body to LightTrack, best-effort: swallow every error (a down or slow
 *  server must never affect the app) and abort after TIMEOUT_MS. Not awaited by
 *  the caller. */
function post(path: string, body: Record<string, unknown>): void {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (KEY) headers.Authorization = `Bearer ${KEY}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  void fetch(`${URL_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: ac.signal,
  })
    .catch(() => undefined) // best-effort: telemetry must never break the host app
    .finally(() => clearTimeout(timer));
}

/**
 * Mirror one recorded LLM call to LightTrack. Fire-and-forget: returns
 * immediately, the send happens off the request path. Sends systedo's own
 * `cost_usd` (subscription = $0, image/embedding char-based) rather than letting
 * the server re-derive from tokens, so LightTrack agrees with the app's own AI
 * telemetry. The `tool:<id>` tag and `product_id` metadata make per-tool cost /
 * margin rollups queryable.
 */
export function trackLlmEvent(entry: LlmTelemetryEntry): void {
  if (!ENABLED) return;
  try {
    const tags = [`tool:${entry.toolId}`, ENV_TAG];
    if (entry.demo) tags.push("demo");
    if (entry.repaired) tags.push("repaired");
    if (entry.fellBack) tags.push("fell_back");

    const body: Record<string, unknown> = {
      provider: normProvider(entry.provider || entry.model),
      model: entry.model,
      usage: { input: entry.inputTokens, output: entry.outputTokens },
      cost_usd: entry.estCostUsd,
      latency_ms: entry.tookMs,
      operation: operationFor(entry),
      status: "success",
      source: SOURCE,
      tags,
      metadata: {
        toolId: entry.toolId,
        promptHash: entry.promptHash,
        attempts: entry.attempts,
        demo: entry.demo,
        repaired: entry.repaired,
        // product == the app feature/tool, so `/v1/margin?by=product` rolls up per tool.
        product_id: entry.toolId,
      },
    };
    // In dev/keyless mode the server needs the project stamped on the event; a
    // project key would override it server-side.
    if (PROJECT) body.project_id = PROJECT;

    post("/v1/events", body);
  } catch {
    // Never let mirroring surface to the caller.
  }
}

/**
 * Mirror a provider-level FAILURE to LightTrack as an `error` event. The chokepoint
 * calls this when a whole provider exhausts its retries and it is about to fall
 * through to the next provider (or degrade to the demo) — so a silent fallback stops
 * being invisible and becomes a signal the monitoring can act on (error-spike, etc.).
 * Fire-and-forget, same best-effort contract as `trackLlmEvent`.
 */
export function trackLlmError(model: string, toolId: string, message: string): void {
  if (!ENABLED) return;
  try {
    const body: Record<string, unknown> = {
      provider: normProvider(model),
      model,
      status: "error",
      error: message.slice(0, 500),
      operation: "chat",
      source: SOURCE,
      tags: [`tool:${toolId}`, ENV_TAG, "provider_failed"],
      metadata: { toolId, product_id: toolId },
    };
    if (PROJECT) body.project_id = PROJECT;
    post("/v1/events", body);
  } catch {
    // Never let mirroring surface to the caller.
  }
}
