/** Server seam for the one visibility plan: the reads the pure composer
 *  (./visibility-plan) refuses to do. Two pages render the same plan — Kanály
 *  zdarma (which has already resolved the channel leg for its own table) and
 *  Klíčová slova (which has resolved nothing) — so the channel leg is an OPTIONAL
 *  argument: pass what you already resolved and this adds only the two missing
 *  reads; pass nothing and it resolves the channel leg exactly the way the kanaly
 *  page does, through the same grounding builder, so the two pages cannot show
 *  different plans for the same project.
 *
 *  EVERY READ IS BEST-EFFORT AND HONESTLY EMPTY. A keyword-store or library hiccup
 *  yields an empty leg, which the plan reports as `counts.queries === 0` and the
 *  card renders as "you have nothing here yet" — the same thing a genuinely empty
 *  project sees. That is a deliberate trade: this artifact is a summary that sits
 *  ABOVE a module's own content, and failing the whole page because a secondary
 *  read blinked would cost the tenant the module they came for. The channel leg,
 *  which IS the spine, keeps resolveOrganicChannels' own `degraded` semantics.
 *
 *  Server-only. */
import "server-only";
import { resolveTenant } from "@/lib/campaigns/connector";
import { loadProjectCatalog } from "@/lib/catalog/load";
import { localitiesFor } from "@/lib/catalog/resolve";
import { libraryEntries } from "@/lib/content-library/entries";
import { getContentLibrary } from "@/lib/content-library/store";
import { listKeywordLists } from "@/lib/keywords/store";
import { getOnboarding } from "@/lib/onboarding/store";
import type { Project } from "@/lib/projects/types";
import { buildKanalyGrounding } from "./grounding";
import { resolveOrganicChannels, type ResolvedChannels } from "./resolve";
import { channelPlanForProject } from "./sample";
import {
  buildVisibilityPlan,
  contentFromLibrary,
  hasVisibilityPlan,
  queriesFromKeywordLists,
  type VisibilityPlan,
} from "./visibility-plan";

/** The channel leg, resolved the way /kanaly resolves it minus the competitor read
 *  (competitors ground the AI REGENERATION prompt, not the seeded plan's fill — so
 *  omitting them cannot change which channels or which text this plan shows). */
async function resolveChannelLeg(project: Project): Promise<ResolvedChannels> {
  const [catalog, onboarding] = await Promise.all([
    loadProjectCatalog(project),
    getOnboarding(project.id).catch(() => null),
  ]);
  const { sample: sampleContext } = buildKanalyGrounding({
    categories: [...new Set(catalog.map((o) => o.category).filter(Boolean))],
    offeringNames: catalog.map((o) => o.name),
    localities: localitiesFor(project).map((l) => l.name),
    competitors: [],
    competitorsUnavailable: false,
    profile: onboarding?.scan ?? null,
  });
  return resolveOrganicChannels(project.id, channelPlanForProject(project, sampleContext));
}

/** The project's one visibility plan, or null when its type does not have all
 *  three modules (the registry gate — see hasVisibilityPlan). */
export async function resolveVisibilityPlan(
  project: Project,
  userId: string,
  opts: { resolved?: ResolvedChannels; limit?: number } = {}
): Promise<VisibilityPlan | null> {
  if (!hasVisibilityPlan(project.type)) return null;

  const [resolved, lists, library] = await Promise.all([
    opts.resolved ? Promise.resolve(opts.resolved) : resolveChannelLeg(project),
    resolveTenant(userId, project.id)
      .then(listKeywordLists)
      .catch(() => []),
    getContentLibrary(userId, project.id).catch(() => null),
  ]);

  return buildVisibilityPlan({
    channels: resolved.channels,
    tracks: resolved.tracks,
    channelSource: resolved.source,
    queries: queriesFromKeywordLists(lists),
    content: contentFromLibrary(libraryEntries(library)),
    ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
  });
}
