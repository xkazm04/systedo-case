/** Schránka zpráv — the single review surface for everything the twin writes.
 *  `leads` is the absorbed Rychlá reakce inbox — the project's real CRM queue when
 *  it has contacts, else the sample drill; the Socials inbox hands its replies in
 *  here via `replySeedKey`. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import TwinInboxModule from "@/components/app/modules/TwinInboxModule";
import { resolveInboxLeads } from "@/lib/speed-lead/resolve-inbox";
import { loadServicesFor } from "@/lib/catalog/load";
import { resolveTwin } from "@/lib/twin/resolve";
import { isTwinChannel } from "@/lib/twin/types";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ channel?: string | string[] }>;
}) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "schranka");

  // Kanály's "check the inbox" CTA names a specific twin channel's pending count
  // (`?channel=<twin scope>`) — honor it by opening the picker there. Validated
  // against the real channel vocabulary; anything else is ignored.
  const rawChannel = (await searchParams).channel;
  const fromChannel = Array.isArray(rawChannel) ? rawChannel[0] : rawChannel;
  const initialChannel = isTwinChannel(fromChannel) ? fromChannel : undefined;

  const [resolved, services, inbox] = await Promise.all([
    resolveTwin(project.id, project.type),
    // Real catalog service names, so the reply's project-type hint comes from what
    // the business actually offers — not a hardcoded guess.
    loadServicesFor(project),
    // The CRM's urgent queue when the project has contacts, else the per-type sample.
    resolveInboxLeads(project),
  ]);

  return (
    // The gutter note discloses the LEADS' provenance: up while the inbox is the
    // sample drill, gone once it serves the CRM queue. It must NOT key off the twin's
    // `source`: training the twin (or merely toggling a channel, which also flips
    // `source`) does not make these enquiries real.
    <ModulePage moduleKey="schranka" sample={!inbox.live}>
      <TwinInboxModule
        state={resolved.state}
        source={resolved.source}
        {...(initialChannel ? { initialChannel } : {})}
        projectType={project.type}
        leads={inbox.leads}
        liveLeads={inbox.live}
        serviceHints={[...new Set(services.map((s) => s.name).filter(Boolean))].slice(0, 12)}
      />
    </ModulePage>
  );
}
