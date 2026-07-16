/** The storage backend behind the four campaign-data stores (campaigns, series,
 *  reports, snapshots) and the tenant-root reads they share. A thin, generic
 *  per-tenant *document* interface: get / set(-merge) / add / delete / list /
 *  equality-query / doc-id-range / atomic-batch — exactly the minimal Firestore
 *  surface those four stores actually use, and nothing more.
 *
 *  Two implementations sit behind {@link tenantStore}:
 *   - `./backend.firestore` — the production Firestore backend. It keeps the EXACT
 *      queries the stores issued before this seam existed (same reads, same order,
 *      same where/orderBy/limit), so the Firestore path is byte-identical.
 *   - `./local-docs` — a node:sqlite twin (table `campaign_docs`, migration v16)
 *      selected under LOCAL_DB, so the whole Výkon surface works fully offline
 *      instead of hard-500ing when Firestore is unreachable.
 *
 *  The higher-level period / legacy-attribution logic stays in the store files;
 *  only the raw document access dispatches here — so there is exactly one copy of
 *  the semantics and the two backends can never disagree on them. Server-only.
 *
 *  Scope note: only the four campaign-data concerns route through this backend.
 *  The alerts / changeSets / mutations / activity / patterns sub-collections are
 *  deliberately OUT of scope — they still import firestore directly and may 500
 *  offline; their best-effort writers (e.g. recordActivity) already swallow that. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";

/** A stored document's fields. Aliased to Firestore's ambient `DocumentData`
 *  (a type-only reference — never a runtime import, so the local backend stays
 *  firebase-free) so the store call sites keep their exact prior typing. */
export type DocData = FirebaseFirestore.DocumentData;

export type OrderDir = "asc" | "desc";

/** A queried document paired with its id. The id is load-bearing: the per-sync
 *  campaign stale-clear deletes queried docs by id, and the snapshot reader tells
 *  a legacy bare-ISO snapshot from a period-keyed one by its id. */
export interface IdedDoc {
  id: string;
  data: DocData;
}

/** An atomic multi-write mirroring the single Firestore batch the sync upsert
 *  commits: a merge-set on the tenant root doc plus plain sets / deletes across
 *  the campaigns + snapshots sub-collections, all-or-nothing. */
export interface TenantBatch {
  /** set the tenant ROOT doc (merge:true deep-merges nested maps, e.g. syncedByPeriod). */
  setRoot(data: DocData, opts: { merge: boolean }): void;
  /** plain set (full overwrite) of a sub-collection doc. */
  set(collection: string, docId: string, data: DocData): void;
  /** delete a sub-collection doc (a delete of a missing doc is a no-op). */
  delete(collection: string, docId: string): void;
  commit(): Promise<void>;
}

/** The minimal per-tenant document surface the four campaign-data stores need.
 *  `collection` is a sub-collection name under `tenants/{tenant}`; the tenant root
 *  doc has its own get/set/batch entry points. */
export interface TenantDocStore {
  /** the tenant root doc (`tenants/{tenant}`), or undefined before the first sync. */
  getRoot(tenant: string): Promise<DocData | undefined>;
  setRoot(tenant: string, data: DocData, opts: { merge: boolean }): Promise<void>;

  getDoc(tenant: string, collection: string, docId: string): Promise<DocData | undefined>;
  /** set one sub-collection doc; `merge:true` deep-merges (default: full overwrite). */
  setDoc(
    tenant: string,
    collection: string,
    docId: string,
    data: DocData,
    opts?: { merge?: boolean }
  ): Promise<void>;
  /** append a doc under an auto-generated id (Firestore `.add`). */
  addDoc(tenant: string, collection: string, data: DocData): Promise<void>;

  /** every doc of a sub-collection, ordered by a stored field. */
  listDocs(
    tenant: string,
    collection: string,
    orderBy: { field: string; dir: OrderDir }
  ): Promise<DocData[]>;
  /** single-field equality query (auto-indexed in Firestore). */
  queryEq(tenant: string, collection: string, field: string, value: string): Promise<IdedDoc[]>;
  /** the newest/oldest `limit` docs within a half-open document-id range
   *  `[gte, lt)`, ordered by document id — the period-keyed snapshot window. */
  idRange(
    tenant: string,
    collection: string,
    opts: { gte?: string; lt?: string; limit: number; dir: OrderDir }
  ): Promise<IdedDoc[]>;

  batch(tenant: string): TenantBatch;
}

let cached: Promise<TenantDocStore> | null = null;

/** The active backend, resolved once. Under LOCAL_DB it is the node:sqlite twin
 *  (so Výkon works offline); otherwise the Firestore backend. The dynamic import
 *  means firebase-admin is only ever pulled in when LOCAL_DB is off — the local
 *  path never imports it (matching local-mode.ts's contract). */
export function tenantStore(): Promise<TenantDocStore> {
  if (!cached) {
    cached = LOCAL_DB
      ? import("./local-docs").then((m) => m.localTenantStore)
      : import("./backend.firestore").then((m) => m.firestoreTenantStore);
  }
  return cached;
}
