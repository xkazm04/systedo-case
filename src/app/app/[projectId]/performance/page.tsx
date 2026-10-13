/** The Performance roof (ADR-0013) — Výkon IS this page: the area head, then the
 *  three stations (Measure · Triage · Act) over the live-over-sample dataset, then
 *  the area's rooms. Streams behind Suspense so navigation paints the shell first. */
import { Suspense } from "react";
import { requireProjectModule } from "@/lib/projects/guard";
import AreaRoof from "@/components/app/roof/AreaRoof";
import SampleDataNote from "@/components/app/SampleDataNote";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import DashboardClient, { type AdsDiagnosisMount } from "@/components/dashboard/DashboardClient";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { resolveAdsDiagnosisRequest } from "@/lib/diagnoses/resolve-request";
import { latestDiagnosis, listDiagnoses } from "@/lib/diagnoses/store";
import { inputDigest } from "@/lib/diagnoses/types";
import { moduleHref } from "@/lib/projects/modules";

async function Roof({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, userId } = await requireProjectModule(projectId, "vykon");
  // Direction 2 — one profit truth: the SAME live-over-sample dataset /zisk and the
  // monthly report use (resolveReportDataset); the honesty note follows it.
  const resolved = await resolveReportDataset(project);

  // Wave 1 — the ads-performance diagnosis, rebuilt by the SAME server resolver the
  // /api/ai click path re-runs, so its stale badge and outcome chip compare against
  // what a run would diagnose. No campaigns → no panel.
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
    <AreaRoof area="performance" project={project} userId={userId}>
      {!resolved.live && <SampleDataNote />}
      <DashboardClient
        data={resolved.data}
        reportHref={`${moduleHref(projectId, "vykon")}/report`}
        adsDiagnosis={adsDiagnosis}
      />
    </AreaRoof>
  );
}

export default function Page({ params }: { params: Promise<{ projectId: string }> }) {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Roof params={params} />
    </Suspense>
  );
}
