/** LP experimenty — landing-page A/B testing per keyword cluster. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LpExperimentsModule from "@/components/app/modules/LpExperimentsModule";
import { experimentsForProject } from "@/lib/lp-exp/sample";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "experimenty-lp");
  return (
    <ModulePage moduleKey="experimenty-lp" sample>
      <LpExperimentsModule experiments={experimentsForProject(project)} />
    </ModulePage>
  );
}
