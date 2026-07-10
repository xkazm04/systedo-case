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
    .map((e, i) => {
      // A malformed/absent `at` → Date.parse NaN → daysAgo NaN, which then fails every
      // windowed filter (NaN <= windowDays is false) and silently drops the row's cost
      // from the tiles. Fold an unparseable timestamp into the current day so its spend
      // is still counted, never silently discarded.
      const t = Date.parse(e.at);
      const daysAgo = Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t) / DAY_MS)) : 0;
      return {
        id: `tele-${i}`,
        toolId: e.toolId,
        model: e.model,
        calls: 1,
        tokens: e.inputTokens + e.outputTokens,
        costUsd: e.estCostUsd,
        daysAgo,
      };
    });
}
