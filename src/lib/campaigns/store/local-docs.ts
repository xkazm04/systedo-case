/** The LOCAL node:sqlite implementation of {@link TenantDocStore} (table
 *  `campaign_docs`, DDL + migration v16 in src/lib/db.ts). Selected by the
 *  dispatcher when LOCAL_DB is on, so the four campaign-data stores — and thus the
 *  whole Výkon surface — work fully offline. Firebase-free by construction (it only
 *  imports getDb), matching local-mode.ts's contract. Server-only.
 *
 *  Storage model: one row per (tenant, collection, doc_id) with the document's
 *  fields as a JSON `data` blob, mirroring a Firestore document under
 *  `tenants/{tenant}/{collection}/{doc_id}`. The tenant ROOT doc is stored under
 *  the reserved collection/id `__root__`. `data.period` is mirrored into an indexed
 *  `period` column so the hot equality queries stay indexed (see queryEq). */
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { DocData, TenantBatch, TenantDocStore } from "./backend";

/** Reserved (collection, doc_id) the tenant ROOT doc lives under. `__` cannot
 *  collide with a real period-keyed id or a Firestore-style collection name used
 *  by the four stores ("campaigns"/"series"/"reports"/"snapshots"). */
const ROOT = "__root__";

interface Row {
  doc_id: string;
  data: string;
}

/** SQLite cannot bind a sort DIRECTION or a WHERE shape as a parameter, so the two
 *  ordered reads below used to interpolate them into the statement text. Nothing
 *  caller-supplied ever reached that interpolation — both values came from a ternary
 *  two lines above it — but "safe because of a nearby ternary" is a property a reader
 *  has to re-derive, and it is the shape `sql-template-interpolation` (scripts/sast.mjs)
 *  exists to refuse. The statements are enumerated instead: every SQL string this
 *  module can execute is a complete constant, chosen by a lookup, so the question
 *  "what SQL can run here?" is answered by reading this block. */
type SqlDir = "ASC" | "DESC";

/** listDocs — one complete statement per sort direction. */
const LIST_DOCS_SQL: Record<SqlDir, string> = {
  ASC:
    "SELECT data FROM campaign_docs WHERE tenant = ? AND collection = ? " +
    "ORDER BY json_extract(data, ?) ASC, rowid ASC",
  DESC:
    "SELECT data FROM campaign_docs WHERE tenant = ? AND collection = ? " +
    "ORDER BY json_extract(data, ?) DESC, rowid DESC",
};

/** idRange — the four (gte?, lt?) shapes × the two directions. Parameter order is
 *  tenant, collection, [gte], [lt], limit in every one of them, which is the order
 *  `idRange` pushes them in. */
type RangeShape = "plain" | "gte" | "lt" | "both";

const ID_RANGE_SQL: Record<RangeShape, Record<SqlDir, string>> = {
  plain: {
    ASC: "SELECT doc_id, data FROM campaign_docs WHERE tenant = ? AND collection = ? ORDER BY doc_id ASC LIMIT ?",
    DESC: "SELECT doc_id, data FROM campaign_docs WHERE tenant = ? AND collection = ? ORDER BY doc_id DESC LIMIT ?",
  },
  gte: {
    ASC:
      "SELECT doc_id, data FROM campaign_docs WHERE tenant = ? AND collection = ? AND doc_id >= ? " +
      "ORDER BY doc_id ASC LIMIT ?",
    DESC:
      "SELECT doc_id, data FROM campaign_docs WHERE tenant = ? AND collection = ? AND doc_id >= ? " +
      "ORDER BY doc_id DESC LIMIT ?",
  },
  lt: {
    ASC:
      "SELECT doc_id, data FROM campaign_docs WHERE tenant = ? AND collection = ? AND doc_id < ? " +
      "ORDER BY doc_id ASC LIMIT ?",
    DESC:
      "SELECT doc_id, data FROM campaign_docs WHERE tenant = ? AND collection = ? AND doc_id < ? " +
      "ORDER BY doc_id DESC LIMIT ?",
  },
  both: {
    ASC:
      "SELECT doc_id, data FROM campaign_docs WHERE tenant = ? AND collection = ? AND doc_id >= ? AND doc_id < ? " +
      "ORDER BY doc_id ASC LIMIT ?",
    DESC:
      "SELECT doc_id, data FROM campaign_docs WHERE tenant = ? AND collection = ? AND doc_id >= ? AND doc_id < ? " +
      "ORDER BY doc_id DESC LIMIT ?",
  },
};

