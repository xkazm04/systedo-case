/** CAC → LTV — cohort economics. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LtvModule from "@/components/app/modules/LtvModule";
import { resolveCohorts } from "@/lib/ltv/resolve";
import { ltvSummary, withMetrics } from "@/lib/ltv/compute";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "ltv");
  const eshop = project.type === "eshop";
  // Direction 2 — one cohort truth: resolve the SAME project-varied cohorts the
  // report's "Beyond this period" block reads (resolveCohorts), so a project's LTV:CAC
  // is identical on both surfaces. E-shop cohorts are customer / AOV / repeat-rate
  // shaped; app/SaaS keep the signup / ARPU / retention model — both flow through the
  // same CAC/LTV math. Still the illustrative floor, so the ModulePage `sample` flag
  // stays until the live seam (documented in resolve.ts) lands.
  const cohorts = resolveCohorts(project);
  return (
    <ModulePage moduleKey="ltv" sample>
      <LtvModule
        rows={cohorts.map((c) => withMetrics(c))}
        summary={ltvSummary(cohorts)}
        cohorts={cohorts}
        eshop={eshop}
        projectId={project.id}
      />
    </ModulePage>
  );
}
