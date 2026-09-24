/** Webhook delivery log — FIRESTORE backend (`projects/{projectId}/
 *  webhookDeliveries/{id}`). Server-only; the dispatcher imports it lazily so the
 *  LOCAL_DB path never pulls firebase-admin in. Mirrors the local backend exactly.
 *
 *  The cross-tenant sweep is a COLLECTION-GROUP query with ONE single-field filter
 *  (`status in ["pending", "sending"]`) — the shape `connection-store.firestore.ts`
 *  (`listAllConnections`) already uses, and the reason there is no `nextAt` range in
 *  the query: an equality + inequality pair over two fields would need a composite
 *  index, while a single-field filter rides Firestore's automatic single-field
 *  indexes (which are collection-group scoped by default). The due-time cut is
 *  therefore applied in memory over a bounded page — pending rows are few by
 *  construction (a delivery leaves `pending` after at most DELIVERY_MAX_ATTEMPTS).
 *
 *  The claim and the completion are `runTransaction`s — the tenant-docs
 *  compareAndSet shape (src/lib/tenant-docs/firestore.ts). */
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase";
import type { Delivery } from "./types";
import { CLAIMABLE_STATUSES, DELIVERY_LOG_CAP, isClaimable } from "./types";

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

/** A merge-patch that CLEARS what the caller cleared. `{ merge: true }` leaves a field
 *  the patch omits untouched, so dropping an `undefined` value (the old behaviour)
 *  kept a stale `lastError` under a delivered row; mapping it to the delete sentinel
 *  removes it. PURE — `del` is injected so the rule is testable without Firestore. */
export function toFirestorePatch<D>(patch: Record<string, unknown>, del: D): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? del : v]));
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
  const merged = toFirestorePatch(
    { ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() },
    FieldValue.delete()
  );
  await ref.set(merged, { merge: true });
}

export async function getDelivery(projectId: string, id: string): Promise<Delivery | null> {
  const snap = await deliveries(projectId).doc(id).get();
  return snap.exists ? toDelivery(snap.data() ?? {}) : null;
}

export async function claimDelivery(
  projectId: string,
  id: string,
  holder: string,
  leaseUntil: string,
  now: Date
): Promise<boolean> {
  const ref = deliveries(projectId).doc(id);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? toDelivery(snap.data() ?? {}) : null;
    if (!cur || !isClaimable(cur, now.toISOString())) return false;
    tx.set(
      ref,
      {
        status: "sending",
        attempts: cur.attempts + 1,
        nextAt: leaseUntil,
        claim: { holder, until: leaseUntil },
        updatedAt: now.toISOString(),
      },
      { merge: true }
    );
    return true;
  });
}

export async function completeDelivery(
  projectId: string,
  id: string,
  holder: string,
  patch: Partial<Delivery>
): Promise<boolean> {
  const ref = deliveries(projectId).doc(id);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? toDelivery(snap.data() ?? {}) : null;
    if (!cur || cur.status !== "sending" || cur.claim?.holder !== holder) return false;
    tx.set(
      ref,
      toFirestorePatch(
        { ...patch, claim: undefined, updatedAt: patch.updatedAt ?? new Date().toISOString() },
        FieldValue.delete()
      ),
      { merge: true }
    );
    return true;
  });
}

export async function listDeliveries(projectId: string, limit = 50): Promise<Delivery[]> {
  const snap = await deliveries(projectId).orderBy("createdAt", "desc").limit(limit).get();
  return parseAll(snap.docs);
}

export async function listPendingDeliveries(now: Date, limit = 100): Promise<Delivery[]> {
  const snap = await firestore
    .collectionGroup("webhookDeliveries")
    .where("status", "in", [...CLAIMABLE_STATUSES])
    .limit(limit * PENDING_SCAN_FACTOR)
    .get();
  const iso = now.toISOString();
  return parseAll(snap.docs)
    .filter((d) => isClaimable(d, iso))
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
