/** Obsah — plán / Content Schedule — a Google Business Profile post planner for a
 *  local-SEO project. Post ideas are grounded on the service catalog × localities;
 *  the scheduling board is a client surface persisted per project. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ContentSchedule from "@/components/app/modules/ContentSchedule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { initialPosts } from "@/lib/content-schedule/sample";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "obsah-plan");
  const services = await loadServicesFor(project);
  const posts = initialPosts(project, services, localitiesFor(project));
  return (
    <ModulePage moduleKey="obsah-plan">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <ContentSchedule posts={posts} projectId={projectId} />
    </ModulePage>
  );
}
