/** A1 — sync / unlink a project's live report metrics from Google Ads. Per-user,
 *  ownership-checked. POST delegates to the credential-gated syncReportMetricsFromAds
 *  (returns a classified error the client surfaces); DELETE drops the stored series so
 *  the report + recap revert to sample (the honest hasSyncedMetrics signal flips for
 *  every surface that reads it). Server-only. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { syncReportMetricsFromAds } from "@/lib/report-metrics/sync";
import { clearReportMetrics } from "@/lib/report-metrics/store";
import { emitProjectActivity } from "@/lib/activity/emit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

  const result = await syncReportMetricsFromAds(project, uid);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}

/** Unlink live data: clear the project's synced metrics so the report reverts to the
 *  illustrative sample series. Ownership-checked; records the reversal on the activity
 *  feed (mirrors the "Google Ads napojen" entry emitted when the account is linked). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

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
