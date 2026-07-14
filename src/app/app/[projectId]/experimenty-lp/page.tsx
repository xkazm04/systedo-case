/** LP experimenty — landing-page A/B testing per keyword cluster. Resolves the
 *  project's PERSISTED experiments over the seeded sample (live-over-sample); the
 *  evaluate() verdict math is untouched. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LpExperimentsModule from "@/components/app/modules/LpExperimentsModule";
import { experimentsForProject } from "@/lib/lp-exp/sample";
import { resolveExperiments } from "@/lib/lp-exp/resolve";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "experimenty-lp");
  const { experiments, source } = await resolveExperiments(projectId, experimentsForProject(project));
  return (
    <ModulePage moduleKey="experimenty-lp" sample={source === "sample"}>
      <LpExperimentsModule experiments={experiments} source={source} projectId={projectId} />
    </ModulePage>
  );
}
