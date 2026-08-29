/** Kvalita leadů — cost-per-qualified-lead, CRM feedback loop. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LeadQualityModule from "@/components/app/modules/LeadQualityModule";
import { sourcesForProject } from "@/lib/lead-quality/sample";
import { resolveLeadSources } from "@/lib/lead-quality/resolve";
import { getConversionSummary } from "@/lib/leads/conversion-state";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, userId } = await requireProjectModule(projectId, "kvalita-leadu");
  // Live-over-sample: the funnel runs on imported CRM leads when the project has
  // any, else the seeded sample — and the shell's "sample" note only shows when sample.
  // WP W3-C: the conversion ledger's rolled-up summary rides alongside — null until
  // the `conversion-rollup` ledger step has run once, which the strip states honestly.
  const [resolved, conversions] = await Promise.all([
    resolveLeadSources(project.id, sourcesForProject(project)),
    getConversionSummary(userId, project.id),
  ]);
  return (
    <ModulePage moduleKey="kvalita-leadu" sample={!resolved.live}>
      <LeadQualityModule
        sources={resolved.sources}
        projectId={project.id}
        live={resolved.live}
        source={resolved.source}
        syncedAt={resolved.syncedAt}
        sourceUrl={resolved.sourceUrl}
        conversions={conversions}
      />
    </ModulePage>
  );
}
