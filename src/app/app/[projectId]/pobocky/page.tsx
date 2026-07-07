/** Pobočky / Locations — location-management roster for a local-SEO project.
 *  Grounds the roster on the project's localities × service catalog (the same
 *  spine the Lokální module reads), then seeds per-location operational metrics. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LocationsModule from "@/components/app/modules/LocationsModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { locationsFromCatalog } from "@/lib/locations/sample";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "pobocky");
  const services = await loadServicesFor(project);
  const rows = locationsFromCatalog(project, localitiesFor(project), services);
  return (
    <ModulePage moduleKey="pobocky">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <LocationsModule rows={rows} projectId={projectId} />
    </ModulePage>
  );
}
