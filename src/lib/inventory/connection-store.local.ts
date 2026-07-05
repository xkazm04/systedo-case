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
  connected_at: string;
  last_sync_at: string | null;
}

interface OwnedRow extends Row {
  user_id: string;
  project_id: string;
}

function toStored(r: Row): StoredConnection {
  return {
    provider: r.provider,
    inventoryId: r.inventory_id || undefined,
    tokenEnc: r.token_enc || undefined,
    connectedAt: r.connected_at,
    lastSyncAt: r.last_sync_at || undefined,
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
         (user_id, project_id, provider, inventory_id, token_enc, connected_at, last_sync_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, project_id) DO UPDATE SET
         provider = excluded.provider,
         inventory_id = excluded.inventory_id,
         token_enc = excluded.token_enc,
         connected_at = excluded.connected_at,
         last_sync_at = excluded.last_sync_at`
    )
    .run(
      userId,
      projectId,
      conn.provider,
      conn.inventoryId ?? null,
      conn.tokenEnc ?? null,
      conn.connectedAt,
      conn.lastSyncAt ?? null
    );
}

export async function deleteConnection(userId: string, projectId: string): Promise<void> {
  getDb()
    .prepare("DELETE FROM warehouse_connection WHERE user_id = ? AND project_id = ?")
    .run(userId, projectId);
}
