/** Pure rollup of per-tool LLM telemetry into the single "AI provoz" summary
 *  the weekly digest emails/webhooks — total calls, estimated cost, demo-rate
 *  (a provider silently going down shows up here first), output repairs and
 *  drifted tool contracts. Framework-free and Firestore-free (only a type import
 *  from ./telemetry, which is erased at runtime), so it is unit-testable and
 *  safe to import anywhere; the reads stay in telemetry.ts. */
import { fmtPct } from "@/lib/format";
import type { ToolTelemetry } from "./telemetry";

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
}

/** Fold the per-tool aggregation (telemetry.aggregateTelemetry) into one
 *  operator-facing summary. Pure. */
export function summarizeAiOps(tools: ToolTelemetry[]): AiOpsSummary {
  const calls = tools.reduce((s, t) => s + t.calls, 0);
  const demoCalls = tools.reduce((s, t) => s + t.demoCalls, 0);
  const demoRate = calls > 0 ? demoCalls / calls : 0;
  return {
    calls,
    demoCalls,
    demoRate,
    totalCostUsd: tools.reduce((s, t) => s + t.totalCostUsd, 0),
    repairs: tools.reduce((s, t) => s + t.repairs, 0),
    driftedTools: tools.filter((t) => t.drifted).map((t) => t.toolId),
    warn: calls > 0 && demoRate > AI_DEMO_RATE_WARN,
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
