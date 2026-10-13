/** LightTrack gateway transport (server-only). One OpenAI-compatible HTTP call to a local
 *  `lt-gateway`, which owns the retry, the cross-seat fallback (Claude seat ⇄ ChatGPT seat)
 *  and the LightTrack record for every attempt. This module is a THIN client: it builds the
 *  request, reads the answer, and maps a failure onto the app's typed error codes. No seat logic
 *  lives here — the route in the gateway's `gateway.toml` decides who answers.
 *
 *  Opt-in by env:
 *    LLM_GATEWAY_URL   base URL of the gateway's OpenAI surface, e.g. http://127.0.0.1:8791/v1.
 *                      Unset → this transport is off and the wrapper runs its own ladder.
 *
 *  Which tools it serves is not configured here twice: the gateway lists its routes at
 *  `GET /v1/models`, and a tool is gateway-served exactly when a route carries its `// llm-tool`
 *  id (the same key the LightTrack use-case registry uses). Cached for a minute so a wrapper
 *  call costs one round-trip, not two. */
import { toJsonSchema } from "./byom/schema";
import { extractJsonTraced, type ExtractedJson } from "./claude";
import type { TokenUsage } from "./cost";
import { LlmCallError, type LlmErrorCode } from "./errors";

const ROUTES_TTL_MS = 60_000;
const ROUTES_PROBE_TIMEOUT_MS = 3_000;
/** The gateway ignores the key; the OpenAI shape merely requires one. */
const BEARER = "lt";

export function gatewayUrl(): string | undefined {
  const raw = process.env.LLM_GATEWAY_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : undefined;
}

export function gatewayEnabled(): boolean {
  return gatewayUrl() !== undefined;
}

/** Route names from a `GET /v1/models` listing (OpenAI list shape, or a bare array). Pure. */
export function routeIdsFrom(listing: unknown): Set<string> {
  const rows = Array.isArray(listing)
    ? listing
    : listing && typeof listing === "object" && Array.isArray((listing as { data?: unknown }).data)
      ? ((listing as { data: unknown[] }).data as unknown[])
      : [];
  const ids = new Set<string>();
  for (const row of rows) {
    if (typeof row === "string") ids.add(row);
    else if (row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string") {
      ids.add((row as { id: string }).id);
    }
  }
  return ids;
}

let routesCache: { at: number; ids: Set<string> } | null = null;

/** The routes the gateway currently serves, cached. An unreachable gateway reads as "no routes"
 *  (and is re-probed after the TTL) so a stopped gateway hands every tool back to the in-app
 *  ladder instead of failing generations. */
async function gatewayRoutes(base: string): Promise<Set<string>> {
  if (routesCache && Date.now() - routesCache.at < ROUTES_TTL_MS) return routesCache.ids;
  let ids = new Set<string>();
  try {
    const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(ROUTES_PROBE_TIMEOUT_MS) });
    if (res.ok) ids = routeIdsFrom(await res.json());
  } catch {
    /* unreachable → no routes */
  }
  routesCache = { at: Date.now(), ids };
  return ids;
}

/** Test seam: forget the cached route listing. */
export function resetGatewayRoutes(): void {
  routesCache = null;
}

/** The gateway route for a tool id, or null when the gateway is off, down, or has no route
 *  named after the tool. A route name IS the use-case key, so no mapping table exists. */
export async function gatewayRouteFor(toolId: string): Promise<string | null> {
  const base = gatewayUrl();
  if (!base) return null;
  return (await gatewayRoutes(base)).has(toolId) ? toolId : null;
}

export interface GatewayCall {
  route: string;
  system: string;
  prompt: string;
  /** the tool's Google-`Type` schema; converted to strict JSON Schema on the wire */
  schema: object;
  signal?: AbortSignal;
}

/** The chat-completions body for one call. `model` is the route (the gateway resolves the
 *  target); the schema rides as `response_format: json_schema`, which the gateway enforces through
 *  the engine's native schema path (`claude -p --json-schema`, Codex `--output-schema`). Pure. */
export function buildGatewayRequest(call: Pick<GatewayCall, "route" | "system" | "prompt" | "schema">) {
  return {
    model: call.route,
    messages: [
      { role: "system", content: call.system },
      { role: "user", content: call.prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "structured_output", strict: true, schema: toJsonSchema(call.schema) },
    },
  };
}

