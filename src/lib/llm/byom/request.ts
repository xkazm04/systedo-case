/** Route-side BYOM helper: resolve the BYOM key for one operation (matrix
 *  override or global active vendor), gated on the caller's entitlement, and enter
 *  it into the request's AsyncLocalStorage context so generateStructured picks it
 *  up. Returns the resolved key (null when not BYOM-served) so the route can skip
 *  its per-user quota. One call at the top of each route that runs an LLM tool.
 *  Server-only. */
import "server-only";
import { byomUnlocked } from "@/lib/usage";
import type { Plan } from "@/lib/plans";
import { enterByomContext } from "../byom-context";
import { resolveByomForOperation } from "../keys/store";
import type { ResolvedByomKey } from "../keys/types";

export async function enterByomForOperation(
  userId: string | null,
  plan: Plan,
  toolId: string
): Promise<ResolvedByomKey | null> {
  if (!userId || !byomUnlocked(plan)) {
    enterByomContext(undefined);
    return null;
  }
  const key = await resolveByomForOperation(userId, toolId);
  // Stamp WHO this key was resolved for. It is the only place that knows both the
  // user and the operation, and it makes the key self-describing enough for the
  // dispatch path to attribute a failure back to the right key + operation without
  // threading a second context through the wrapper (see keys/health.ts). Server-only
  // — `ResolvedByomKey` already carries the plaintext apiKey and is never serialized.
  const owned = key ? { ...key, owner: { userId, toolId } } : null;
  enterByomContext(owned ?? undefined);
  return owned;
}
