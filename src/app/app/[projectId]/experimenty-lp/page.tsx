/** LP experimenty — landing-page A/B testing per keyword cluster. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LpExperimentsModule from "@/components/app/modules/LpExperimentsModule";
import { SAMPLE_EXPERIMENTS } from "@/lib/lp-exp/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "experimenty-lp");
  return (
    <ModulePage moduleKey="experimenty-lp">
      <LpExperimentsModule experiments={SAMPLE_EXPERIMENTS} />
    </ModulePage>
  );
}
