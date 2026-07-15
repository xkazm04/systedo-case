/** Per-project finance-inputs store — FIRESTORE backend. One doc at
 *  `financeInputs/{projectId}` holding the {realNumbers?, scenarios, channelMargins?,
 *  updatedAt} blob. Server-only (firebase-admin is Node-only); imported lazily by the
 *  dispatcher so the LOCAL_DB path never pulls firebase-admin in. Mirrors the local
 *  backend's interface. */
import { firestore } from "@/lib/firebase";
import type { FinanceInputs } from "./types";

function financeDoc(projectId: string) {
  return firestore.collection("financeInputs").doc(projectId);
}

export async function getFinanceInputs(projectId: string): Promise<FinanceInputs | null> {
  const doc = await financeDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as FinanceInputs;
  } catch {
    return null;
  }
}

export async function saveFinanceInputs(projectId: string, inputs: FinanceInputs): Promise<void> {
  await financeDoc(projectId).set({
    data: JSON.stringify(inputs),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearFinanceInputs(projectId: string): Promise<void> {
  await financeDoc(projectId).delete();
}
