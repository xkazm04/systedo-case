/** The webhook delivery log — backend DISPATCHER (ADR-0001).
 *
 *  ⚠ ROW-BASED, unlike the sibling config store. The reasoning is the lead store's
 *  (src/lib/leads/store.ts): a delivery log is UNBOUNDED and append-heavy, so a
 *  single JSON blob per project would march toward Firestore's 1 MiB document cap
 *  and lose writes to read-modify-write races between an emit (a cron sync) and a
 *  retry (the ledgers cron) running at the same moment. One row/doc per delivery
 *  instead, capped at {@link DELIVERY_LOG_CAP} newest per project.
 *
 *  Keyed by `projectId` (not by user): the retry step sweeps pending deliveries
 *  across every tenant and must address them without knowing whose they are — the
 *  owner's `userId` therefore rides ON the record (see Delivery). The read paths a
 *  ROUTE serves still resolve `projectId` through `requireOwnedProject` first, so
 *  ADR-0002 holds where it matters. Server-only. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { Delivery } from "./types";

function backend() {
  return LOCAL_DB ? import("./delivery-store.local") : import("./delivery-store.firestore");
}

/** Append one delivery, evicting the oldest rows beyond DELIVERY_LOG_CAP. Idempotent
 *  by delivery id (re-appending the same id updates it in place, never duplicates) —
 *  which is what lets the retry step be safe without a per-attempt sent-guard. */
export async function appendDelivery(delivery: Delivery): Promise<void> {
  return (await backend()).appendDelivery(delivery);
}

/** Patch one delivery in place. A patch for an id that no longer exists (evicted by
 *  the cap while an attempt was in flight) is a no-op, never an error. */
export async function updateDelivery(
  projectId: string,
  id: string,
  patch: Partial<Delivery>
): Promise<void> {
  return (await backend()).updateDelivery(projectId, id, patch);
}

/** This project's log, NEWEST FIRST, bounded. */
export async function listDeliveries(projectId: string, limit = 50): Promise<Delivery[]> {
  return (await backend()).listDeliveries(projectId, limit);
}

/** Every project's deliveries that are `pending` and DUE (`nextAt <= now`) — the
 *  retry step's work list, bounded so one tick can never run unboundedly long. */
export async function listPendingDeliveries(now: Date, limit = 100): Promise<Delivery[]> {
  return (await backend()).listPendingDeliveries(now, limit);
}

/** Drop a project's whole delivery log — the project-delete cascade + the settings
 *  "clear log" action. */
export async function clearDeliveries(projectId: string): Promise<void> {
  return (await backend()).clearDeliveries(projectId);
}
