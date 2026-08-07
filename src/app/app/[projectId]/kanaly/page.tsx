/** Kanály zdarma — the communication signpost. A project's ranked plan of
 *  zero-ad-spend visibility channels, each tracked through a lifecycle (who
 *  speaks there — the operator or the twin — and what the next step is). The
 *  page resolves the twin modules' state into a SignpostContext so the client
 *  derives readiness from reality, not from stored flags. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import OrganicChannels, { type ChannelGrounding } from "@/components/app/modules/OrganicChannels";
import { channelPlanForProject } from "@/lib/organic-channels/sample";
import { resolveOrganicChannels } from "@/lib/organic-channels/resolve";
import type { SignpostContext } from "@/lib/organic-channels/next-step";
import { loadProjectCatalog } from "@/lib/catalog/load";
import { localitiesFor } from "@/lib/catalog/resolve";
import { getCompetitors } from "@/lib/competitors/store";
import { curatedCompetitors } from "@/lib/competitors/types";
import { resolveTwin } from "@/lib/twin/resolve";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "kanaly");

  // Ground the plan in the project's real business: its offering categories, the
  // localities it serves, and any named competitors — the same catalog/competitor
  // spine the other smart modules read.
  const [catalog, competitorSet] = await Promise.all([
    loadProjectCatalog(project),
    getCompetitors(project.id).catch(() => null),
  ]);
  const categories = [...new Set(catalog.map((o) => o.category).filter(Boolean))];
  const localities = localitiesFor(project).map((l) => l.name);
  const offering = categories.slice(0, 4).join(", ");
  // CURATED only: this grounding is handed to the channel-research model as fact, so an
  // unconfirmed website-scan guess must not be asserted as one of the tenant's rivals.
  const competitors = curatedCompetitors(competitorSet?.competitors).map((c) => c.name);
  const grounding: ChannelGrounding = {
    ...(offering ? { offering } : {}),
    ...(localities.length ? { localities } : {}),
    ...(competitors.length ? { competitors } : {}),
    // Seed keywords for the SEO/content channels: the offerings the business sells.
    ...(catalog.length
      ? { keywords: [...new Set(catalog.map((o) => o.name).filter(Boolean))].slice(0, 8) }
      : {}),
  };

  const sample = channelPlanForProject(project, {
    category: categories[0],
    locality: localities[0],
  });
  const [resolved, twin] = await Promise.all([
    resolveOrganicChannels(project.id, sample),
    resolveTwin(project.id, project.type),
  ]);

  // Snapshot of the twin modules' REAL state — the signpost derives each
  // channel's readiness (voice trained? channel enabled? drafts waiting?) from
  // this instead of persisting flags that could drift out of sync.
  const pendingByChannel: Record<string, number> = {};
  for (const d of twin.state.drafts) {
    if (d.status === "pending") pendingByChannel[d.channel] = (pendingByChannel[d.channel] ?? 0) + 1;
  }
  const signpost: SignpostContext = {
    trainedScopes: twin.state.voices.filter((v) => v.directives.trim().length > 0).map((v) => v.scope),
    enabledTwinChannels: twin.state.channels.filter((c) => c.enabled).map((c) => c.channel),
    pendingByChannel,
  };

  return (
    <ModulePage moduleKey="kanaly">
      <OrganicChannels
        channels={resolved.channels}
        tracks={resolved.tracks}
        source={resolved.source}
        degraded={resolved.degraded}
        projectType={project.type}
        grounding={grounding}
        signpost={signpost}
      />
    </ModulePage>
  );
}
