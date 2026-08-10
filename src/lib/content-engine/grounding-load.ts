/** Brief grounding — the store-touching half (server-only).
 *
 *  Resolves the tenant's SAVED keyword lists into the rows the brief prompt reads.
 *  Tenancy is the same boundary the /api/keywords/lists route uses: `resolveTenant`
 *  builds the key from the caller's own userId, so a project id in the payload can
 *  never reach another account's lists. No user → no saved lists → `[]`, which
 *  leaves the request shape (and its cache key) byte-identical to the ungrounded
 *  path.
 *
 *  Lives beside the pure ./grounding helpers rather than in api/ai/grounding.ts so
 *  the brief row can lazy-import it — the same idiom `resolveTwinDraftGate` uses to
 *  keep the statically imported mode table free of the Firestore import graph. */
import { resolveTenant } from "@/lib/campaigns/connector";
import { listKeywordLists } from "@/lib/keywords/store";
import type { BriefKeyword } from "@/lib/ai-types";
import { groundableKeywords, toBriefKeywords } from "./grounding";

export async function resolveBriefKeywords(
  projectId: string | undefined,
  userId: string | null
): Promise<BriefKeyword[]> {
  if (!projectId || !userId) return [];
  try {
    const tenant = await resolveTenant(userId, projectId);
    return toBriefKeywords(groundableKeywords(await listKeywordLists(tenant)));
  } catch {
    // Grounding is an upgrade, never a gate: a store hiccup must not cost the
    // maker their brief — it just generates without the saved-keyword block.
    return [];
  }
}
