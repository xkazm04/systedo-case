/** The LOCAL node:sqlite implementation of {@link TenantDocs} (table `tenant_docs`,
 *  DDL + migration v17 in src/lib/db.ts). Selected by the dispatcher when LOCAL_DB
 *  is on, so the keyword / pattern / social stores work fully offline. Firebase-free
 *  by construction (it only imports getDb), matching local-mode.ts's contract.
 *  Server-only.
 *
 *  Storage model: one row per (tenant, collection, doc_id) with the document's
 *  fields as a JSON `data` blob, mirroring a Firestore document under
 *  `tenants/{tenant}/{collection}/{doc_id}`. Ordered reads (`listDocs` orderBy) and
 *  equality queries use `json_extract(data, '$.field')`, so the twin needs no
 *  per-field columns — the same generic shape as campaign_docs, minus its indexed
 *  `period` mirror (none of these collections query by period). The per-tenant,
 *  per-collection sets here are small (one tenant's saved lists / patterns / recent
 *  posts), so a JSON-scan read is well within budget. */
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { DocData, TenantDocs } from "./backend";

interface Row {
  doc_id: string;
  data: string;
}

const nowIso = () => new Date().toISOString();

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge `incoming` onto `base`, matching Firestore `set(…, {merge:true})`:
 *  nested maps merge recursively, everything else — scalars and ARRAYS — replaces.
 *  `undefined` values are skipped (Firestore rejects them; the stores never send
 *  them). Mirrors campaigns/store/local-docs.ts deepMerge. */
function deepMerge(base: DocData, incoming: DocData): DocData {
  const out: DocData = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k] as DocData, v) : v;
  }
  return out;
}

function rawGet(tenant: string, collection: string, id: string): DocData | undefined {
  const r = getDb()
    .prepare("SELECT data FROM tenant_docs WHERE tenant = ? AND collection = ? AND doc_id = ?")
    .get(tenant, collection, id) as { data: string } | undefined;
  return r ? (JSON.parse(r.data) as DocData) : undefined;
}

function rawSet(tenant: string, collection: string, id: string, data: DocData): void {
  getDb()
    .prepare(
      `INSERT INTO tenant_docs (tenant, collection, doc_id, data, updated_at)
         VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (tenant, collection, doc_id) DO UPDATE SET
         data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(tenant, collection, id, JSON.stringify(data), nowIso());
}

function rawSetMerge(tenant: string, collection: string, id: string, data: DocData): void {
  rawSet(tenant, collection, id, deepMerge(rawGet(tenant, collection, id) ?? {}, data));
}

/** Bulk-delete EVERY row of one project's tenant TREE — the sqlite counterpart of
 *  the Firestore `recursiveDelete(tenants/{key})` the project-deletion cascade runs.
 *  {@link TenantDocs} only exposes a per-doc delete, so without this a deleted
 *  project's saved keyword lists, winning-pattern library and social posts + inbox
 *  survived forever locally.
 *
 *  `base` is the account-agnostic tenant key; the sweep also takes every
 *  `{base}_{customerId}` descendant. Same `substr`-not-`LIKE` prefix match and same
 *  `_proj_` one-project guard as the campaign_docs twin
 *  (src/lib/campaigns/store/local-docs.ts) — see there for the full rationale.
 *  Returns the number of rows removed. LOCAL_DB-only (the Firestore side needs no
 *  counterpart), so it is deliberately not part of the shared interface. */
export function deleteAllForTenant(base: string): number {
  const n = base.length;
  const r = getDb()
    .prepare(
      `DELETE FROM tenant_docs
        WHERE tenant = ?
           OR (substr(tenant, 1, ?) = ?
               AND substr(tenant, ?, 1) = '_'
               AND instr(substr(tenant, ?), '_proj_') = 0)`
    )
    .run(base, n, base, n + 1, n + 1);
  return Number(r.changes ?? 0);
}

export const localTenantDocs: TenantDocs = {
  async getDoc(tenant, collection, id) {
    return rawGet(tenant, collection, id);
  },

  async setDoc(tenant, collection, id, data, opts) {
    if (opts?.merge) rawSetMerge(tenant, collection, id, data);
    else rawSet(tenant, collection, id, data);
  },

  async addDoc(tenant, collection, data) {
    const id = randomUUID();
    rawSet(tenant, collection, id, data);
    return id;
  },

  async deleteDoc(tenant, collection, id) {
    getDb()
      .prepare("DELETE FROM tenant_docs WHERE tenant = ? AND collection = ? AND doc_id = ?")
      .run(tenant, collection, id);
  },

  async listDocs(tenant, collection, opts) {
    const params: (string | number)[] = [tenant, collection];
    let sql = "SELECT doc_id, data FROM tenant_docs WHERE tenant = ? AND collection = ?";
    if (opts?.orderBy) {
      // json_extract gives text affinity for an ISO string (createdAt/receivedAt) →
      // the same lexicographic ordering a Firestore orderBy on that field yields.
      sql += ` ORDER BY json_extract(data, ?) ${opts.orderBy.dir === "desc" ? "DESC" : "ASC"}`;
      params.push(`$.${opts.orderBy.field}`);
    }
    if (opts?.limit !== undefined) {
      sql += " LIMIT ?";
      params.push(opts.limit);
    }
    const rows = getDb().prepare(sql).all(...params) as unknown as Row[];
    return rows.map((r) => ({ id: r.doc_id, data: JSON.parse(r.data) as DocData }));
  },

  async queryEq(tenant, collection, field, value) {
    const rows = getDb()
      .prepare(
        "SELECT doc_id, data FROM tenant_docs WHERE tenant = ? AND collection = ? AND json_extract(data, ?) = ?"
      )
      .all(tenant, collection, `$.${field}`, value) as unknown as Row[];
    return rows.map((r) => ({ id: r.doc_id, data: JSON.parse(r.data) as DocData }));
  },

  async batchSet(tenant, collection, docs) {
    const db = getDb();
    db.exec("BEGIN");
    try {
      for (const { id, data } of docs) rawSet(tenant, collection, id, data);
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

  async compareAndSet(tenant, collection, id, guard, patch) {
    const db = getDb();
    db.exec("BEGIN");
    try {
      const cur = rawGet(tenant, collection, id);
      if (!cur || cur[guard.field] !== guard.equals) {
        db.exec("COMMIT");
        return false;
      }
      rawSet(tenant, collection, id, deepMerge(cur, patch));
      db.exec("COMMIT");
      return true;
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
