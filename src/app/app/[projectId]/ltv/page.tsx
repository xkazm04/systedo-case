/** CAC → LTV — cohort economics. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LtvModule from "@/components/app/modules/LtvModule";
import { SAMPLE_COHORTS } from "@/lib/ltv/sample";
import { ltvSummary, withMetrics } from "@/lib/ltv/compute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "ltv");
  return (
    <ModulePage moduleKey="ltv">
      <LtvModule
        rows={SAMPLE_COHORTS.map((c) => withMetrics(c))}
        summary={ltvSummary(SAMPLE_COHORTS)}
        cohorts={SAMPLE_COHORTS}
      />
    </ModulePage>
  );
}
