/** Lokální dominance — service×area coverage gaps + reputation. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LocalModule from "@/components/app/modules/LocalModule";
import { resolveLocalDiagnosisRequest } from "@/lib/diagnoses/resolve-request";
import { latestDiagnosis, listDiagnoses } from "@/lib/diagnoses/store";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "lokalni");

  // The AI "Lokální diagnóza" request (and the resolved targets / reviews the module
  // renders) come from the SAME shared server resolver the /api/ai click path re-runs
  // (Direction 1), so the page and the diagnosed numbers agree exactly — and the
  // stale-badge digest the panel compares against is computed from this one request.
  const {
    request: diagnosisRequest,
    targets,
    reviewProfiles,
    reviewsLive,
    coverageLive,
    coverageSource,
    coverageSyncedAt,
    coverageSourceUrl,
    recentReviews,
    businessType,
  } = await resolveLocalDiagnosisRequest(project);
  const [initialDiagnosis, diagnosisHistory] = await Promise.all([
    latestDiagnosis(project.id, "local"),
    listDiagnoses(project.id, "local"),
  ]);

  return (
    <ModulePage moduleKey="lokalni" sample>
      <LocalModule
        targets={targets}
        reviews={reviewProfiles}
        reviewsLive={reviewsLive}
        coverageLive={coverageLive}
        coverageSource={coverageSource}
        coverageSyncedAt={coverageSyncedAt}
        coverageSourceUrl={coverageSourceUrl}
        recentReviews={recentReviews}
        businessName={project.name}
        businessType={businessType}
        projectId={projectId}
        diagnosisRequest={diagnosisRequest}
        initialDiagnosis={initialDiagnosis}
        diagnosisHistory={diagnosisHistory}
      />
    </ModulePage>
  );
}
