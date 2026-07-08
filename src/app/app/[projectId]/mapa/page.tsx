/** Mapa & pozice / Map & rankings — local map pack + keyword ranking ladder for a
 *  local-SEO project. Grounds the pack + ladder on the project's localities ×
 *  service catalog (the same spine the Lokální and Pobočky modules read). */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import MapPackModule from "@/components/app/modules/MapPackModule";
import { keywordLadder, packsForProject } from "@/lib/mappack/sample";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";
import { resolveLocalLadder } from "@/lib/local-signals/resolve";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "mapa");
  const services = await loadServicesFor(project);
  const localities = localitiesFor(project);
  const packs = packsForProject(project, localities, project.name);
  // A2 seam: the keyword-rank ladder runs on imported/synced ranks when present,
  // else the sample ladder. The competitor map-pack stays sample (no clean API).
  const ladder = await resolveLocalLadder(project.id, keywordLadder(project, localities, services));
  return (
    <ModulePage moduleKey="mapa">
      <MapPackModule
        packs={packs}
        ladder={ladder.ladder}
        projectId={project.id}
        ladderLive={ladder.live}
        ladderSource={ladder.source}
        ladderSyncedAt={ladder.syncedAt}
        ladderSourceUrl={ladder.sourceUrl}
      />
    </ModulePage>
  );
}
