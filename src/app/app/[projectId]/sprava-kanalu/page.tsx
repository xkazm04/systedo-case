/** Správa kanálů — where the twin may speak, how autonomous it is on each channel,
 *  and which connector delivers an approved draft. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import TwinChannelsModule from "@/components/app/modules/TwinChannelsModule";
import { loadProjectCatalog } from "@/lib/catalog/load";
import { resolveTwin } from "@/lib/twin/resolve";
import { connectorInfo } from "@/lib/twin/connectors";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "sprava-kanalu");

  const [resolved, offerings] = await Promise.all([
    resolveTwin(project.id, project.type),
    loadProjectCatalog(project).catch(() => []),
  ]);

  return (
    <ModulePage moduleKey="sprava-kanalu">
      <TwinChannelsModule
        state={resolved.state}
        source={resolved.source}
        projectType={project.type}
        offerings={offerings.length}
        connectors={connectorInfo()}
      />
    </ModulePage>
  );
}
