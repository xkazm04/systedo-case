/** Twin — train the project's communication double: a voice per channel, distilled
 *  from real messages. Where it may speak lives in `sprava-kanalu`; what it writes
 *  lives in `schranka`. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import TwinModule from "@/components/app/modules/TwinModule";
import { loadProjectCatalog } from "@/lib/catalog/load";
import { resolveTwin } from "@/lib/twin/resolve";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "twin");

  const [resolved, offerings] = await Promise.all([
    resolveTwin(project.id, project.type),
    // The `grounding` readiness gate: does the catalog know what this business sells?
    loadProjectCatalog(project).catch(() => []),
  ]);

  return (
    <ModulePage moduleKey="twin">
      <TwinModule
        state={resolved.state}
        source={resolved.source}
        projectType={project.type}
        offerings={offerings.length}
      />
    </ModulePage>
  );
}
