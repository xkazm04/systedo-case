/** In-app activity feed for the signed-in user's tenant:
 *   GET → newest activity (applied changes, syncs, alerts, reports)
 *  A read-only audit timeline; entries are written from the mutation, sync and
 *  alert paths. Anonymous users get an empty feed (sample tenant has no history). */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listActivity } from "@/lib/campaigns/activity";


export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ activity: [] });

  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const tenant = await resolveTenant(userId, projectId);
  const activity = await listActivity(tenant);
  return Response.json({ activity });
}
