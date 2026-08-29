/** Durable L2 response cache — FIRESTORE backend. One doc per entry in the
 *  `aiResponseCache` collection (doc id = the cache key). `expiresAt` (a Date) is the
 *  native Firestore TTL field an operator can point a TTL policy at; `expires` (epoch
 *  ms) is read back for our OWN freshness check, because Firestore TTL deletion is
 *  eventual, not immediate. Server-only (firebase-admin is Node-only); imported LAZILY
 *  by the dispatcher so the LOCAL_DB path never pulls firebase-admin in. Mirrors the
 *  local backend's interface + the twin_archive eviction pattern (query one field,
 *  sort in memory to avoid a composite index, delete the overflow). */
import { firestore } from "@/lib/firebase";
import { L2_MAX_PER_TOOL, type CacheEntry } from "./response-cache-store";
import type { AiResponse } from "@/lib/ai-types";

const COLLECTION = "aiResponseCache";

interface CacheDoc {
  tool: string;
  data: string;
  expires: number;
  createdAt: number;
  expiresAt: Date;
}

export async function readDurable(key: string): Promise<CacheEntry | null> {
  const snap = await firestore.collection(COLLECTION).doc(key).get();
  if (!snap.exists) return null;
  const doc = snap.data() as CacheDoc | undefined;
  if (!doc || typeof doc.expires !== "number" || doc.expires < Date.now()) return null;
  try {
    return { value: JSON.parse(doc.data) as AiResponse<unknown>, expires: doc.expires };
  } catch {
    return null; // corrupt blob → miss
  }
}

export async function writeDurable(tool: string, key: string, entry: CacheEntry): Promise<void> {
  const col = firestore.collection(COLLECTION);
  await col.doc(key).set({
    tool,
    data: JSON.stringify(entry.value),
    expires: entry.expires,
    createdAt: Date.now(),
    expiresAt: new Date(entry.expires),
  } satisfies CacheDoc);

  // Eviction: keep only the newest L2_MAX_PER_TOOL docs for this tool.
  const qs = await col.where("tool", "==", tool).get();
  if (qs.size > L2_MAX_PER_TOOL) {
    // Newest first, ties broken by document id DESCENDING — the doc id IS the
    // cache key (col.doc(key) above), so this is the same tiebreak the sqlite twin
    // applies as `ORDER BY created_at ASC, cache_key ASC` when it picks victims
    // (response-cache-store.local.ts:57), just reversed because this side slices
    // the TAIL off a newest-first list instead of selecting the head of an
    // oldest-first one. `createdAt` is Date.now(), so under load two entries for
    // one tool routinely share a millisecond; without the tiebreak this comparator
    // returned 0 and the two drivers evicted DIFFERENT cache entries.
    const docs = qs.docs
      .map((d) => ({ id: d.id, createdAt: (d.data() as CacheDoc).createdAt ?? 0 }))
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    const overflow = docs.slice(L2_MAX_PER_TOOL);
    const batch = firestore.batch();
    for (const o of overflow) batch.delete(col.doc(o.id));
    await batch.commit();
    console.warn(
      `[ai-cache] L2 cap ${L2_MAX_PER_TOOL} reached for tool ${tool}: evicted ${overflow.length} oldest`
    );
  }
}
