/** Aktivita / Activity — a project-wide timeline of module + AI actions. Reads the
 *  tenant's live activity feed (written best-effort at each mutation/sync/alert
 *  seam); falls back to a seeded cross-module sample when the feed is empty
 *  (local/dev, or a fresh project). Account-level, every project type. */
import { requireProjectModule } from "@/lib/projects/guard";
import { currentUserId } from "@/lib/session";
import ModulePage from "@/components/app/ModulePage";
import ActivityModule from "@/components/app/modules/ActivityModule";
import DataUnavailableNote from "@/components/app/DataUnavailableNote";
import { activityForProject } from "@/lib/activity/sample";
import { liveActivityForProject } from "@/lib/activity/live";
import { localitiesFor } from "@/lib/catalog/resolve";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "aktivita");

  const userId = await currentUserId();
  const { events: live, ok } = await liveActivityForProject(userId, project.id);
  // Read FAILED (outage) — show an honest unavailable state rather than seeded
  // events that would masquerade as the tenant's real timeline.
  if (!ok) {
    return (
      <ModulePage moduleKey="aktivita">
        <DataUnavailableNote />
      </ModulePage>
    );
  }
  const isLive = live.length > 0;
  const events = isLive ? live : activityForProject(project, localitiesFor(project));

  return (
    <ModulePage moduleKey="aktivita" sample={!isLive}>
      <ActivityModule events={events} isLive={isLive} />
    </ModulePage>
  );
}
