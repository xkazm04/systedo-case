/** Kvalita leadů — cost-per-qualified-lead, CRM feedback loop. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LeadQualityModule from "@/components/app/modules/LeadQualityModule";
import { sourcesForProject } from "@/lib/lead-quality/sample";
import { resolveLeadSources } from "@/lib/lead-quality/resolve";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "kvalita-leadu");
  // Live-over-sample: the funnel runs on imported CRM leads when the project has
  // any, else the seeded sample — and the shell's "sample" note only shows when sample.
  const resolved = await resolveLeadSources(project.id, sourcesForProject(project));
  return (
    <ModulePage moduleKey="kvalita-leadu" sample={!resolved.live}>
      <LeadQualityModule
        sources={resolved.sources}
        projectId={project.id}
        live={resolved.live}
        source={resolved.source}
        syncedAt={resolved.syncedAt}
        sourceUrl={resolved.sourceUrl}
      />
    </ModulePage>
  );
}
