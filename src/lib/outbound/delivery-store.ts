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

/** One delivery of THIS project, or null. Addressed by `(projectId, id)`, never by id
 *  alone: a route resolves `projectId` through `requireOwnedProject` first, so another
 *  project's delivery id reads as absent (ADR-0002) — the redeliver verb's scoping. */
export async function getDelivery(projectId: string, id: string): Promise<Delivery | null> {
  return (await backend()).getDelivery(projectId, id);
}

/** This project's log, NEWEST FIRST, bounded. */
export async function listDeliveries(projectId: string, limit = 50): Promise<Delivery[]> {
  return (await backend()).listDeliveries(projectId, limit);
}

/** Every project's deliveries that are DUE (`nextAt <= now`) and either `pending` or
 *  `sending` with a lapsed lease (a claim whose holder died) — the drain's work
 *  list, bounded so one tick can never run unboundedly long. */
export async function listPendingDeliveries(now: Date, limit = 100): Promise<Delivery[]> {
  return (await backend()).listPendingDeliveries(now, limit);
}

/** CLAIM one delivery for sending: a single conditional write (a transaction on both
 *  backends) that succeeds only if the row is still due — `pending`, or `sending`
 *  with a lease that lapsed — at `now`. The winner's row becomes `sending` with
 *  `claim = { holder, until: leaseUntil }`, `nextAt = leaseUntil` and one more
 *  attempt counted (a holder that dies mid-send has used an attempt, so a crash loop
 *  still reaches the give-up cap). Resolves true for exactly one of any number of
 *  concurrent claimers — the election IS the conditional write. */
export async function claimDelivery(
  projectId: string,
  id: string,
  holder: string,
  leaseUntil: string,
  now: Date
): Promise<boolean> {
  return (await backend()).claimDelivery(projectId, id, holder, leaseUntil, now);
}

/** Settle a claimed delivery with `patch`, but ONLY if `holder` still holds it (the
 *  row is `sending` and names it). A holder that lost the row — to a faster claimer,
 *  or to a reaper after its lease lapsed — gets false and writes nothing. The claim
 *  is cleared, and a field the patch sets to `undefined` is REMOVED on both backends. */
export async function completeDelivery(
  projectId: string,
  id: string,
  holder: string,
  patch: Partial<Delivery>
): Promise<boolean> {
  return (await backend()).completeDelivery(projectId, id, holder, patch);
}

/** Drop a project's whole delivery log — the project-delete cascade + the settings
 *  "clear log" action. */
export async function clearDeliveries(projectId: string): Promise<void> {
  return (await backend()).clearDeliveries(projectId);
}
