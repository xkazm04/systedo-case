/** Per-project warehouse/ERP connection store — backend dispatcher (local node:sqlite
 *  when LOCAL_DB, else Firestore). Persists which provider a project is connected to
 *  plus its ENCRYPTED API token, so re-syncing needs no re-entry of the token. The
 *  token blob never leaves the server decrypted except in the sync path. Server-only. */
import { LOCAL_DB } from "@/lib/local-mode";

/** The stored record — `tokenEnc` is the AES-GCM blob from token-crypto.ts. */
export interface StoredConnection {
  provider: string;
  inventoryId?: string;
  tokenEnc?: string;
  connectedAt: string;
  lastSyncAt?: string;
}

/** Client-safe view — no token bytes, just whether one is stored. */
export interface PublicConnection {
  provider: string;
  inventoryId?: string;
  hasToken: boolean;
  connectedAt: string;
  lastSyncAt?: string;
}

/** A stored connection with its owner keys — for the cron re-sync sweep. */
export interface OwnedConnection {
  userId: string;
  projectId: string;
  connection: StoredConnection;
}

/** Strip the token from a stored connection for the client. */
export function publicConnection(c: StoredConnection): PublicConnection {
  return {
    provider: c.provider,
    inventoryId: c.inventoryId,
    hasToken: Boolean(c.tokenEnc),
    connectedAt: c.connectedAt,
    lastSyncAt: c.lastSyncAt,
  };
}

function backend() {
  return LOCAL_DB ? import("./connection-store.local") : import("./connection-store.firestore");
}

export async function getConnection(userId: string, projectId: string): Promise<StoredConnection | null> {
  return (await backend()).getConnection(userId, projectId);
}

export async function saveConnection(userId: string, projectId: string, conn: StoredConnection): Promise<void> {
  return (await backend()).saveConnection(userId, projectId, conn);
}

export async function deleteConnection(userId: string, projectId: string): Promise<void> {
  return (await backend()).deleteConnection(userId, projectId);
}

/** Every project's connection across all users — the cron re-sync's work list. */
export async function listAllConnections(): Promise<OwnedConnection[]> {
  return (await backend()).listAllConnections();
}
