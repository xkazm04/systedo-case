/** Leady — the lead entity module over `lib/leads` (docs/leads/design.md).
 *
 *  Live-over-sample at the ONE seam the data layer defines (`resolveContacts`):
 *  the project's own contacts when it has any, else the seeded illustrative set —
 *  and the shell's honesty note shows exactly when the set is the sample. No LLM
 *  call anywhere in this module: lead PII must not reach `generateStructured`,
 *  which mirrors traffic to LightTrack (design.md §7). */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import LeadsModule from "@/components/app/modules/leads/LeadsModule";
import { resolveContacts } from "@/lib/leads/resolve";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "leady");
  const resolved = await resolveContacts(project);

  return (
    <ModulePage moduleKey="leady" sample={!resolved.live}>
      <LeadsModule
        projectId={project.id}
        initial={{ contacts: resolved.contacts, live: resolved.live, total: resolved.total }}
      />
    </ModulePage>
  );
}
