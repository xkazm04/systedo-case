/** Persist keyword research so it stops being one-shot: a user saves a result as
 *  a named list, tags each keyword core / negative / watch, and the negatives
 *  aggregate into a paste-ready block for Google Ads. Stored per tenant under the
 *  `keywordLists` collection. Server-only — the pure model (types, labels,
 *  aggregateNegatives) lives in ./types so client code can import it without
 *  pulling firebase-admin into the bundle.
 *
 *  Offline parity — verdict: REAL user state (workspace-authored saved lists), so
 *  it carries a sqlite twin. Raw document access dispatches through the generic
 *  tenant-docs backend (Firestore vs node:sqlite `tenant_docs`, migration v17), so
 *  the whole keyword-list surface works offline under LOCAL_DB and the Firestore
 *  path stays byte-identical (add / orderBy createdAt desc / get / merge-set /
 *  delete). The pure derivations (research, intent, negatives) never touched a store. */
import { tenantDocs } from "@/lib/tenant-docs/backend";
import type { KeywordList, KeywordListInput, KeywordTag } from "./types";

const COLLECTION = "keywordLists";

/** Save a new keyword list and return it (with id + timestamps). */
export async function saveKeywordList(tenant: string, input: KeywordListInput): Promise<KeywordList> {
  const now = new Date().toISOString();
  const doc = { ...input, createdAt: now, updatedAt: now };
  const id = await (await tenantDocs()).addDoc(tenant, COLLECTION, doc);
  return { id, ...doc };
}

/** All of a tenant's keyword lists, newest first. */
export async function listKeywordLists(tenant: string): Promise<KeywordList[]> {
  const rows = await (await tenantDocs()).listDocs(tenant, COLLECTION, {
    orderBy: { field: "createdAt", dir: "desc" },
  });
  return rows.map((r) => ({ id: r.id, ...(r.data as Omit<KeywordList, "id">) }));
}

/** Re-tag keywords within a list. `tags` maps keyword → new tag; keywords absent
 *  from the map keep their current tag. */
export async function updateKeywordTags(
  tenant: string,
  id: string,
  tags: Record<string, KeywordTag>
): Promise<void> {
  const store = await tenantDocs();
  const data = await store.getDoc(tenant, COLLECTION, id);
  if (!data) return;
  const list = data as Omit<KeywordList, "id">;
  const keywords = (list.keywords ?? []).map((k) =>
    tags[k.keyword] ? { ...k, tag: tags[k.keyword] } : k
  );
  await store.setDoc(tenant, COLLECTION, id, { keywords, updatedAt: new Date().toISOString() }, { merge: true });
}

/** Delete a saved list. */
export async function deleteKeywordList(tenant: string, id: string): Promise<void> {
  await (await tenantDocs()).deleteDoc(tenant, COLLECTION, id);
}
