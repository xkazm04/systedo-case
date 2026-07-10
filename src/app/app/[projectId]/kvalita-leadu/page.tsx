/** Kvalita leadů — cost-per-qualified-lead, CRM feedback loop. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LeadQualityModule from "@/components/app/modules/LeadQualityModule";
import { sourcesForProject } from "@/lib/lead-quality/sample";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "kvalita-leadu");
  return (
    <ModulePage moduleKey="kvalita-leadu" sample>
      <LeadQualityModule sources={sourcesForProject(project)} />
    </ModulePage>
  );
}
