/** Kvalita leadů — cost-per-qualified-lead, CRM feedback loop. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LeadQualityModule from "@/components/app/modules/LeadQualityModule";
import { SAMPLE_SOURCES } from "@/lib/lead-quality/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "kvalita-leadu");
  return (
    <ModulePage moduleKey="kvalita-leadu">
      <LeadQualityModule sources={SAMPLE_SOURCES} />
    </ModulePage>
  );
}