export interface GatewayCompletion {
  /** the assistant text (the structured answer, serialized) */
  text: string;
  /** `provider/model[@effort]` that answered */
  servedBy: string;
  /** true when the primary did not answer and a fallback seat did */
  fellBack: boolean;
  usage?: TokenUsage;
  /** provider-reported $; null on a subscription seat */
  costUsd: number | null;
}

/** Read one successful completion. Headers carry the routing facts; the body's `lighttrack`
 *  block repeats them for a client that cannot see headers. Pure. */
export function parseGatewayCompletion(
  body: unknown,
  headers: { get(name: string): string | null }
): GatewayCompletion {
  const b = (body ?? {}) as {
    model?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
    lighttrack?: { served_by?: unknown; fell_back?: unknown; cost_usd?: unknown };
  };
  const content = b.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : "";
  const lt = b.lighttrack ?? {};
  const servedBy =
    headers.get("x-lighttrack-served-by") ??
    (typeof lt.served_by === "string" ? lt.served_by : typeof b.model === "string" ? b.model : "lt-gateway");
  const fellBackHeader = headers.get("x-lighttrack-fell-back");
  const fellBack = fellBackHeader !== null ? fellBackHeader === "1" : lt.fell_back === true;
  const u = b.usage;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const usage: TokenUsage | undefined = u
    ? {
        inputTokens: num(u.prompt_tokens),
        outputTokens: num(u.completion_tokens),
        totalTokens: num(u.total_tokens) || num(u.prompt_tokens) + num(u.completion_tokens),
        ...(typeof lt.cost_usd === "number" ? { costUsd: lt.cost_usd } : {}),
      }
    : undefined;
  return { text, servedBy, fellBack, usage, costUsd: typeof lt.cost_usd === "number" ? lt.cost_usd : null };
}

/** Map a non-2xx gateway answer onto the wrapper's error vocabulary. A 503 with Retry-After is
 *  every seat on hold (the gateway already tried the fallback), a 429 is LightTrack's own
 *  admission block; both are `rate_limited` with the stated wait. A 502 is the chain failing for
 *  a non-limit reason (`server`); a 4xx is this request's fault (`unknown` — never retried). Pure. */
export function gatewayError(status: number, body: unknown, retryAfter: string | null): LlmCallError {
  const b = (body ?? {}) as { error?: { message?: unknown } };
  const detail = typeof b.error?.message === "string" ? b.error.message.slice(0, 300) : "";
  const secs = retryAfter ? Number(retryAfter) : NaN;
  const retryAfterMs = Number.isFinite(secs) && secs > 0 ? secs * 1000 : undefined;
  let code: LlmErrorCode;
  if (status === 429 || status === 503) code = "rate_limited";
  else if (status >= 500) code = "server";
  else code = "unknown";
  const msg = `Gateway odpověděla ${status}${detail ? `: ${detail}` : ""}`;
  return new LlmCallError(code, msg, { provider: "lt-gateway", status, retryAfterMs });
}

/** Run one structured generation through the gateway. Exactly one HTTP call: the gateway does
 *  the retrying and the seat fallback, so an app-side retry on top would double every
 *  exhausted-seat attempt. Throws an `LlmCallError` on any failure. */
export async function runGateway(call: GatewayCall): Promise<ExtractedJson & Omit<GatewayCompletion, "text">> {
  const base = gatewayUrl();
  if (!base) throw new LlmCallError("unknown", "LLM_GATEWAY_URL není nastaveno.", { provider: "lt-gateway" });
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${BEARER}` },
      body: JSON.stringify(buildGatewayRequest(call)),
      signal: call.signal,
    });
  } catch (err) {
    if (call.signal?.aborted) throw err;
    throw new LlmCallError("network", "Gateway není dostupná.", { provider: "lt-gateway", cause: err });
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw gatewayError(res.status, body, res.headers.get("retry-after"));
  const done = parseGatewayCompletion(body, res.headers);
  const parsed = extractJsonTraced(done.text);
  if (!parsed) {
    const snippet = done.text.trim().slice(0, 200).replace(/\s+/g, " ");
    throw new LlmCallError(done.text ? "malformed_json" : "empty", `Gateway nevrátila platný JSON. Začátek výstupu: ${snippet}`, {
      provider: "lt-gateway",
    });
  }
  return { ...parsed, servedBy: done.servedBy, fellBack: done.fellBack, usage: done.usage, costUsd: done.costUsd };
}
