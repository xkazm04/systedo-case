/** Locations roster folded into the project overview. Renders nothing unless the
 *  project is a local-SEO one; for those it grounds the roster on the project's
 *  localities × service catalog (the same spine the Lokální module reads) and
 *  shows the former standalone "Pobočky" module inline — the Google-profile
 *  health, reviews, map rank, tasks and budget table + focus panel. Server
 *  component. */
import LocationsModule from "@/components/app/modules/LocationsModule";
import { locationsFromCatalog } from "@/lib/locations/sample";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";
import type { Project } from "@/lib/projects/types";

export default async function LocationsOverviewSection({
  project,
  heading,
}: {
  project: Project;
  heading: string;
}) {
  if (project.type !== "local") return null;
  const rows = locationsFromCatalog(project, localitiesFor(project), await loadServicesFor(project));

  return (
    <section className="mt-8">
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">{heading}</h3>
      <div className="mt-3">
        <LocationsModule rows={rows} projectId={project.id} />
      </div>
    </section>
  );
}
