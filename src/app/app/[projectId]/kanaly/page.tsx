/** Kanály zdarma — the communication signpost. A project's ranked plan of
 *  zero-ad-spend visibility channels, each tracked through a lifecycle (who
 *  speaks there — the operator or the twin — and what the next step is). The
 *  page resolves the twin modules' state into a SignpostContext so the client
 *  derives readiness from reality, not from stored flags. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import OrganicChannels from "@/components/app/modules/OrganicChannels";
import { channelPlanForProject } from "@/lib/organic-channels/sample";
import { resolveOrganicChannels } from "@/lib/organic-channels/resolve";
import { planProvenance } from "@/lib/organic-channels/types";
import { buildKanalyGrounding, kanalyGroundingInput } from "@/lib/organic-channels/grounding";
import { buildSignpostContext, type SignpostContext } from "@/lib/organic-channels/next-step";
import { resolveVisibilityPlan } from "@/lib/organic-channels/visibility-plan-resolve";
import { loadProjectCatalog } from "@/lib/catalog/load";
import { localitiesFor } from "@/lib/catalog/resolve";
import { getCompetitors } from "@/lib/competitors/store";
import { getOnboarding } from "@/lib/onboarding/store";
import { resolveTwin } from "@/lib/twin/resolve";
import { getTwin } from "@/lib/twin/store";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, userId } = await requireProjectModule(projectId, "kanaly");

  // Ground the plan in the project's real business: its offering categories, the
  // localities it serves, and any named competitors — the same catalog/competitor
  // spine the other smart modules read — TOPPED UP from the applied website-scan
  // profile so a URL-first tenant with an empty catalog is not reduced to a
  // type+brand-only prompt. Precedence (catalog wins, profile fills gaps) and the
  // deliberate exclusion of the scan's unconfirmed competitors live in
  // buildKanalyGrounding, which is pure and unit-tested.
  // A failed competitors read is NOT "the tenant has no competitors": it silently
  // un-grounds regeneration, so the failure survives to the UI (degraded grounding).
  // A failed onboarding read simply means "no profile" — it can only ever cost a
  // gap-fill, never un-ground anything the catalog already said.
  const [catalog, competitorRead, onboarding] = await Promise.all([
    loadProjectCatalog(project),
    getCompetitors(project.id).then(
      (set) => ({ failed: false, set }),
      () => ({ failed: true, set: null })
    ),
    getOnboarding(project.id).catch(() => null),
  ]);
  // Curated-competitors-only and "unavailable ≠ none" both live in
  // kanalyGroundingInput, which is pure, unit-tested, and shared with
  // visibility-plan-resolve so the two pages cannot ground the same project
  // differently.
  const { grounding, sample: sampleContext } = buildKanalyGrounding(
    kanalyGroundingInput({
      catalog,
      localities: localitiesFor(project),
      competitorRead: { failed: competitorRead.failed, competitors: competitorRead.set?.competitors },
      profile: onboarding?.scan ?? null,
    })
  );

  const sample = channelPlanForProject(project, sampleContext);
  const [resolved, twin, savedTwin] = await Promise.all([
    resolveOrganicChannels(project.id, sample),
    resolveTwin(project.id, project.type),
    // The RAW saved twin, read alongside resolveTwin's own read: the resolved
    // state cannot say whether its channel list is the tenant's or the seed's
    // (resolveTwin keeps seeded channels whenever saved.channels is empty), and
    // the enabled-channel gate must not count seed defaults nobody chose. One
    // extra keyed read buys that honesty; a hiccup degrades to "nothing chosen".
    getTwin(project.id).catch(() => null),
  ]);

  // Snapshot of the twin modules' REAL state — the signpost derives each
  // channel's readiness (voice trained? channel enabled? drafts waiting?) from
  // this instead of persisting flags that could drift out of sync. "Trained"
  // and "enabled" are the honest predicates (tenant-trained voice via
  // voiceTrainedAt, tenant-chosen channels) — see buildSignpostContext.
  const signpost: SignpostContext = buildSignpostContext(twin, savedTwin);

  // Every seeded number wears its label: a real tenant on the seeded fallback
  // plan gets the same sample gutter as every other seeded module (the demo
  // shell wraps this module in its own gutter — this page is not the demo);
  // a pinned AI plan instead discloses when it was generated.
  const provenance = planProvenance(resolved);

  // The one visibility plan — the SAME artifact Klíčová slova renders, composed
  // from the channel leg this page already resolved (so the reads are not doubled)
  // plus the tenant's saved queries and content. Null when the project type does
  // not have all three modules.
  const visibilityPlan = await resolveVisibilityPlan(project, userId, { resolved });

  return (
    <ModulePage moduleKey="kanaly" sample={provenance.sample}>
      <OrganicChannels
        channels={resolved.channels}
        tracks={resolved.tracks}
        source={resolved.source}
        degraded={resolved.degraded}
        generatedAt={provenance.generatedAt}
        projectType={project.type}
        grounding={grounding}
        signpost={signpost}
        visibilityPlan={visibilityPlan}
      />
    </ModulePage>
  );
}