const nowIso = () => new Date().toISOString();

/** The indexed period mirror: only a string `period` field is columned. */
function periodOf(data: DocData): string | null {
  return typeof data.period === "string" ? data.period : null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge `incoming` onto `base`, matching Firestore `set(…, {merge:true})`:
 *  nested maps merge recursively (so syncedByPeriod keeps other periods' entries),
 *  everything else — scalars and ARRAYS — replaces. `undefined` values are skipped
 *  (Firestore rejects them; the stores never send them). */
function deepMerge(base: DocData, incoming: DocData): DocData {
  const out: DocData = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k] as DocData, v) : v;
  }
  return out;
}

function rawGet(tenant: string, collection: string, docId: string): DocData | undefined {
  const r = getDb()
    .prepare("SELECT data FROM campaign_docs WHERE tenant = ? AND collection = ? AND doc_id = ?")
    .get(tenant, collection, docId) as { data: string } | undefined;
  return r ? (JSON.parse(r.data) as DocData) : undefined;
}

function rawSet(tenant: string, collection: string, docId: string, data: DocData): void {
  getDb()
    .prepare(
      `INSERT INTO campaign_docs (tenant, collection, doc_id, data, period, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (tenant, collection, doc_id) DO UPDATE SET
         data = excluded.data, period = excluded.period, updated_at = excluded.updated_at`
    )
    .run(tenant, collection, docId, JSON.stringify(data), periodOf(data), nowIso());
}

function rawSetMerge(tenant: string, collection: string, docId: string, data: DocData): void {
  rawSet(tenant, collection, docId, deepMerge(rawGet(tenant, collection, docId) ?? {}, data));
}

function rawDelete(tenant: string, collection: string, docId: string): void {
  getDb()
    .prepare("DELETE FROM campaign_docs WHERE tenant = ? AND collection = ? AND doc_id = ?")
    .run(tenant, collection, docId);
}

/** Bulk-delete EVERY row of one project's tenant TREE — the sqlite counterpart of
 *  the Firestore `recursiveDelete(tenants/{key})` the project-deletion cascade runs.
 *  The interface above only exposes per-doc deletes, so without this a deleted
 *  project's synced campaigns / series / reports / snapshots survived forever
 *  locally.
 *
 *  `base` is the account-AGNOSTIC tenant key (`buildTenantKey(userId, projectId)`).
 *  A project also writes under account-scoped keys `{base}_{customerId}` (and the
 *  Sklik `{base}_sklik`), so the sweep takes the base row set PLUS every
 *  `{base}_…` descendant. That is strictly MORE complete than the cloud path's
 *  enumeration of currently-connected accounts (it also reaches data left behind by
 *  an account the user has since disconnected) and needs no Firestore-only
 *  connection read, which the LOCAL_DB path must not make.
 *
 *  Prefix matching is done with `substr`, not `LIKE` — a tenant key is full of `_`,
 *  which `LIKE` treats as a single-character wildcard. The `_proj_` guard keeps the
 *  sweep inside ONE project: a userId that itself contained `…_proj_…` could
 *  otherwise make one project's base key a prefix of another project's key.
 *  Returns the number of rows removed. Not part of {@link TenantDocStore} — the
 *  Firestore side needs no counterpart (recursiveDelete already covers it), so this
 *  stays a LOCAL_DB-only export the cascade imports directly. */
export function deleteAllForTenant(base: string): number {
  const n = base.length;
  const r = getDb()
    .prepare(
      `DELETE FROM campaign_docs
        WHERE tenant = ?
           OR (substr(tenant, 1, ?) = ?
               AND substr(tenant, ?, 1) = '_'
               AND instr(substr(tenant, ?), '_proj_') = 0)`
    )
    .run(base, n, base, n + 1, n + 1);
  return Number(r.changes ?? 0);
}

