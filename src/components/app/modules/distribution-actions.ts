"use server";
/** Server Actions for Distribuce's persisted channel variants: hydrate on mount
 *  and save one channel's text after each edit / AI regeneration / handoff.
 *
 *  Both are ownership-guarded — a caller can only read/write variants for a project
 *  they own (their own userId × an owned projectId) — so the client-supplied
 *  projectId can't reach another tenant's blob. Demo project ids are never owned,
 *  so the marketing surface resolves to null and stores nothing: the fixture stays
 *  a fixture. Mirrors catalog/ad-copy-actions.ts. */
import { requireOwnedTenantProject } from "@/lib/projects/persist-guard";
import { getVariants, recordSource, recordVariant } from "@/lib/distribution/variants-store";
import { sanitizeSource, sanitizeVariant, type VariantState } from "@/lib/distribution/variants";

/** The signed-in caller's id IFF they own `projectId`, else null (unauthenticated,
 *  a demo/marketing id, or not their project). The handshake itself lives in the
 *  shared write-path guard — this file no longer re-derives demo-ness. */
async function ownerOf(projectId: string): Promise<string | null> {
  return (await requireOwnedTenantProject(projectId))?.uid ?? null;
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

/** Hand one article (an article-draft/content-engine output) into Distribuce. The
 *  payload is sanitized and bounded before it lands, and an article with no usable
 *  title/URL is rejected outright rather than stored as something the UTM stamper
 *  would later choke on. Returns the article's storage key so the caller can deep-link
 *  straight to it, or null when the handoff was refused. */
export async function sendArticleToDistributionAction(
  projectId: string,
  article: unknown
): Promise<{ articleKey: string } | null> {
  const uid = await ownerOf(projectId);
  if (!uid) return null;
  const source = sanitizeSource(article);
  if (!source) return null;
  await recordSource(uid, projectId, source);
  return { articleKey: source.articleKey };
}
