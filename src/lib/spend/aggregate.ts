/** Map real LLM telemetry (one entry per generateStructured call) into the
 *  SpendEntry rows the Usage module renders, filtered to a project. Pure &
 *  framework-free (type-only import of the telemetry shape, so it never drags the
 *  Firestore module into a test/client bundle), tested. The page reads
 *  listLlmTelemetrySince() and feeds it here; an empty result falls back to the
 *  seed. */
import type { SpendEntry } from "./sample";
import type { LlmTelemetryEntry } from "@/lib/llm/telemetry";

const DAY_MS = 86_400_000;

export function telemetryToSpend(
  entries: LlmTelemetryEntry[],
  projectId: string | undefined,
  nowMs: number
): SpendEntry[] {
  return entries
    .filter((e) => (projectId ? e.projectId === projectId : true))
    .map((e, i) => ({
      id: `tele-${i}`,
      toolId: e.toolId,
      model: e.model,
      calls: 1,
      tokens: e.inputTokens + e.outputTokens,
      costUsd: e.estCostUsd,
      daysAgo: Math.max(0, Math.floor((nowMs - Date.parse(e.at)) / DAY_MS)),
    }));
}
