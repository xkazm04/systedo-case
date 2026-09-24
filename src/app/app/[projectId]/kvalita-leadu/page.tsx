/** Kvalita leadů — cost-per-qualified-lead, CRM feedback loop. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LeadQualityModule from "@/components/app/modules/LeadQualityModule";
import { resolveLeadFunnel } from "@/lib/lead-quality/resolve";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, userId } = await requireProjectModule(projectId, "kvalita-leadu");
  // One resolver for the page, the diagnosis click path, the digest cron and the
  // recap: CRM contacts → imported leads → the seeded sample (the shell's "sample"
  // note only shows on the last), plus the WP W3-C conversion-ledger summary and its
  // per-label join — null until the `conversion-rollup` step has run once.
  const funnel = await resolveLeadFunnel(project, userId);
  return (
    <ModulePage moduleKey="kvalita-leadu" sample={!funnel.live}>
      <LeadQualityModule sources={funnel.sources} projectId={project.id} funnel={funnel} />
    </ModulePage>
  );
}
