/** Per-project cost-model store — FIRESTORE backend. One doc at
 *  `costModels/{projectId}` holding the CostModel blob. Server-only (firebase-admin
 *  is Node-only); imported lazily by the dispatcher so the LOCAL_DB path never pulls
 *  firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import type { CostModel } from "./types";

function modelDoc(projectId: string) {
  return firestore.collection("costModels").doc(projectId);
}

export async function getCostModel(projectId: string): Promise<CostModel | null> {
  const doc = await modelDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as CostModel;
  } catch {
    return null;
  }
}

export async function saveCostModel(projectId: string, model: CostModel): Promise<void> {
  await modelDoc(projectId).set({ data: JSON.stringify(model), updatedAt: new Date().toISOString() });
}

export async function clearCostModel(projectId: string): Promise<void> {
  await modelDoc(projectId).delete();
}
