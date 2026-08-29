/** Výkon — the performance dashboard, re-hosted inside the project shell. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import DashboardClient, { type AdsDiagnosisMount } from "@/components/dashboard/DashboardClient";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { resolveAdsDiagnosisRequest } from "@/lib/diagnoses/resolve-request";
import { latestDiagnosis, listDiagnoses } from "@/lib/diagnoses/store";
import { inputDigest } from "@/lib/diagnoses/types";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, userId } = await requireProjectModule(projectId, "vykon");
  // Direction 2 — one profit truth: Výkon resolves the SAME live-over-sample dataset
  // /zisk and the monthly report use (resolveReportDataset), so a live-synced tenant
  // reads its real KPIs here instead of a hard-pinned sample spine that contradicted
  // its sibling modules. Unsynced tenants get the identical illustrative sample
  // (getProjectDataset underneath) and keep the honesty banner. The banner follows
  // this one resolution (`sample={!resolved.live}`), exactly like /zisk.
  const resolved = await resolveReportDataset(project);

  // Wave 1 — the ads-performance diagnosis. The request is rebuilt by the SAME server
  // resolver the /api/ai click path re-runs, so the stale badge (its digest) and the
  // outcome chip (its portfolio PNO) compare against exactly what a run would
  // diagnose. A project with no campaigns resolves nothing and the panel is omitted
  // rather than mounted over an empty portfolio.
  const [adsRequest, adsInitial, adsHistory] = await Promise.all([
    resolveAdsDiagnosisRequest(project, userId),
    latestDiagnosis(project.id, "ads"),
    listDiagnoses(project.id, "ads"),
  ]);
  const adsDiagnosis: AdsDiagnosisMount | undefined = adsRequest
    ? {
        projectId,
        initial: adsInitial,
        history: adsHistory,
        digest: inputDigest(adsRequest.request),
        pno: adsRequest.request.totals.pno,
      }
    : undefined;

  return (
    <ModulePage moduleKey="vykon" sample={!resolved.live}>
      <DashboardClient
        data={resolved.data}
        reportHref={`/app/${projectId}/report`}
        adsDiagnosis={adsDiagnosis}
      />
    </ModulePage>
  );
}
