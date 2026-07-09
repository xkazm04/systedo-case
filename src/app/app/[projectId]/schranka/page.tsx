/** Schránka zpráv — the single review surface for everything the twin writes.
 *  `leads` is the absorbed Rychlá reakce inbox; the Socials inbox hands its replies
 *  in here via `replySeedKey`. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import TwinInboxModule from "@/components/app/modules/TwinInboxModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { SAMPLE_LEADS, LOCAL_SAMPLE_LEADS } from "@/lib/speed-lead/sample";
import { loadServicesFor } from "@/lib/catalog/load";
import { resolveTwin } from "@/lib/twin/resolve";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "schranka");

  // D2: a `local` provider sees booking-style enquiries, not B2B service leads.
  const leads = project.type === "local" ? LOCAL_SAMPLE_LEADS : SAMPLE_LEADS;

  const [resolved, services] = await Promise.all([
    resolveTwin(project.id, project.type),
    // Real catalog service names, so the reply's project-type hint comes from what
    // the business actually offers — not a hardcoded guess.
    loadServicesFor(project),
  ]);

  return (
    <ModulePage moduleKey="schranka">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <TwinInboxModule
        state={resolved.state}
        source={resolved.source}
        projectType={project.type}
        leads={leads}
        serviceHints={[...new Set(services.map((s) => s.name).filter(Boolean))].slice(0, 12)}
      />
    </ModulePage>
  );
}
