/** Recenze / Review Inbox — reputation management for a local-SEO project:
 *  search/filter/sort across the project's reviews, sentiment summary, per-review
 *  AI reply (reusing the local-review-reply operation), flag + saved-reply macros. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ReviewInbox from "@/components/app/modules/ReviewInbox";
import SampleDataNote from "@/components/app/SampleDataNote";
import { reviewsForProject } from "@/lib/reviews/sample";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "recenze");
  const localities = localitiesFor(project);
  const services = await loadServicesFor(project);
  const reviews = reviewsForProject(project, localities);
  return (
    <ModulePage moduleKey="recenze">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <ReviewInbox
        reviews={reviews}
        areas={localities.map((l) => l.name)}
        businessName={project.name}
        businessType={services[0]?.category}
      />
    </ModulePage>
  );
}
