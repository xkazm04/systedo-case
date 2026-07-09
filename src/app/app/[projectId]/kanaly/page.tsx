/** Kanály zdarma — a project's ranked plan of zero-ad-spend visibility channels
 *  (directories, marketplaces, communities, owned content, PR, partnerships), each
 *  with a fit score, effort and a first-steps playbook. Runs on a seeded per-type
 *  sample grounded in the project's catalog; a user can regenerate a plan tailored
 *  to the business with AI (channel-research) and track each channel's status. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import OrganicChannels, { type ChannelGrounding } from "@/components/app/modules/OrganicChannels";
import { channelPlanForProject } from "@/lib/organic-channels/sample";
import { resolveOrganicChannels } from "@/lib/organic-channels/resolve";
import { loadProjectCatalog } from "@/lib/catalog/load";
import { localitiesFor } from "@/lib/catalog/resolve";
import { getCompetitors } from "@/lib/competitors/store";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "kanaly");

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
  const grounding: ChannelGrounding = {
    ...(offering ? { offering } : {}),
    ...(localities.length ? { localities } : {}),
    ...(competitorSet?.competitors.length
      ? { competitors: competitorSet.competitors.map((c) => c.name) }
      : {}),
    // Seed keywords for the SEO/content channels: the offerings the business sells.
    ...(catalog.length
      ? { keywords: [...new Set(catalog.map((o) => o.name).filter(Boolean))].slice(0, 8) }
      : {}),
  };

  const sample = channelPlanForProject(project, {
    category: categories[0],
    locality: localities[0],
  });
  const resolved = await resolveOrganicChannels(project.id, sample);

  return (
    <ModulePage moduleKey="kanaly">
      <OrganicChannels
        channels={resolved.channels}
        statuses={resolved.statuses}
        source={resolved.source}
        projectType={project.type}
        grounding={grounding}
      />
    </ModulePage>
  );
}
