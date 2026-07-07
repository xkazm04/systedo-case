/** Mapa & pozice / Map & rankings — local map pack + keyword ranking ladder for a
 *  local-SEO project. Grounds the pack + ladder on the project's localities ×
 *  service catalog (the same spine the Lokální and Pobočky modules read). */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import MapPackModule from "@/components/app/modules/MapPackModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { keywordLadder, packsForProject } from "@/lib/mappack/sample";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "mapa");
  const services = await loadServicesFor(project);
  const localities = localitiesFor(project);
  const packs = packsForProject(project, localities, project.name);
  const ladder = keywordLadder(project, localities, services);
  return (
    <ModulePage moduleKey="mapa">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <MapPackModule packs={packs} ladder={ladder} />
    </ModulePage>
  );
}
