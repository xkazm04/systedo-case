/** Mapa & pozice / Map & rankings — local map pack + keyword ranking ladder for a
 *  local-SEO project. Grounds the pack + ladder on the project's localities ×
 *  service catalog (the same spine the Lokální and Pobočky modules read). */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import MapPackModule from "@/components/app/modules/MapPackModule";
import { keywordLadder, packsForProject } from "@/lib/mappack/sample";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";
import { resolveLocalLadder, resolvePacks } from "@/lib/local-signals/resolve";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "mapa");
  const services = await loadServicesFor(project);
  const localities = localitiesFor(project);
  // A2/E1 seam: BOTH halves of this page run live-over-sample now — the keyword-rank
  // ladder on imported ranks, and the competitor pack on an imported pack (still
  // import-only; there is no clean SERP API). Each falls back to its seeded sample and
  // carries its own source badge. One local-signals read backs both (resolve.ts).
  const [ladder, packs] = await Promise.all([
    resolveLocalLadder(project.id, keywordLadder(project, localities, services)),
    resolvePacks(project.id, packsForProject(project, localities, project.name), project.name),
  ]);
  // The gutter "illustrative sample" note now belongs to whatever is still seeded: it
  // only disappears once BOTH the pack and the ladder are live.
  return (
    <ModulePage moduleKey="mapa" sample={!packs.live || !ladder.live}>
      <MapPackModule
        packs={packs.packs}
        ladder={ladder.ladder}
        projectId={project.id}
        packLive={packs.live}
        packSource={packs.source}
        packSyncedAt={packs.syncedAt}
        packSourceUrl={packs.sourceUrl}
        ladderLive={ladder.live}
        ladderSource={ladder.source}
        ladderSyncedAt={ladder.syncedAt}
        ladderSourceUrl={ladder.sourceUrl}
      />
    </ModulePage>
  );
}
