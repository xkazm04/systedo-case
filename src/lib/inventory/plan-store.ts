/** Per-project inventory-plan store — backend dispatcher + read-modify-write
 *  helpers. Local node:sqlite when LOCAL_DB is on, else Firestore; the backend is
 *  imported LAZILY so the LOCAL_DB path never evaluates the Firestore module.
 *  Project-scoped (the plan + stock-alert episodes belong to the project whose stock
 *  produced them). Server-only. Mirrors diagnoses/store; the pure shape + transitions
 *  live in ./plan-types.
 *
 *  The blob carries two concerns written by different callers — the saved plan (the
 *  user, via the API route) and the per-SKU stock-alert suppression state (the sync
 *  path). Each write is a read-modify-write that preserves the field it doesn't own. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { AlertState } from "@/lib/campaigns/alert-suppression";
import { emptyPlanState, type InventoryPlanState, type StoredPlan } from "./plan-types";

function backend() {
  return LOCAL_DB ? import("./plan-store.local") : import("./plan-store.firestore");
}

/** The project's saved inventory-plan blob, or null when nothing has been saved. */
export async function getInventoryPlanState(projectId: string): Promise<InventoryPlanState | null> {
  return (await backend()).getInventoryPlanState(projectId);
}

/** Replace the project's inventory-plan blob. */
export async function saveInventoryPlanState(projectId: string, state: InventoryPlanState): Promise<void> {
  return (await backend()).saveInventoryPlanState(projectId, state);
}

/** Drop a project's inventory-plan blob (plan + alert episodes). */
export async function clearInventoryPlanState(projectId: string): Promise<void> {
  return (await backend()).clearInventoryPlanState(projectId);
}

/** Read the current blob, degrading a store hiccup to null so a first write never
 *  fails on a missing doc. */
async function safeGet(projectId: string): Promise<InventoryPlanState | null> {
  try {
    return await getInventoryPlanState(projectId);
  } catch {
    return null;
  }
}

/** The project's saved action plan, or null. */
export async function getStoredPlan(projectId: string): Promise<StoredPlan | null> {
  return (await safeGet(projectId))?.plan ?? null;
}

/** Persist the action plan, preserving the stock-alert episodes. */
export async function savePlan(projectId: string, plan: StoredPlan): Promise<void> {
  const cur = (await safeGet(projectId)) ?? emptyPlanState();
  await saveInventoryPlanState(projectId, { ...cur, plan, updatedAt: new Date().toISOString() });
}

/** The project's per-SKU stock-alert suppression episodes (empty when none saved). */
export async function getStockAlertState(projectId: string): Promise<AlertState> {
  return (await safeGet(projectId))?.stockAlerts ?? {};
}

/** Persist the stock-alert episodes, preserving the saved plan. */
export async function saveStockAlertState(projectId: string, stockAlerts: AlertState): Promise<void> {
  const cur = (await safeGet(projectId)) ?? emptyPlanState();
  await saveInventoryPlanState(projectId, { ...cur, stockAlerts, updatedAt: new Date().toISOString() });
}
