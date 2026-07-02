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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "lokalni");
  return (
    <ModulePage moduleKey="lokalni">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <LocalModule
        targets={targetsForProject(project)}
        reviews={reviewsForProject(project)}
        recentReviews={SAMPLE_RECENT_REVIEWS}
        businessName={project.name}
      />
    </ModulePage>
  );
}
