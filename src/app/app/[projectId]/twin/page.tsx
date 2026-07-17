/** Twin — train the project's communication double: a voice per channel, distilled
 *  from real messages. Where it may speak lives in `sprava-kanalu`; what it writes
 *  lives in `schranka`. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import TwinModule from "@/components/app/modules/TwinModule";
import { loadProjectCatalog } from "@/lib/catalog/load";
import { resolveTwin } from "@/lib/twin/resolve";
import { getProjectDataset } from "@/lib/project-data/dataset";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "twin");

  // Dataset-derived "now" for parity with the other catalog consumers (katalog /
  // mesicni-report), so seed composition isn't on a non-deterministic Date.now().
  const lastDate = getProjectDataset(project).daily.at(-1)?.date;
  const now = lastDate ? new Date(`${lastDate}T00:00:00Z`) : new Date();

  const [resolved, offerings] = await Promise.all([
    resolveTwin(project.id, project.type),
    // The `grounding` readiness gate: does the catalog know what this business sells?
    // Catch to a NULL sentinel (= "couldn't check"), never `[]` — an empty array would
    // read as "catalog is empty / unconfigured" and steer the user to redo setup they
    // already completed on a merely-flaky read.
    loadProjectCatalog(project, now).catch(() => null),
  ]);

  return (
    <ModulePage moduleKey="twin">
      <TwinModule
        state={resolved.state}
        source={resolved.source}
        projectType={project.type}
        offerings={offerings === null ? null : offerings.length}
      />
    </ModulePage>
  );
}
