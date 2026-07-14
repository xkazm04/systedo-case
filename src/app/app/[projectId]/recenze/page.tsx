/** Recenze / Review Inbox — reputation management for a local-SEO project:
 *  search/filter/sort across the project's reviews, sentiment summary, per-review
 *  AI reply (reusing the local-review-reply operation), flag + saved-reply macros. */
import { requireProjectModule } from "@/lib/projects/guard";
import { currentUserId } from "@/lib/session";
import ModulePage from "@/components/app/ModulePage";
import ReviewInbox, { type ReviewInboxState } from "@/components/app/modules/ReviewInbox";
import LocalSourcePanel from "@/components/app/modules/LocalSourcePanel";
import { reviewsForProject } from "@/lib/reviews/sample";
import { resolveReviews } from "@/lib/local-signals/resolve";
import { getProjectState } from "@/lib/project-state/store";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "recenze");
  const localities = localitiesFor(project);
  const services = await loadServicesFor(project);
  // Live-over-sample: imported reviews when a live section exists, else the seed.
  const resolved = await resolveReviews(project.id, reviewsForProject(project, localities));

  // Persisted triage (answered / flagged / drafts), per project + per user.
  const uid = await currentUserId();
  const initialState = uid ? await getProjectState<ReviewInboxState>(uid, projectId, "reviews") : null;

  return (
    <ModulePage moduleKey="recenze" sample={!resolved.live}>
      <div className="mb-5">
        <LocalSourcePanel
          projectId={project.id}
          kind="reviews"
          live={resolved.live}
          source={resolved.source}
          syncedAt={resolved.syncedAt}
          sourceUrl={resolved.sourceUrl}
        />
      </div>
      <ReviewInbox
        reviews={resolved.reviews}
        areas={localities.map((l) => l.name)}
        businessName={project.name}
        businessType={services[0]?.category}
        projectId={projectId}
        initialState={initialState ?? undefined}
      />
    </ModulePage>
  );
}
