/** Locations roster folded into the project overview. Renders nothing unless the
 *  project is a local-SEO one; for those it grounds the roster on the project's
 *  localities × service catalog (the same spine the Lokální module reads) and
 *  shows the former standalone "Pobočky" module inline — the Google-profile
 *  health, reviews, map rank, tasks and budget table + focus panel. Server
 *  component. */
import LocationsModule from "@/components/app/modules/LocationsModule";
import LocalSourcePanel from "@/components/app/modules/LocalSourcePanel";
import { locationsFromCatalog } from "@/lib/locations/sample";
import { resolveLocations } from "@/lib/local-signals/resolve";
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
  const seeded = locationsFromCatalog(project, localitiesFor(project), await loadServicesFor(project));
  // GBP status / reviews / unanswered go live-over-sample when a Business Profile
  // export has been imported; the roster's attention math then runs on real inputs.
  const resolved = await resolveLocations(project.id, seeded);

  return (
    <section className="mt-8">
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">{heading}</h3>
      <div className="mt-3">
        <LocalSourcePanel
          projectId={project.id}
          kind="gbp"
          live={resolved.live}
          source={resolved.source}
          syncedAt={resolved.syncedAt}
          sourceUrl={resolved.sourceUrl}
        />
      </div>
      <div className="mt-4">
        <LocationsModule rows={resolved.rows} projectId={project.id} live={resolved.live} />
      </div>
    </section>
  );
}
