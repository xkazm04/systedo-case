/** One helper for recording a project-scoped activity event from a mutation route:
 *  resolves the project's tenant and appends the entry, fully best-effort so a
 *  logging failure never breaks the mutation. Server-only. The project-wide
 *  Activity module reads these back via listActivity(resolveTenant(userId,
 *  projectId)) — so an event is only visible in a project's feed when it's emitted
 *  with that project's id. */
import "server-only";
import { resolveTenant } from "@/lib/campaigns/connector";
import { recordActivity, type ActivityInput } from "@/lib/campaigns/activity";

export async function emitProjectActivity(
  userId: string | null,
  projectId: string | null | undefined,
  entry: ActivityInput
): Promise<void> {
  try {
    const tenant = await resolveTenant(userId, projectId ?? undefined);
    await recordActivity(tenant, entry);
  } catch (err) {
    console.error("[activity] emit failed (non-fatal):", err);
  }
}
