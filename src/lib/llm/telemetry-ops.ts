/** Pure rollup of per-tool LLM telemetry into the single "AI provoz" summary
 *  the weekly digest emails/webhooks — total calls, estimated cost, demo-rate
 *  (a provider silently going down shows up here first), output repairs and
 *  drifted tool contracts. Framework-free and Firestore-free (only a type import
 *  from ./telemetry, which is erased at runtime), so it is unit-testable and
 *  safe to import anywhere; the reads stay in telemetry.ts. */
import { fmtPct } from "@/lib/format";
import type { LlmTelemetryEntry, ToolTelemetry } from "./telemetry";
import {
  countStatuses,
  emptyStatusCounts,
  latencyPercentiles,
  successRate as computeSuccessRate,
  type LlmTelemetryStatus,
} from "./telemetry-stats";

/** Demo calls above this share of the window's traffic flags the summary — at
 *  that point the "real" AI product is mostly serving canned fallbacks, which
 *  usually means a provider went down (or was never configured in prod). */
export const AI_DEMO_RATE_WARN = 0.5;

export interface AiOpsSummary {
  /** total LLM calls in the window */
  calls: number;
  /** calls served by the keyless demo fallback */
  demoCalls: number;
  /** demoCalls / calls (0 when the window is empty) */
  demoRate: number;
  /** Σ estimated cost, USD */
  totalCostUsd: number;
  /** calls whose output needed a JSON repair pass */
  repairs: number;
  /** tool ids whose prompt/schema fingerprint drifted inside the window */
  driftedTools: string[];
  /** demoRate exceeded AI_DEMO_RATE_WARN */
  warn: boolean;
  /** per-status counts across the window. Only populated when the raw entries are
   *  passed to summarizeAiOps; otherwise all-zero (older callers stay valid). */
  statusCounts: Record<LlmTelemetryStatus, number>;
  /** share of REAL (non-demo) calls that produced a usable result (0..1); 1 when
   *  the window has no real calls. */
  successRate: number;
  /** corrupt + error calls — the "degraded/failed" total the digest highlights */
  problemCalls: number;
  /** p50/p95 latency (ms) over real calls, when raw entries were provided (else 0) */
  p50TookMs: number;
  p95TookMs: number;
}

/** Fold the per-tool aggregation (telemetry.aggregateTelemetry) into one
 *  operator-facing summary. Pure. Pass the raw windowed `entries` too to populate
 *  the status counts + latency percentiles (they can't be derived from the per-tool
 *  rollup alone); omitting them keeps every existing field intact for old callers. */
export function summarizeAiOps(tools: ToolTelemetry[], entries?: LlmTelemetryEntry[]): AiOpsSummary {
  const calls = tools.reduce((s, t) => s + t.calls, 0);
  const demoCalls = tools.reduce((s, t) => s + t.demoCalls, 0);
  const demoRate = calls > 0 ? demoCalls / calls : 0;
  const statusCounts = entries ? countStatuses(entries) : emptyStatusCounts();
  const { p50TookMs, p95TookMs } = entries ? latencyPercentiles(entries) : { p50TookMs: 0, p95TookMs: 0 };
  return {
    calls,
    demoCalls,
    demoRate,
    totalCostUsd: tools.reduce((s, t) => s + t.totalCostUsd, 0),
    repairs: tools.reduce((s, t) => s + t.repairs, 0),
    driftedTools: tools.filter((t) => t.drifted).map((t) => t.toolId),
    warn: calls > 0 && demoRate > AI_DEMO_RATE_WARN,
    statusCounts,
    successRate: entries ? computeSuccessRate(entries) : 1,
    problemCalls: statusCounts.corrupt + statusCounts.error,
    p50TookMs,
    p95TookMs,
  };
}

/** Czech one-per-line rendering for the digest email / webhook. Empty when the
 *  window saw no AI traffic, so quiet weeks add no section at all. */
export function aiOpsLines(s: AiOpsSummary): string[] {
  if (s.calls === 0) return [];
  const lines = [
    `${s.calls} volání · odhad nákladů $${s.totalCostUsd.toFixed(2)} · ` +
      `${fmtPct(s.demoRate, 0)} v ukázkovém režimu · ${s.repairs} oprav výstupu`,
  ];
  // Status + latency line — only when the raw entries were available (status data
  // present), so a caller that passes just the per-tool rollup renders exactly the
  // lines it always did.
  const statusTotal = Object.values(s.statusCounts).reduce((a, b) => a + b, 0);
  if (statusTotal > 0) {
    lines.push(
      `Úspěšnost ${fmtPct(s.successRate, 0)} · ${s.statusCounts.corrupt} poškozených · ` +
        `${s.statusCounts.error} chyb · latence p50 ${s.p50TookMs} ms / p95 ${s.p95TookMs} ms`
    );
    if (s.problemCalls > 0) {
      lines.push(
        `${s.problemCalls} volání skončilo chybou nebo poškozeným výstupem — zkontrolujte spolehlivost AI.`
      );
    }
  }
  if (s.warn) {
    lines.push(
      `Ukázkový režim přesáhl ${fmtPct(AI_DEMO_RATE_WARN, 0)} volání — zkontrolujte dostupnost AI poskytovatele.`
    );
  }
  for (const toolId of s.driftedTools) {
    lines.push(`Kontrakt nástroje „${toolId}“ se během okna změnil (drift promptu či schématu).`);
  }
  return lines;
}
