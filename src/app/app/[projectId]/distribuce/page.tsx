/** Distribuce — one article → channel variants + attribution. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import DistributionModule from "@/components/app/modules/DistributionModule";
import { attributionForProject, SAMPLE_SOURCE } from "@/lib/distribution/sample";
import { getVariants } from "@/lib/distribution/variants-store";
import { storedSources } from "@/lib/distribution/variants";
import { attributionIsLive, pageSampleGutter } from "@/lib/distribution/provenance";
import { isDemoProjectId } from "@/lib/projects/demo";
import { getOrganicOutcomes } from "@/lib/organic-channels/outcomes-state";
import type { ChannelOutcome } from "@/lib/organic-channels/outcomes";

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

/** The MEASURED per-channel outcomes of the tenant's own `/go` links, or none.
 *  Best-effort: a blob that has never been rolled up, or a read that blinks, means
 *  "nothing measured" — which is exactly what the panels showed before this ledger
 *  existed, so a hiccup costs a disclosure chip, never the module. */
async function measuredOutcomes(userId: string, projectId: string): Promise<ChannelOutcome[]> {
  if (isDemoProjectId(projectId)) return [];
  try {
    return (await getOrganicOutcomes(userId, projectId))?.channels ?? [];
  } catch {
    return [];
  }
}

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, userId } = await requireProjectModule(projectId, "distribuce");
  const [own, outcomes] = await Promise.all([
    hasOwnArticles(userId, project.id),
    measuredOutcomes(userId, project.id),
  ]);
  // The gutter is a BLANKET claim over the whole page, so it is only made while
  // every panel is illustrative. Once the user distributes their own article it
  // disappears — and the two panels that stay fixture (attribution + the insights
  // rolled up from it) disclose themselves individually inside the module. One
  // module derives both halves: lib/distribution/provenance.
  return (
    <ModulePage
      moduleKey="distribuce"
      sample={pageSampleGutter(own, attributionIsLive(outcomes))}
    >
      <DistributionModule
        source={SAMPLE_SOURCE}
        attribution={attributionForProject(project)}
        outcomes={outcomes}
      />
    </ModulePage>
  );
}
