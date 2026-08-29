/** Webhook delivery log — FIRESTORE backend (`projects/{projectId}/
 *  webhookDeliveries/{id}`). Server-only; the dispatcher imports it lazily so the
 *  LOCAL_DB path never pulls firebase-admin in. Mirrors the local backend exactly.
 *
 *  The cross-tenant sweep is a COLLECTION-GROUP query with ONE equality filter
 *  (`status == "pending"`) — the shape `connection-store.firestore.ts`
 *  (`listAllConnections`) already uses, and the reason there is no `nextAt` range in
 *  the query: an equality + inequality pair over two fields would need a composite
 *  index, while a single-field filter rides Firestore's automatic single-field
 *  indexes (which are collection-group scoped by default). The due-time cut is
 *  therefore applied in memory over a bounded page — pending rows are few by
 *  construction (a delivery leaves `pending` after at most DELIVERY_MAX_ATTEMPTS). */
import { firestore } from "@/lib/firebase";
import type { Delivery } from "./types";
import { DELIVERY_LOG_CAP } from "./types";

/** Over-read factor for the pending sweep: the due-time cut happens in memory, so
 *  the query must fetch more than `limit` rows to avoid starving due deliveries
 *  behind not-yet-due ones. Bounded so one tick's read stays cheap. */
const PENDING_SCAN_FACTOR = 5;

function deliveries(projectId: string) {
  return firestore.collection("projects").doc(projectId).collection("webhookDeliveries");
}

function toDelivery(d: FirebaseFirestore.DocumentData): Delivery | null {
  if (typeof d.id !== "string" || typeof d.projectId !== "string") return null;
  return d as Delivery;
}

function parseAll(docs: FirebaseFirestore.QueryDocumentSnapshot[]): Delivery[] {
  const out: Delivery[] = [];
  for (const doc of docs) {
    const v = toDelivery(doc.data());
    if (v) out.push(v);
  }
  return out;
}

/** Drop undefined so Firestore never stores an explicit `undefined`. */
function clean(d: Delivery): Record<string, unknown> {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
}

export async function appendDelivery(delivery: Delivery): Promise<void> {
  const col = deliveries(delivery.projectId);
  await col.doc(delivery.id).set(clean(delivery));
  // Cap the log: read the oldest ids beyond the cap and drop them. `createdAt` is a
  // fixed-width ISO string, so ordering by it is chronological.
  const snap = await col.orderBy("createdAt", "desc").offset(DELIVERY_LOG_CAP).get();
  if (snap.empty) return;
  const batch = firestore.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
}

export async function updateDelivery(
  projectId: string,
  id: string,
  patch: Partial<Delivery>
): Promise<void> {
  const ref = deliveries(projectId).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return; // evicted mid-flight — a no-op, never an error
  const merged = Object.fromEntries(
    Object.entries({ ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() }).filter(
      ([, v]) => v !== undefined
    )
  );
  await ref.set(merged, { merge: true });
}

export async function listDeliveries(projectId: string, limit = 50): Promise<Delivery[]> {
  const snap = await deliveries(projectId).orderBy("createdAt", "desc").limit(limit).get();
  return parseAll(snap.docs);
}

export async function listPendingDeliveries(now: Date, limit = 100): Promise<Delivery[]> {
  const snap = await firestore
    .collectionGroup("webhookDeliveries")
    .where("status", "==", "pending")
    .limit(limit * PENDING_SCAN_FACTOR)
    .get();
  const iso = now.toISOString();
  return parseAll(snap.docs)
    .filter((d) => d.nextAt !== null && d.nextAt <= iso)
    .sort((a, b) => (a.nextAt ?? "").localeCompare(b.nextAt ?? ""))
    .slice(0, limit);
}

export async function clearDeliveries(projectId: string): Promise<void> {
  const snap = await deliveries(projectId).get();
  if (snap.empty) return;
  const batch = firestore.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
}
