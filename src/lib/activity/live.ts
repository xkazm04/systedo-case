/** Live per-project activity, read from the tenant's activity feed (written
 *  best-effort at each mutation/sync/alert seam). Server-only so the current-time
 *  read + Firestore access stay out of render. `ok` is false only when the feed
 *  read FAILED (an outage) — distinct from an empty feed (`ok: true`, events: []),
 *  which is a fresh project → the page falls back to the seed. */
import "server-only";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listActivity } from "@/lib/campaigns/activity";
import { recordToEvent } from "./compute";
import type { ActivityEvent } from "./sample";

export async function liveActivityForProject(
  userId: string | null,
  projectId: string
): Promise<{ events: ActivityEvent[]; ok: boolean }> {
  // Read activity under the account-agnostic key it is written to (see activity/emit).
  const tenant = await resolveTenant(userId, projectId, { accountScoped: false });
  const { records, ok } = await listActivity(tenant, 50);
  const nowMs = Date.now();
  return { events: records.map((r) => recordToEvent(r, nowMs)), ok };
}
