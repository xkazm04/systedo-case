/** Warehouse connection store — FIRESTORE backend (`users/{uid}/projectConnections/
 *  {projectId}`). Server-only; the dispatcher imports it lazily so the LOCAL_DB path
 *  never pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import type { OwnedConnection, StoredConnection } from "./connection-store";

function connectionDoc(userId: string, projectId: string) {
  return firestore.collection("users").doc(userId).collection("projectConnections").doc(projectId);
}

function toStored(d: FirebaseFirestore.DocumentData): StoredConnection | null {
  if (typeof d.provider !== "string") return null;
  return {
    provider: d.provider,
    inventoryId: d.inventoryId || undefined,
    tokenEnc: d.tokenEnc || undefined,
    connectedAt: d.connectedAt ?? new Date(0).toISOString(),
    lastSyncAt: d.lastSyncAt || undefined,
  };
}

export async function getConnection(userId: string, projectId: string): Promise<StoredConnection | null> {
  const doc = await connectionDoc(userId, projectId).get();
  return doc.exists ? toStored(doc.data()!) : null;
}

export async function listAllConnections(): Promise<OwnedConnection[]> {
  // Collection-group query over every user's projectConnections subcollection.
  const snap = await firestore.collectionGroup("projectConnections").get();
  const out: OwnedConnection[] = [];
  for (const doc of snap.docs) {
    const userId = doc.ref.parent.parent?.id;
    const connection = toStored(doc.data());
    if (userId && connection) out.push({ userId, projectId: doc.id, connection });
  }
  return out;
}

export async function saveConnection(userId: string, projectId: string, conn: StoredConnection): Promise<void> {
  // Drop undefined so Firestore never stores an explicit `undefined`.
  const clean = Object.fromEntries(Object.entries(conn).filter(([, v]) => v !== undefined));
  await connectionDoc(userId, projectId).set(clean);
}

export async function deleteConnection(userId: string, projectId: string): Promise<void> {
  await connectionDoc(userId, projectId).delete();
}
