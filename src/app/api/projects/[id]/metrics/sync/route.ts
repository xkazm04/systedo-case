/** A1 — sync / unlink a project's live report metrics from Google Ads. Per-user,
 *  ownership-checked. POST delegates to the credential-gated syncReportMetricsFromAds
 *  (returns a classified error the client surfaces); DELETE drops the stored series so
 *  the report + recap revert to sample (the honest hasSyncedMetrics signal flips for
 *  every surface that reads it). Server-only. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { syncReportMetricsFromAds } from "@/lib/report-metrics/sync";
import { clearReportMetrics } from "@/lib/report-metrics/store";
import { emitProjectActivity } from "@/lib/activity/emit";
import { enforceUserRate, WORKSPACE_RATE } from "@/lib/api/route-utils";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  // Throttle before the live Google Ads round-trip (loopable straight from the UI).
  const limited = enforceUserRate(uid, WORKSPACE_RATE.metricsSync(), "Příliš mnoho synchronizací. Zkuste to prosím za chvíli.");
  if (limited) return limited;

  const result = await syncReportMetricsFromAds(project, uid);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}

/** Unlink live data: clear the project's synced metrics so the report reverts to the
 *  illustrative sample series. Ownership-checked; records the reversal on the activity
 *  feed (mirrors the "Google Ads napojen" entry emitted when the account is linked). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  await clearReportMetrics(project.id);
  // Best-effort audit entry — never fails the unlink (emit swallows its own errors).
  await emitProjectActivity(uid, project.id, {
    kind: "update",
    module: "integrace",
    severity: "warning",
    title: "Živá data odpojena",
    detail: "Report se vrátil k ukázkovým datům.",
    actor: "Vy",
  });
  return Response.json({ ok: true });
}
