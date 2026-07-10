/** CAC → LTV — cohort economics. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LtvModule from "@/components/app/modules/LtvModule";
import { ESHOP_COHORTS, SAMPLE_COHORTS } from "@/lib/ltv/sample";
import { ltvSummary, withMetrics } from "@/lib/ltv/compute";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "ltv");
  const eshop = project.type === "eshop";
  // E-shop cohorts are customer / AOV / repeat-rate shaped; app/SaaS keep the
  // signup / ARPU / retention model. Both flow through the same CAC/LTV math.
  const cohorts = eshop ? ESHOP_COHORTS : SAMPLE_COHORTS;
  return (
    <ModulePage moduleKey="ltv" sample>
      <LtvModule
        rows={cohorts.map((c) => withMetrics(c))}
        summary={ltvSummary(cohorts)}
        cohorts={cohorts}
        eshop={eshop}
      />
    </ModulePage>
  );
}
