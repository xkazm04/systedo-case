/** Persist keyword research so it stops being one-shot: a user saves a result as
 *  a named list, tags each keyword core / negative / watch, and the negatives
 *  aggregate into a paste-ready block for Google Ads. Stored per tenant in
 *  Firestore (`tenants/{tenant}/keywordLists/{id}`). Server-only — the pure model
 *  (types, labels, aggregateNegatives) lives in ./types so client code can import
 *  it without pulling firebase-admin into the bundle. */
import { firestore } from "@/lib/firebase";
import type { KeywordList, KeywordListInput, KeywordTag } from "./types";

function listsCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("keywordLists");
}

/** Save a new keyword list and return it (with id + timestamps). */
export async function saveKeywordList(tenant: string, input: KeywordListInput): Promise<KeywordList> {
  const now = new Date().toISOString();
  const doc = { ...input, createdAt: now, updatedAt: now };
  const ref = await listsCol(tenant).add(doc);
  return { id: ref.id, ...doc };
}

/** All of a tenant's keyword lists, newest first. */
export async function listKeywordLists(tenant: string): Promise<KeywordList[]> {
  const snap = await listsCol(tenant).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<KeywordList, "id">) }));
}

/** Re-tag keywords within a list. `tags` maps keyword → new tag; keywords absent
 *  from the map keep their current tag. */
export async function updateKeywordTags(
  tenant: string,
  id: string,
  tags: Record<string, KeywordTag>
): Promise<void> {
  const ref = listsCol(tenant).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as Omit<KeywordList, "id">;
  const keywords = (data.keywords ?? []).map((k) =>
    tags[k.keyword] ? { ...k, tag: tags[k.keyword] } : k
  );
  await ref.set({ keywords, updatedAt: new Date().toISOString() }, { merge: true });
}

/** Delete a saved list. */
export async function deleteKeywordList(tenant: string, id: string): Promise<void> {
  await listsCol(tenant).doc(id).delete();
}
