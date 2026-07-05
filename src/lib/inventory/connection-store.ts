/** Per-project warehouse/ERP connection store — backend dispatcher (local node:sqlite
 *  when LOCAL_DB, else Firestore). Persists which provider a project is connected to
 *  plus its ENCRYPTED API token, so re-syncing needs no re-entry of the token. The
 *  token blob never leaves the server decrypted except in the sync path. Server-only. */
import { LOCAL_DB } from "@/lib/local-mode";

/** The stored record — `tokenEnc` is the AES-GCM blob from token-crypto.ts; `config`
 *  holds the generic ERP adapter's endpoint/format/mapping (not secret — the token is
 *  the only secret and it lives, encrypted, in `tokenEnc`). `lastError`/`failCount`
 *  track sync health so the cron can alert on the healthy→failing transition. */
export interface StoredConnection {
  provider: string;
  inventoryId?: string;
  tokenEnc?: string;
  config?: Record<string, unknown>;
  connectedAt: string;
  /** last SUCCESSFUL sync (a failure leaves this untouched). */
  lastSyncAt?: string;
  /** last sync failure message; cleared on the next success. */
  lastError?: string;
  lastErrorAt?: string;
  /** consecutive failures; reset to 0 on success (drives transition-based alerting). */
  failCount?: number;
}

/** Client-safe view — no token bytes, just whether one is stored. `config` + the last
 *  error are safe to return (no credentials) so the UI can show status + edit config. */
export interface PublicConnection {
  provider: string;
  inventoryId?: string;
  hasToken: boolean;
  config?: Record<string, unknown>;
  connectedAt: string;
  lastSyncAt?: string;
  lastError?: string;
  lastErrorAt?: string;
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
    ...(c.config ? { config: c.config } : {}),
    connectedAt: c.connectedAt,
    lastSyncAt: c.lastSyncAt,
    ...(c.lastError ? { lastError: c.lastError, lastErrorAt: c.lastErrorAt } : {}),
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
