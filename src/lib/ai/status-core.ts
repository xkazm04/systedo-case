/** Pure decision helpers + payload contract for the AI preflight status
 *  endpoint (GET /api/ai/status). Framework-free and store-free, so the server
 *  route and the client hook/banner share one shape and the logic is
 *  unit-testable without Firestore or sqlite.
 *
 *  Why this exists: the client only learned it was in keyless demo mode AFTER a
 *  generation completed (meta.demo on the result), and had no view of the
 *  per-IP budget until it slammed into a 429. The status payload lets every AI
 *  panel warn upfront — before the user fills a careful form and burns a
 *  request on canned demo output or a spent budget. */

import { AI_DEMO_RATE_WARN } from "@/lib/llm/telemetry-ops";
import type { LlmTelemetryEntry } from "@/lib/llm/telemetry";

/** Which path a generation would take right now. Mirrors the provider order in
 *  the LLM wrapper: Claude→Gemini in dev, Gemini→Claude in prod, demo when
 *  neither is configured. */
export type AiServePath = "claude" | "gemini" | "demo";

/** One provider's health as the wrapper sees it (cached availability probe). */
export interface AiProviderStatus {
  model: string;
  available: boolean;
}

export interface AiStatusPayload {
  /** development environment (Claude-first provider order) */
  dev: boolean;
  /** no provider is configured/available — generations return canned demo output */
  demo: boolean;
  /** the provider a generation would use right now */
  wouldServe: AiServePath;
  /** per-provider availability — the one-call answer to "why is everything demo?" */
  providers: AiProviderStatus[];
  /** recent-traffic rollup from the wrapper's telemetry: a high demo share on a
   *  seemingly-available provider means it is silently failing at call time
   *  (the availability probe is cached and can outlive a provider outage) */
  recent?: { calls: number; demoRate: number };
  /** observed average duration (ms) per tool id, from real (non-demo) calls —
   *  lets the loading timer pace to how long THIS tool actually takes instead
   *  of one global constant */
  latency?: Record<string, number>;
  /** anonymous per-IP budget left in the current windows (read-only peek) */
  remaining: { perMin: number; perDay: number };
  /** the configured per-IP limits, for "N of M" rendering */
  limits: { perMin: number; perDay: number };
  /** signed-in per-plan AI quota (aiEval), when the caller is authenticated */
  usage?: { used: number; limit: number };
}

/** Resolve which path would serve a generation, given the environment-preferred
 *  provider order the wrapper uses (dev: Claude first; prod: Gemini first). */
export function resolveWouldServe(
  dev: boolean,
  claudeOk: boolean,
  geminiOk: boolean
): AiServePath {
  const order: [AiServePath, boolean][] = dev
    ? [
        ["claude", claudeOk],
        ["gemini", geminiOk],
      ]
    : [
        ["gemini", geminiOk],
        ["claude", claudeOk],
      ];
  return order.find(([, ok]) => ok)?.[0] ?? "demo";
}

/** Minimum real calls before an average is trusted to pace a loading timer. */
export const LATENCY_MIN_CALLS = 2;

/** Observed average duration per tool from raw telemetry entries. Demo-served
 *  calls are excluded — the canned fallback answers instantly and would fake a
 *  fast model — as are junk durations and the "unknown" bucket; tools with
 *  fewer than `minCalls` real samples stay absent so a single outlier can't
 *  set expectations. Pure. */
export function latencyByTool(
  entries: readonly LlmTelemetryEntry[],
  minCalls: number = LATENCY_MIN_CALLS
): Record<string, number> {
  const byTool = new Map<string, number[]>();
  for (const e of entries) {
    if (e.demo || !(e.tookMs > 0)) continue;
    const arr = byTool.get(e.toolId);
    if (arr) arr.push(e.tookMs);
    else byTool.set(e.toolId, [e.tookMs]);
  }
  const out: Record<string, number> = {};
  for (const [toolId, took] of byTool) {
    if (toolId === "unknown" || took.length < minCalls) continue;
    out[toolId] = Math.round(took.reduce((s, v) => s + v, 0) / took.length);
  }
  return out;
}

/** Below this many generations left for the day, the banner starts warning. */
export const PREFLIGHT_LOW_REMAINING = 5;

export type PreflightKind = "demo" | "exhausted" | "degraded" | "low" | null;

export interface PreflightNotice {
  kind: PreflightKind;
  /** generations left today on the binding budget (0 for kind "demo"/"exhausted") */
  remaining: number;
  /** the exhausted/low budget is the signed-in plan quota (else the per-IP cap) */
  metered: boolean;
}

/** What (if anything) the preflight banner should say. Demo mode outranks
 *  budget states (a burned request is worse when the answer is canned); a
 *  degraded provider (recent traffic mostly served by the demo fallback even
 *  though a provider looks available — the same threshold the weekly digest
 *  warns on) outranks the soft low-budget hint. The binding daily budget is the
 *  signed-in plan quota when present, else the anonymous per-IP daily cap. The
 *  per-minute window is deliberately ignored here — a sub-minute wait is
 *  already handled by the 429 countdown. */
export function preflightNotice(s: AiStatusPayload): PreflightNotice {
  if (s.demo) return { kind: "demo", remaining: 0, metered: Boolean(s.usage) };
  const metered = Boolean(s.usage);
  const remaining = s.usage
    ? Math.max(0, s.usage.limit - s.usage.used)
    : Math.max(0, s.remaining.perDay);
  if (remaining <= 0) return { kind: "exhausted", remaining: 0, metered };
  if (s.recent && s.recent.calls > 0 && s.recent.demoRate > AI_DEMO_RATE_WARN) {
    return { kind: "degraded", remaining, metered };
  }
  if (remaining <= PREFLIGHT_LOW_REMAINING) return { kind: "low", remaining, metered };
  return { kind: null, remaining, metered };
}
