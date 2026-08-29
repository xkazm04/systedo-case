/** The catalog change ledger — FIRESTORE backend (cloud / production). A
 *  SUBCOLLECTION hanging off the catalog document it describes:
 *
 *    users/{uid}/projectCatalogs/{projectId}          ← the catalog blob (store.firestore)
 *    users/{uid}/projectCatalogs/{projectId}/events/{id}  ← one doc per change event
 *
 *  One doc per event is the point — see events-store.ts. Server-only (firebase-admin
 *  is Node-only); the dispatcher imports this lazily so the LOCAL_DB path never pulls
 *  firebase-admin in. Mirrors the local backend's interface exactly. */
import { firestore } from "@/lib/firebase";
import { CATALOG_EVENT_CAP, type CatalogEvent } from "./events";
import type { CatalogEventQuery } from "./events-store";

const DEFAULT_LIMIT = 200;
/** Firestore's hard limit is 500 writes per batch; stay under it with headroom. */
const BATCH_SIZE = 400;

function eventsCol(userId: string, projectId: string) {
  return firestore
    .collection("users")
    .doc(userId)
    .collection("projectCatalogs")
    .doc(projectId)
    .collection("events");
}

/** An event id embeds the offering key, which is feed-controlled — so it is encoded
 *  rather than trusted ("/" is illegal in a doc id, a bare "." / ".." is reserved). */
function docId(id: string): string {
  return encodeURIComponent(id).replace(/\./g, "%2E");
}

function parse(raw: unknown): CatalogEvent | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as CatalogEvent;
  } catch {
    return null;
  }
}

async function deleteRefs(refs: FirebaseFirestore.DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = firestore.batch();
    for (const ref of refs.slice(i, i + BATCH_SIZE)) batch.delete(ref);
    await batch.commit();
  }
}

export async function appendCatalogEvents(
  userId: string,
  projectId: string,
  events: CatalogEvent[]
): Promise<void> {
  if (events.length === 0) return;
  const col = eventsCol(userId, projectId);
  // Idempotent by event id: a retried import re-`set`s the same docs instead of
  // duplicating the batch. Chunked so a large replace-import stays inside the
  // per-batch write limit.
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = firestore.batch();
    for (const e of events.slice(i, i + BATCH_SIZE)) {
      // `at`/`key` are mirrored as real fields so they are queryable/orderable; the
      // event itself stays one JSON string (one shape to parse, no partial-write skew).
      batch.set(col.doc(docId(e.id)), { at: e.at, key: e.key, kind: e.kind, data: JSON.stringify(e) });
    }
    await batch.commit();
  }

  // Keep only the newest CATALOG_EVENT_CAP events for this project (cold tail dropped).
  const snap = await col.orderBy("at", "asc").get();
  if (snap.size > CATALOG_EVENT_CAP) {
    await deleteRefs(snap.docs.slice(0, snap.size - CATALOG_EVENT_CAP).map((d) => d.ref));
  }
}

export async function listCatalogEvents(
  userId: string,
  projectId: string,
  query: CatalogEventQuery = {}
): Promise<CatalogEvent[]> {
  const limit = query.limit ?? DEFAULT_LIMIT;
  const col = eventsCol(userId, projectId);
  if (query.key) {
    // where + orderBy would need a composite index; the read stays single-field (the
    // lead_activities / cron_runs posture) and sorts the bounded set in memory.
    const snap = await col.where("key", "==", query.key).get();
    return snap.docs
      .map((d) => ({ at: (d.data()?.at as string | undefined) ?? "", item: parse(d.data()?.data) }))
      .filter((r): r is { at: string; item: CatalogEvent } => r.item !== null)
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, limit)
      .map((r) => r.item);
  }
  const snap = await col.orderBy("at", "desc").limit(limit).get();
  return snap.docs.map((d) => parse(d.data()?.data)).filter((e): e is CatalogEvent => e !== null);
}

export async function clearCatalogEvents(userId: string, projectId: string): Promise<void> {
  const snap = await eventsCol(userId, projectId).get();
  if (snap.empty) return;
  await deleteRefs(snap.docs.map((d) => d.ref));
}
