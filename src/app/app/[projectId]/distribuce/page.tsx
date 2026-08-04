/** Distribuce — one article → channel variants + attribution. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import DistributionModule from "@/components/app/modules/DistributionModule";
import { attributionForProject, SAMPLE_SOURCE } from "@/lib/distribution/sample";
import { getVariants } from "@/lib/distribution/variants-store";
import { storedSources } from "@/lib/distribution/variants";
import { isDemoProjectId } from "@/lib/projects/demo";

/** Has the user actually handed one of their OWN articles into Distribuce? The
 *  page-level sample banner must answer that question, not assume the fixture — the
 *  module's in-card origin pill already distinguishes "Váš článek" from "Ukázkový
 *  článek" per article, and the page marker used to contradict it by being pinned to
 *  `sample` forever. Demo projects own nothing and stay sample by construction; a
 *  store hiccup degrades to "sample", which is the safe claim. */
async function hasOwnArticles(userId: string, projectId: string): Promise<boolean> {
  if (isDemoProjectId(projectId)) return false;
  try {
    return storedSources(await getVariants(userId, projectId)).length > 0;
  } catch {
    return false;
  }
}

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, userId } = await requireProjectModule(projectId, "distribuce");
  const own = await hasOwnArticles(userId, project.id);
  return (
    <ModulePage moduleKey="distribuce" sample={!own}>
      <DistributionModule source={SAMPLE_SOURCE} attribution={attributionForProject(project)} />
    </ModulePage>
  );
}
