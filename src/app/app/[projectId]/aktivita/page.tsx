/** Aktivita / Activity — a project-wide timeline of module + AI actions. Seeded
 *  on the same shape as the campaigns activity feed; account-level, so available
 *  for every project type. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ActivityModule from "@/components/app/modules/ActivityModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { activityForProject } from "@/lib/activity/sample";
import { localitiesFor } from "@/lib/catalog/resolve";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "aktivita");
  const events = activityForProject(project, localitiesFor(project));
  return (
    <ModulePage moduleKey="aktivita">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <ActivityModule events={events} />
    </ModulePage>
  );
}
