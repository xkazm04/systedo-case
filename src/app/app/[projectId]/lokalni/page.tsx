/** Lokální dominance — service×area coverage gaps + reputation. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LocalModule from "@/components/app/modules/LocalModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import {
  SAMPLE_RECENT_REVIEWS,
  reviewsForProject,
  targetsForProject,
} from "@/lib/local/sample";
import { targetsFromCatalog } from "@/lib/local/catalog";
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
  return (
    <ModulePage moduleKey="lokalni">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <LocalModule
        targets={targets}
        reviews={reviewsForProject(project)}
        recentReviews={SAMPLE_RECENT_REVIEWS}
        businessName={project.name}
      />
    </ModulePage>
  );
}
