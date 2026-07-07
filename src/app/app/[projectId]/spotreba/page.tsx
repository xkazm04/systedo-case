/** Spotřeba / Usage — LLM spend by operation and model over a period. Seeded on
 *  the real telemetry/cost shape; account-level, available for every project
 *  type. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import SpendModule from "@/components/app/modules/SpendModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { spendForProject } from "@/lib/spend/sample";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "spotreba");
  const entries = spendForProject(project);
  return (
    <ModulePage moduleKey="spotreba">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <SpendModule entries={entries} />
    </ModulePage>
  );
}
