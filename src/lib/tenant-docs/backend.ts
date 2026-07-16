/** A generic per-tenant *document* backend for the non-campaign stores that hold
 *  real user state — the keyword-research library (keywords/store), the saved
 *  winning-patterns library (patterns/store) and the social posts + inbox
 *  (social/store). It is the sibling of the campaign-data backend
 *  (src/lib/campaigns/store/backend.ts, table `campaign_docs`): the exact same
 *  seam pattern — a thin document interface with a LOCAL_DB-vs-Firestore
 *  dispatcher — applied to the four collections those stores own, so they work
 *  fully offline instead of hard-500ing when Firestore is unreachable.
 *
 *  Two implementations sit behind {@link tenantDocs}:
 *   - `./firestore` — the production backend; every method reproduces the EXACT
 *      query the stores issued before this seam existed (same collection/doc paths,
 *      same where/orderBy/limit, same set-merge / add / transaction / batch
 *      semantics), so the Firestore path is byte-identical.
 *   - `./local` — a node:sqlite twin (table `tenant_docs`, migration v17) selected
 *      under LOCAL_DB. Firebase-free by construction (it only imports getDb).
 *
 *  The dynamic import means firebase-admin is only pulled in when LOCAL_DB is off —
 *  the local path never imports it (matching local-mode.ts's contract). Domain
 *  logic (id minting, slicing, sample seeding, period filtering) stays in the store
 *  files; only raw document access dispatches here, so the two backends can never
 *  disagree on it. Server-only.
 *
 *  Scope note: this backend covers the collections `keywordLists`, `patterns`,
 *  `social_posts`, `social_messages`. Patterns' AUTO-mined library (extract.ts →
 *  campaign data) is deliberately OUT of scope — it reads the campaigns tree and
 *  may still 500 offline; only the tenant's SAVED pattern docs route through here. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";

/** A stored document's fields. Aliased to Firestore's ambient `DocumentData` (a
 *  type-only reference — never a runtime import, so the local backend stays
 *  firebase-free) so the store call sites keep their exact prior typing. */
export type DocData = FirebaseFirestore.DocumentData;

export type OrderDir = "asc" | "desc";

/** A document paired with its id. The id is load-bearing: every list/query caller
 *  maps `{ id, ...data }`, and the social/patterns delete + reply paths need it. */
export interface IdedDoc {
  id: string;
  data: DocData;
}

/** The minimal per-tenant document surface these three stores need. `collection`
 *  is a sub-collection name under `tenants/{tenant}`. */
export interface TenantDocs {
  /** one doc, or undefined when absent (Firestore: `!snap.exists`). */
  getDoc(tenant: string, collection: string, id: string): Promise<DocData | undefined>;
  /** set one doc; `merge:true` deep-merges (default: full overwrite). */
  setDoc(
    tenant: string,
    collection: string,
    id: string,
    data: DocData,
    opts?: { merge?: boolean }
  ): Promise<void>;
  /** append a doc under an auto-generated id (Firestore `.add`); returns the id. */
  addDoc(tenant: string, collection: string, data: DocData): Promise<string>;
  /** delete a doc (a delete of a missing doc is a no-op — the caller checks
   *  existence via getDoc first when it needs to report whether it existed). */
  deleteDoc(tenant: string, collection: string, id: string): Promise<void>;
  /** the collection's docs, optionally ordered by a stored field and/or capped. */
  listDocs(
    tenant: string,
    collection: string,
    opts?: { orderBy?: { field: string; dir: OrderDir }; limit?: number }
  ): Promise<IdedDoc[]>;
  /** single-field equality query (auto-indexed in Firestore). */
  queryEq(tenant: string, collection: string, field: string, value: string): Promise<IdedDoc[]>;
  /** atomically set many docs by explicit id (Firestore batch) — the inbox seed. */
  batchSet(
    tenant: string,
    collection: string,
    docs: Array<{ id: string; data: DocData }>
  ): Promise<void>;
  /** atomically merge-set `patch` onto a doc ONLY when `guard.field === guard.equals`;
   *  returns true for the writer that won the claim, false if the doc is missing or
   *  the guard no longer holds (Firestore transaction) — the scheduled-post claim. */
  compareAndSet(
    tenant: string,
    collection: string,
    id: string,
    guard: { field: string; equals: string },
    patch: DocData
  ): Promise<boolean>;
}

let cached: Promise<TenantDocs> | null = null;

/** The active backend, resolved once. Under LOCAL_DB it is the node:sqlite twin;
 *  otherwise the Firestore backend. */
export function tenantDocs(): Promise<TenantDocs> {
  if (!cached) {
    cached = LOCAL_DB
      ? import("./local").then((m) => m.localTenantDocs)
      : import("./firestore").then((m) => m.firestoreTenantDocs);
  }
  return cached;
}
