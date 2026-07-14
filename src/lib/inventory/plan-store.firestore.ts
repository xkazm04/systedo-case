/** Per-project inventory-plan store — FIRESTORE backend. One doc at
 *  `inventoryPlans/{projectId}` holding the {plan, stockAlerts, updatedAt} blob.
 *  Server-only (firebase-admin is Node-only); imported lazily by the dispatcher so
 *  the LOCAL_DB path never pulls firebase-admin in. Mirrors the local backend. */
import { firestore } from "@/lib/firebase";
import type { InventoryPlanState } from "./plan-types";

function planDoc(projectId: string) {
  return firestore.collection("inventoryPlans").doc(projectId);
}

export async function getInventoryPlanState(projectId: string): Promise<InventoryPlanState | null> {
  const doc = await planDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as InventoryPlanState;
  } catch {
    return null;
  }
}

export async function saveInventoryPlanState(projectId: string, state: InventoryPlanState): Promise<void> {
  await planDoc(projectId).set({ data: JSON.stringify(state), updatedAt: new Date().toISOString() });
}

export async function clearInventoryPlanState(projectId: string): Promise<void> {
  await planDoc(projectId).delete();
}