export const localTenantStore: TenantDocStore = {
  async getRoot(tenant) {
    return rawGet(tenant, ROOT, ROOT);
  },

  async setRoot(tenant, data, opts) {
    if (opts.merge) rawSetMerge(tenant, ROOT, ROOT, data);
    else rawSet(tenant, ROOT, ROOT, data);
  },

  async getDoc(tenant, collection, docId) {
    return rawGet(tenant, collection, docId);
  },

  async setDoc(tenant, collection, docId, data, opts) {
    if (opts?.merge) rawSetMerge(tenant, collection, docId, data);
    else rawSet(tenant, collection, docId, data);
  },

  async addDoc(tenant, collection, data) {
    rawSet(tenant, collection, randomUUID(), data);
  },

  async listDocs(tenant, collection, orderBy) {
    const dir: SqlDir = orderBy.dir === "desc" ? "DESC" : "ASC";
    // json_extract gives numeric affinity for a number field (position) and text
    // for an ISO string (created_at) → same ordering a Firestore orderBy yields.
    // rowid tie-breaks equal keys (two saves in the same millisecond share an ISO
    // createdAt) so "newest first" stays deterministic: later insert wins.
    const rows = getDb()
      .prepare(LIST_DOCS_SQL[dir])
      .all(tenant, collection, `$.${orderBy.field}`) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as DocData);
  },

  async queryEq(tenant, collection, field, value) {
    const db = getDb();
    // `period` is the columned + indexed hot path (per-sync stale-clear, per-period
    // report lookups); any other field (report input_hash) falls back to a
    // json_extract scan over the already-tiny match set.
    const rows = (
      field === "period"
        ? db
            .prepare(
              "SELECT doc_id, data FROM campaign_docs WHERE tenant = ? AND collection = ? AND period = ?"
            )
            .all(tenant, collection, value)
        : db
            .prepare(
              "SELECT doc_id, data FROM campaign_docs WHERE tenant = ? AND collection = ? AND json_extract(data, ?) = ?"
            )
            .all(tenant, collection, `$.${field}`, value)
    ) as unknown as Row[];
    return rows.map((r) => ({ id: r.doc_id, data: JSON.parse(r.data) as DocData }));
  },

  async idRange(tenant, collection, opts) {
    const dir: SqlDir = opts.dir === "desc" ? "DESC" : "ASC";
    const params: (string | number)[] = [tenant, collection];
    if (opts.gte !== undefined) params.push(opts.gte);
    if (opts.lt !== undefined) params.push(opts.lt);
    params.push(opts.limit);
    // The bounds decide WHICH of the four statements runs; their values are still
    // bound, in the order they were pushed above.
    let shape: RangeShape = "plain";
    if (opts.gte !== undefined && opts.lt !== undefined) shape = "both";
    else if (opts.gte !== undefined) shape = "gte";
    else if (opts.lt !== undefined) shape = "lt";
    // Binary (byte-wise) TEXT collation on doc_id matches Firestore's document-id
    // UTF-8 byte ordering for the ASCII + PUA () ids these stores build.
    const rows = getDb()
      .prepare(ID_RANGE_SQL[shape][dir])
      .all(...params) as unknown as Row[];
    return rows.map((r) => ({ id: r.doc_id, data: JSON.parse(r.data) as DocData }));
  },

  batch(tenant): TenantBatch {
    const ops: Array<() => void> = [];
    return {
      setRoot(data, opts) {
        ops.push(() =>
          opts.merge ? rawSetMerge(tenant, ROOT, ROOT, data) : rawSet(tenant, ROOT, ROOT, data)
        );
      },
      set(collection, docId, data) {
        ops.push(() => rawSet(tenant, collection, docId, data));
      },
      delete(collection, docId) {
        ops.push(() => rawDelete(tenant, collection, docId));
      },
      async commit() {
        const db = getDb();
        db.exec("BEGIN");
        try {
          for (const op of ops) op();
          db.exec("COMMIT");
        } catch (err) {
          try {
            db.exec("ROLLBACK");
          } catch {
            /* no active transaction to roll back */
          }
          throw err;
        }
      },
    };
  },
};
