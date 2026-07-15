/** Per-user Sklik connection store — FIRESTORE backend (`sklikConnections/{userId}`).
 *  Server-only; the dispatcher imports it lazily so the LOCAL_DB path never pulls
 *  firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import type { OwnedSklikConnection, SklikConnection, SklikMoneyVerdict } from "./sklik-connection";

const COLLECTION = "sklikConnections";

function docRef(userId: string) {
  return firestore.collection(COLLECTION).doc(userId);
}

function toStored(d: FirebaseFirestore.DocumentData): SklikConnection | null {
  if (typeof d.tokenEnc !== "string") return null;
  return {
    tokenEnc: d.tokenEnc,
    connectedAt: d.connectedAt ?? new Date(0).toISOString(),
    ...(typeof d.moneyVerdict === "string" ? { moneyVerdict: d.moneyVerdict as SklikMoneyVerdict } : {}),
    ...(d.moneyVerdictAt ? { moneyVerdictAt: d.moneyVerdictAt } : {}),
    ...(d.halereConfirmed ? { halereConfirmed: true } : {}),
    ...(d.halereConfirmedAt ? { halereConfirmedAt: d.halereConfirmedAt } : {}),
  };
}

export async function getSklikConnection(userId: string): Promise<SklikConnection | null> {
  const doc = await docRef(userId).get();
  return doc.exists ? toStored(doc.data()!) : null;
}

export async function saveSklikConnection(userId: string, conn: SklikConnection): Promise<void> {
  // Drop undefined so Firestore never stores an explicit `undefined`.
  const clean = Object.fromEntries(Object.entries(conn).filter(([, v]) => v !== undefined));
  await docRef(userId).set(clean);
}

export async function deleteSklikConnection(userId: string): Promise<void> {
  await docRef(userId).delete();
}

export async function listSklikConnectedUserIds(): Promise<string[]> {
  const snap = await firestore.collection(COLLECTION).get();
  return snap.docs.filter((d) => typeof d.data().tokenEnc === "string").map((d) => d.id);
}

export async function listAllSklikConnections(): Promise<OwnedSklikConnection[]> {
  const snap = await firestore.collection(COLLECTION).get();
  const out: OwnedSklikConnection[] = [];
  for (const doc of snap.docs) {
    const connection = toStored(doc.data());
    if (connection) out.push({ userId: doc.id, connection });
  }
  return out;
}
