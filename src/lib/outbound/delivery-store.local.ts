/** Webhook delivery log — LOCAL node:sqlite backend (table `webhook_deliveries`,
 *  DDL + migration in src/lib/db.ts). One ROW per delivery; the queried fields
 *  (`status`, `next_at`, `created_at`) are real columns so the retry sweep is an
 *  indexed range read rather than a JSON scan, while the full record stays in `data`.
 *  Server-only. Mirrors the Firestore backend's interface exactly. */
import { getDb } from "@/lib/db";
import { DELIVERY_LOG_CAP, isClaimable, type Delivery } from "./types";

interface DataRow {
  data: string;
}

/** A corrupt blob is skipped, never allowed to break a sweep or a page render. */
function parseAll(rows: DataRow[]): Delivery[] {
  const out: Delivery[] = [];
  for (const r of rows) {
    try {
      const v = JSON.parse(r.data) as Delivery;
      if (v && typeof v.id === "string") out.push(v);
    } catch {
      /* skip */
    }
  }
  return out;
}

function write(d: Delivery): void {
  getDb()
    .prepare(
      `INSERT INTO webhook_deliveries (project_id, id, status, next_at, created_at, data)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (project_id, id) DO UPDATE SET
         status = excluded.status,
         next_at = excluded.next_at,
         created_at = excluded.created_at,
         data = excluded.data`
    )
    .run(d.projectId, d.id, d.status, d.nextAt, d.createdAt, JSON.stringify(d));
}

export async function appendDelivery(delivery: Delivery): Promise<void> {
  const db = getDb();
  write(delivery);
  // Evict the oldest beyond the cap. Ordered by (created_at, id) so the tiebreak is
  // deterministic when two deliveries share a millisecond — otherwise the eviction
  // set is nondeterministic and a test can flake on which row survived.
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM webhook_deliveries WHERE project_id = ?")
    .get(delivery.projectId) as { n: number } | undefined;
  const evict = (row?.n ?? 0) - DELIVERY_LOG_CAP;
  if (evict > 0) {
    db.prepare(
      `DELETE FROM webhook_deliveries
        WHERE project_id = ? AND id IN (
          SELECT id FROM webhook_deliveries WHERE project_id = ?
           ORDER BY created_at ASC, id ASC LIMIT ?)`
    ).run(delivery.projectId, delivery.projectId, evict);
  }
}

export async function updateDelivery(
  projectId: string,
  id: string,
  patch: Partial<Delivery>
): Promise<void> {
  const row = getDb()
    .prepare("SELECT data FROM webhook_deliveries WHERE project_id = ? AND id = ?")
    .get(projectId, id) as DataRow | undefined;
  const current = row ? parseAll([row])[0] : undefined;
  if (!current) return; // evicted mid-flight — a no-op, never an error
  write({ ...current, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() });
}

/** Read one row. Callers inside a transaction get the committed-or-own view. */
function readOne(projectId: string, id: string): Delivery | undefined {
  const row = getDb()
    .prepare("SELECT data FROM webhook_deliveries WHERE project_id = ? AND id = ?")
    .get(projectId, id) as DataRow | undefined;
  return row ? parseAll([row])[0] : undefined;
}

/** `BEGIN IMMEDIATE; read; check; write; COMMIT` — the tenant-docs compareAndSet
 *  shape (src/lib/tenant-docs/local.ts), with the write lock taken BEFORE the read so
 *  a second process cannot interleave between the check and the write. */
function conditionally(apply: () => boolean): boolean {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const won = apply();
    db.exec("COMMIT");
    return won;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* no active transaction to roll back */
    }
    throw err;
  }
}

export async function claimDelivery(
  projectId: string,
  id: string,
  holder: string,
  leaseUntil: string,
  now: Date
): Promise<boolean> {
  return conditionally(() => {
    const cur = readOne(projectId, id);
    if (!cur || !isClaimable(cur, now.toISOString())) return false;
    write({
      ...cur,
      status: "sending",
      attempts: cur.attempts + 1,
      nextAt: leaseUntil,
      claim: { holder, until: leaseUntil },
      updatedAt: now.toISOString(),
    });
    return true;
  });
}

export async function completeDelivery(
  projectId: string,
  id: string,
  holder: string,
  patch: Partial<Delivery>
): Promise<boolean> {
  return conditionally(() => {
    const cur = readOne(projectId, id);
    if (!cur || cur.status !== "sending" || cur.claim?.holder !== holder) return false;
    // JSON.stringify drops an `undefined` field, so a cleared lastError/claim is gone.
    write({
      ...cur,
      ...patch,
      claim: undefined,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    });
    return true;
  });
}

export async function listDeliveries(projectId: string, limit = 50): Promise<Delivery[]> {
  const rows = getDb()
    .prepare(
      `SELECT data FROM webhook_deliveries WHERE project_id = ?
        ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .all(projectId, limit) as unknown as DataRow[];
  return parseAll(rows);
}

export async function listPendingDeliveries(now: Date, limit = 100): Promise<Delivery[]> {
  const rows = getDb()
    .prepare(
      `SELECT data FROM webhook_deliveries
        WHERE status IN ('pending', 'sending') AND next_at IS NOT NULL AND next_at <= ?
        ORDER BY next_at ASC LIMIT ?`
    )
    .all(now.toISOString(), limit) as unknown as DataRow[];
  return parseAll(rows);
}

export async function clearDeliveries(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM webhook_deliveries WHERE project_id = ?").run(projectId);
}
