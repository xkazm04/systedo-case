/** A1 — POST to sync a project's live report metrics from Google Ads. Per-user,
 *  ownership-checked; delegates to the credential-gated syncReportMetricsFromAds,
 *  which returns a classified error the client surfaces. Server-only. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { syncReportMetricsFromAds } from "@/lib/report-metrics/sync";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

  const result = await syncReportMetricsFromAds(project, uid);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
