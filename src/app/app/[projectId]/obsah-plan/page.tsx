/** Obsah — plán / Content Schedule — a local content planner. Post ideas are
 *  grounded on the service catalog × localities; the scheduling board is a client
 *  surface persisted per project.
 *
 *  The board's statuses are RECONCILED against the real channel on every load: a
 *  slot handed to a connected social account carries that post's id, and its
 *  status is read back from the channel (see lib/content-schedule/compute
 *  reconcileWithChannel) instead of being claimed locally. A board that never
 *  touched a channel is untouched by this — except for legacy "published" slots
 *  written by the old local-flip button, which are downgraded to "marked done". */
import { requireProjectModule } from "@/lib/projects/guard";
import { currentUserId } from "@/lib/session";
import ModulePage from "@/components/app/ModulePage";
import ContentSchedule from "@/components/app/modules/ContentSchedule";
import { initialPosts, type ContentPost } from "@/lib/content-schedule/sample";
import { reconcileWithChannel } from "@/lib/content-schedule/compute";
import { getProjectState } from "@/lib/project-state/store";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";
import { listAccounts } from "@/lib/social/connection";
import { listPosts } from "@/lib/social/store";
import { resolveTenant } from "@/lib/campaigns/connector";
import type { SocialPlatform } from "@/lib/social/types";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "obsah-plan");
  const services = await loadServicesFor(project);

  // Persisted board (per project), else the catalog-grounded seed.
  const uid = await currentUserId();
  const stored = uid ? await getProjectState<ContentPost[]>(uid, projectId, "content-schedule") : null;
  // Honor an explicitly-emptied board ([]) as saved state; only a never-saved project
  // (null) falls back to the seed — matching the catalog load contract. Clearing every
  // post must NOT resurrect the demo seed labeled "sample".
  const isStored = Array.isArray(stored);
  const base = isStored ? stored! : initialPosts(project, services, localitiesFor(project));

  // Which channels the maker actually has, and what those channels did with the
  // slots already handed over. Both reads are best-effort: a store hiccup must
  // degrade to "no channel" (the honest, non-claiming state), never break the page.
  let channels: SocialPlatform[] = [];
  let channelPosts: { id: string; status: string }[] = [];
  if (uid) {
    try {
      channels = (await listAccounts(uid)).map((a) => a.platform);
    } catch {
      channels = [];
    }
    try {
      const tenant = await resolveTenant(uid, projectId, { accountScoped: false });
      channelPosts = (await listPosts(tenant)).map((p) => ({ id: p.id, status: p.status }));
    } catch {
      channelPosts = [];
    }
  }
  const posts = reconcileWithChannel(base, channelPosts);

  return (
    <ModulePage moduleKey="obsah-plan" sample={!isStored}>
      <ContentSchedule posts={posts} projectId={projectId} channels={channels} />
    </ModulePage>
  );
}
