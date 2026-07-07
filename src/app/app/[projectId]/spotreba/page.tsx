/** Spotřeba / Usage — LLM spend by operation and model over a period. Reads the
 *  live llmTelemetry rollup for this project (recorded at recordLlmCall, attributed
 *  via the request context); falls back to seeded data when there is no telemetry
 *  yet (e.g. local/dev, where Firestore isn't written). Account-level. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import SpendModule from "@/components/app/modules/SpendModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { spendForProject } from "@/lib/spend/sample";
import { liveSpendForProject } from "@/lib/spend/live";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "spotreba");

  const live = await liveSpendForProject(project.id);
  const isLive = live.length > 0;
  const entries = isLive ? live : spendForProject(project);

  return (
    <ModulePage moduleKey="spotreba">
      {!isLive && (
        <div className="mb-5">
          <SampleDataNote />
        </div>
      )}
      <SpendModule entries={entries} isLive={isLive} />
    </ModulePage>
  );
}
