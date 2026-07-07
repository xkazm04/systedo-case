/** Live per-project LLM spend, read from the telemetry collection. Kept in a
 *  server-only lib (not the page component) so the current-time read stays out of
 *  render — a server component must be pure. Returns [] when there's no telemetry
 *  yet (local/dev, or a brand-new project), which the page treats as "fall back to
 *  the seed". */
import "server-only";
import { listLlmTelemetrySince } from "@/lib/llm/telemetry";
import { telemetryToSpend } from "./aggregate";
import type { SpendEntry } from "./sample";

export async function liveSpendForProject(projectId: string, windowDays = 60): Promise<SpendEntry[]> {
  const nowMs = Date.now();
  const sinceIso = new Date(nowMs - windowDays * 86_400_000).toISOString();
  const telemetry = await listLlmTelemetrySince(sinceIso, 1000);
  return telemetryToSpend(telemetry, projectId, nowMs);
}
