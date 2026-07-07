/** Obsah — plán / Content Schedule — a Google Business Profile post planner for a
 *  local-SEO project. Post ideas are grounded on the service catalog × localities;
 *  the scheduling board is a client surface persisted per project. */
import { requireProjectModule } from "@/lib/projects/guard";
import { currentUserId } from "@/lib/session";
import ModulePage from "@/components/app/ModulePage";
import ContentSchedule from "@/components/app/modules/ContentSchedule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { initialPosts, type ContentPost } from "@/lib/content-schedule/sample";
import { getProjectState } from "@/lib/project-state/store";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "obsah-plan");
  const services = await loadServicesFor(project);

  // Persisted board (per project), else the catalog-grounded seed.
  const uid = await currentUserId();
  const stored = uid ? await getProjectState<ContentPost[]>(uid, projectId, "content-schedule") : null;
  const isStored = Array.isArray(stored) && stored.length > 0;
  const posts = isStored ? stored! : initialPosts(project, services, localitiesFor(project));

  return (
    <ModulePage moduleKey="obsah-plan">
      {!isStored && (
        <div className="mb-5">
          <SampleDataNote />
        </div>
      )}
      <ContentSchedule posts={posts} projectId={projectId} />
    </ModulePage>
  );
}
