/** Live per-project LLM spend, read from the telemetry collection. Kept in a
 *  server-only lib (not the page component) so the current-time read stays out of
 *  render — a server component must be pure. `ok` is false only when the telemetry
 *  read FAILED (an outage); an empty window is `ok: true`, entries: [] (a brand-new
 *  project) → the page falls back to the seed. On failure the page shows an
 *  "unavailable" state instead of presenting seeded spend as the tenant's own. */
import "server-only";
import { listLlmTelemetryForProject } from "@/lib/llm/telemetry";
import { telemetryToSpend } from "./aggregate";
import type { SpendEntry } from "./sample";

export async function liveSpendForProject(
  projectId: string,
  windowDays = 60
): Promise<{ entries: SpendEntry[]; ok: boolean }> {
  const nowMs = Date.now();
  const sinceIso = new Date(nowMs - windowDays * 86_400_000).toISOString();
  try {
    // Read THIS project's telemetry directly (project-scoped query) rather than the
    // global newest-1000 window filtered in memory — the latter dropped a project's
    // rows once platform-wide traffic exceeded 1000/window, silently under-reporting
    // spend or flipping the page to seed data based on other tenants' volume.
    const telemetry = await listLlmTelemetryForProject(projectId, sinceIso);
    return { entries: telemetryToSpend(telemetry, projectId, nowMs), ok: true };
  } catch {
    return { entries: [], ok: false };
  }
}
