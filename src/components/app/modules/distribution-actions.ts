"use server";
/** Server Actions for Distribuce's persisted channel variants: hydrate on mount
 *  and save one channel's text after each edit / AI regeneration / handoff.
 *
 *  Both are ownership-guarded — a caller can only read/write variants for a project
 *  they own (their own userId × an owned projectId) — so the client-supplied
 *  projectId can't reach another tenant's blob. Demo project ids are never owned,
 *  so the marketing surface resolves to null and stores nothing: the fixture stays
 *  a fixture. Mirrors catalog/ad-copy-actions.ts. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { getVariants, recordVariant } from "@/lib/distribution/variants-store";
import { sanitizeVariant, type VariantState } from "@/lib/distribution/variants";
import { isDemoProjectId } from "@/lib/projects/demo";

/** The signed-in caller's id IFF they own `projectId`, else null (unauthenticated,
 *  a demo id, or not their project). */
async function ownerOf(projectId: string): Promise<string | null> {
  if (!projectId || isDemoProjectId(projectId)) return null;
  const uid = await currentUserId();
  if (!uid) return null;
  const project = await getProject(uid, projectId);
  return project ? uid : null;
}

/** Load a project's persisted variants (null when unowned / none saved → the
 *  module falls straight through to the deterministic repurpose output). */
export async function loadVariantsAction(projectId: string): Promise<VariantState | null> {
  const uid = await ownerOf(projectId);
  if (!uid) return null;
  return getVariants(uid, projectId);
}

/** Persist one channel's variant for one article. The raw entry is sanitized and
 *  bounded before it lands (the trust boundary). Returns the updated blob so the
 *  client can reconcile, or null when the caller doesn't own the project. */
export async function saveVariantAction(
  projectId: string,
  articleKey: string,
  title: string,
  channel: string,
  entry: unknown
): Promise<VariantState | null> {
  const uid = await ownerOf(projectId);
  if (!uid || !articleKey || !channel) return null;
  return recordVariant(uid, projectId, articleKey, title, sanitizeVariant(entry, channel));
}
