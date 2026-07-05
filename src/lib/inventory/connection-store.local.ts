/** Warehouse connection store — LOCAL node:sqlite backend (table `warehouse_connection`,
 *  DDL in src/lib/db.ts). Selected by the dispatcher when LOCAL_DB is on. Server-only.
 *  Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import { ensureLocalUser } from "@/lib/users/local";
import type { OwnedConnection, StoredConnection } from "./connection-store";

interface Row {
  provider: string;
  inventory_id: string | null;
  token_enc: string | null;
  config_json: string | null;
  connected_at: string;
  last_sync_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  fail_count: number | null;
}

interface OwnedRow extends Row {
  user_id: string;
  project_id: string;
}

function parseConfig(json: string | null): Record<string, unknown> | undefined {
  if (!json) return undefined;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function toStored(r: Row): StoredConnection {
  return {
    provider: r.provider,
    inventoryId: r.inventory_id || undefined,
    tokenEnc: r.token_enc || undefined,
    config: parseConfig(r.config_json),
    connectedAt: r.connected_at,
    lastSyncAt: r.last_sync_at || undefined,
    lastError: r.last_error || undefined,
    lastErrorAt: r.last_error_at || undefined,
    failCount: r.fail_count ?? undefined,
  };
}

export async function getConnection(userId: string, projectId: string): Promise<StoredConnection | null> {
  const r = getDb()
    .prepare("SELECT * FROM warehouse_connection WHERE user_id = ? AND project_id = ?")
    .get(userId, projectId) as Row | undefined;
  return r ? toStored(r) : null;
}

export async function listAllConnections(): Promise<OwnedConnection[]> {
  const rows = getDb()
    .prepare("SELECT * FROM warehouse_connection")
    .all() as unknown as OwnedRow[];
  return rows.map((r) => ({ userId: r.user_id, projectId: r.project_id, connection: toStored(r) }));
}

export async function saveConnection(userId: string, projectId: string, conn: StoredConnection): Promise<void> {
  ensureLocalUser(userId);
  getDb()
    .prepare(
      `INSERT INTO warehouse_connection
         (user_id, project_id, provider, inventory_id, token_enc, config_json, connected_at,
          last_sync_at, last_error, last_error_at, fail_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, project_id) DO UPDATE SET
         provider = excluded.provider,
         inventory_id = excluded.inventory_id,
         token_enc = excluded.token_enc,
         config_json = excluded.config_json,
         connected_at = excluded.connected_at,
         last_sync_at = excluded.last_sync_at,
         last_error = excluded.last_error,
         last_error_at = excluded.last_error_at,
         fail_count = excluded.fail_count`
    )
    .run(
      userId,
      projectId,
      conn.provider,
      conn.inventoryId ?? null,
      conn.tokenEnc ?? null,
      conn.config ? JSON.stringify(conn.config) : null,
      conn.connectedAt,
      conn.lastSyncAt ?? null,
      conn.lastError ?? null,
      conn.lastErrorAt ?? null,
      conn.failCount ?? null
    );
}

export async function deleteConnection(userId: string, projectId: string): Promise<void> {
  getDb()
    .prepare("DELETE FROM warehouse_connection WHERE user_id = ? AND project_id = ?")
    .run(userId, projectId);
}
