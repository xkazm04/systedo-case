/** In-app activity feed for the signed-in user's tenant:
 *   GET → newest activity (applied changes, syncs, alerts, reports)
 *  A read-only audit timeline; entries are written from the mutation, sync and
 *  alert paths. Anonymous users get an empty feed (sample tenant has no history). */
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listActivity } from "@/lib/campaigns/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
  if (!userId) return Response.json({ activity: [] });

  const tenant = await resolveTenant(userId);
  const activity = await listActivity(tenant);
  return Response.json({ activity });
}
