"use server";
/** Server Actions for the catalog creative module's persisted ad copy: hydrate on
 *  mount and save one SKU's copy after each successful generation. Both are
 *  ownership-guarded — a caller can only read/write ad copy for a project they own
 *  (their own userId × an owned projectId), so the client-supplied projectId can't
 *  reach another tenant's blob. The client echoes back the AiResult it just generated
 *  through /api/ai; `sanitizeAdCopy` bounds it (the trust boundary) before it persists.
 *  The demo surface has no project context → these are never called there. */
import { requireOwnedTenantProject } from "@/lib/projects/persist-guard";
import { getAdCopy, recordAdCopy } from "@/lib/catalog/ad-copy-store";
import { sanitizeAdCopy, type AdCopyState } from "@/lib/catalog/ad-copy";

/** The signed-in caller's id IFF they own `projectId`, else null (unauthenticated,
 *  a demo/marketing id, or not their project). The handshake itself lives in the
 *  shared write-path guard — this file no longer re-derives demo-ness. */
async function ownerOf(projectId: string): Promise<string | null> {
  return (await requireOwnedTenantProject(projectId))?.uid ?? null;
}

/** Load a project's persisted ad copy (null when unowned / none saved). */
export async function loadAdCopyAction(projectId: string): Promise<AdCopyState | null> {
  const uid = await ownerOf(projectId);
  if (!uid) return null;
  return getAdCopy(uid, projectId);
}

/** Persist one SKU's freshly generated copy (regenerate overwrites in place). The raw
 *  entry is sanitized/bounded before it lands. Returns the updated blob (so the client
 *  can reconcile), or null when the caller doesn't own the project. */
export async function saveAdCopyAction(
  projectId: string,
  sku: string,
  entry: unknown
): Promise<AdCopyState | null> {
  const uid = await ownerOf(projectId);
  if (!uid || !sku) return null;
  return recordAdCopy(uid, projectId, sanitizeAdCopy(entry, sku));
}
