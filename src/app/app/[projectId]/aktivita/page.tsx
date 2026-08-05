/** Aktivita / Activity — a project-wide timeline of module + AI actions. Reads the
 *  tenant's live activity feed (written best-effort at each mutation/sync/alert
 *  seam); falls back to a seeded cross-module sample when the feed is empty
 *  (local/dev, or a fresh project). Account-level, every project type. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ActivityModule from "@/components/app/modules/ActivityModule";
import DataUnavailableNote from "@/components/app/DataUnavailableNote";
import { activityForProject } from "@/lib/activity/sample";
import { liveActivityForProject } from "@/lib/activity/live";
import { localitiesFor } from "@/lib/catalog/resolve";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  // Take userId from the guard, which has already asserted it non-null. Re-reading
  // it with currentUserId() hands `string | null` to resolveTenant, and its null
  // branch resolves to the SHARED "sample" tenant — so a session that lapsed between
  // the guard and this line would render another bucket's feed as this project's
  // timeline instead of redirecting. The guard exists to close exactly that door.
  const { project, userId } = await requireProjectModule(projectId, "aktivita");
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
