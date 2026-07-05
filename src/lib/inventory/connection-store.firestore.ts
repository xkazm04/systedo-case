/** Warehouse connection store — FIRESTORE backend (`users/{uid}/projectConnections/
 *  {projectId}`). Server-only; the dispatcher imports it lazily so the LOCAL_DB path
 *  never pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import type { StoredConnection } from "./connection-store";

function connectionDoc(userId: string, projectId: string) {
  return firestore.collection("users").doc(userId).collection("projectConnections").doc(projectId);
}

export async function getConnection(userId: string, projectId: string): Promise<StoredConnection | null> {
  const doc = await connectionDoc(userId, projectId).get();
  if (!doc.exists) return null;
  const d = doc.data()!;
  if (typeof d.provider !== "string") return null;
  return {
    provider: d.provider,
    inventoryId: d.inventoryId || undefined,
    tokenEnc: d.tokenEnc || undefined,
    connectedAt: d.connectedAt ?? new Date(0).toISOString(),
    lastSyncAt: d.lastSyncAt || undefined,
  };
}

export async function saveConnection(userId: string, projectId: string, conn: StoredConnection): Promise<void> {
  // Drop undefined so Firestore never stores an explicit `undefined`.
  const clean = Object.fromEntries(Object.entries(conn).filter(([, v]) => v !== undefined));
  await connectionDoc(userId, projectId).set(clean);
}

export async function deleteConnection(userId: string, projectId: string): Promise<void> {
  await connectionDoc(userId, projectId).delete();
}
