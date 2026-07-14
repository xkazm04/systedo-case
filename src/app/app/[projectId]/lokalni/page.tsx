/** Lokální dominance — service×area coverage gaps + reputation. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LocalModule from "@/components/app/modules/LocalModule";
import type { RecentReview } from "@/lib/local/sample";
import {
  SAMPLE_RECENT_REVIEWS,
  reviewsForProject,
  targetsForProject,
} from "@/lib/local/sample";
import { targetsFromCatalog } from "@/lib/local/catalog";
import { resolveReviews } from "@/lib/local-signals/resolve";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "lokalni");
  // Coverage matrix rows come from the catalog: each service offering × its
  // localities. Fall back to the sample targets if the catalog has no services.
  const services = await loadServicesFor(project);
  const targets =
    services.length > 0 ? targetsFromCatalog(services, localitiesFor(project)) : targetsForProject(project);
  // The reputation panel's recent reviews go live-over-sample: imported reviews
  // (newest first, top 8) when a live section exists, else the seeded samples.
  const resolvedReviews = await resolveReviews(project.id, []);
  const recentReviews: RecentReview[] = resolvedReviews.live
    ? resolvedReviews.reviews
        .slice(0, 8)
        .map((r) => ({ id: r.id, area: r.area, author: r.author, rating: r.rating, text: r.text }))
    : SAMPLE_RECENT_REVIEWS;
  // Derive what the business does from its catalogue (distinct service categories),
  // so the AI review replies match THIS business instead of a hardcoded industry
  // (BM-L1-07). Falls back to a generic label when the catalogue is empty.
  const businessType =
    [...new Set(services.map((s) => s.category).filter(Boolean))]
      .slice(0, 2)
      .join(" a ")
      .toLowerCase() || undefined;
  return (
    <ModulePage moduleKey="lokalni" sample>
      <LocalModule
        targets={targets}
        reviews={reviewsForProject(project)}
        recentReviews={recentReviews}
        businessName={project.name}
        businessType={businessType}
        projectId={projectId}
      />
    </ModulePage>
  );
}
