/** The catalog change ledger — backend DISPATCHER. Local node:sqlite when LOCAL_DB
 *  is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB path never
 *  evaluates the Firestore module (the catalog/leads store shape).
 *
 *  ROW-BASED, unlike the catalog blob it describes (`catalog/store.ts`). A ledger is
 *  append-heavy and unbounded by nature: a blob would march toward Firestore's 1 MiB
 *  document cap and lose events to read-modify-write races between a cron warehouse
 *  re-sync and a UI save. One row/doc per event, capped at CATALOG_EVENT_CAP with the
 *  oldest evicted on append (the `lead_activities` rule).
 *
 *  Keying is Family B — `(userId, projectId)`, exactly like `project_catalog` — so a
 *  ledger row is unreachable across users by construction (ADR-0002). Server-only. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { CatalogEvent } from "./events";

export interface CatalogEventQuery {
  /** newest-first page size */
  limit?: number;
  /** restrict to one offering's history (`sku || id`) */
  key?: string;
}

function backend() {
  return LOCAL_DB ? import("./events-store.local") : import("./events-store.firestore");
}

/** Append a batch, idempotent by event id (re-appending the same batch updates in
 *  place, never duplicates), evicting the oldest rows beyond CATALOG_EVENT_CAP.
 *
 *  THROWS on a backend failure. The three write paths call this AFTER their save and
 *  swallow the error there — the ledger is an explanation of a write, never a
 *  precondition for one, so a ledger outage must not fail an import. */
export async function appendCatalogEvents(
  userId: string,
  projectId: string,
  events: CatalogEvent[]
): Promise<void> {
  if (events.length === 0) return;
  return (await backend()).appendCatalogEvents(userId, projectId, events);
}

/** The project's ledger, NEWEST FIRST, bounded. */
export async function listCatalogEvents(
  userId: string,
  projectId: string,
  query: CatalogEventQuery = {}
): Promise<CatalogEvent[]> {
  return (await backend()).listCatalogEvents(userId, projectId, query);
}

/** Drop the project's whole ledger. The project-delete cascade + the test-reset seam. */
export async function clearCatalogEvents(userId: string, projectId: string): Promise<void> {
  return (await backend()).clearCatalogEvents(userId, projectId);
}
