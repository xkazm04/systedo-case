/** Twin intake endpoints — LOCAL node:sqlite backend (WP W3-D). One row per token in
 *  `.data/systedo.db` (table `twin_inbound_tokens`, DDL + migration v32 in src/lib/db.ts):
 *  `token` is the primary key (the address space is global, not per-tenant) and
 *  `(user_id, project_id)` is the indexed owner pair behind the panel's list and the
 *  delete cascade. Selected when LOCAL_DB is on. Mirrors the Firestore backend exactly.
 *
 *  Reads are ordered by `token` before capping, because the Firestore twin's otherwise
 *  unordered query is ordered by `__name__` — which IS the token (ADR-0001's capped-read
 *  rule: both drivers must select the same rows). */
import { getDb } from "@/lib/db";
import { isTwinChannel, type TwinChannel } from "./types";
import { MAX_INBOUND_ENDPOINTS, type TwinInboundToken } from "./inbound-store";

interface TokenRow {
  token: string;
  user_id: string;
  project_id: string;
  channel: string;
  secret_enc: string;
  created_at: string;
}

/** A stored channel that is no longer in the closed union (a downgrade, a hand-edited
 *  row) degrades to `email` — the generic dialect — rather than widening TwinChannel
 *  with a value every label table would then miss. */
const toChannel = (v: string): TwinChannel => (isTwinChannel(v) ? v : "email");

const toToken = (r: TokenRow): TwinInboundToken => ({
  token: r.token,
  userId: r.user_id,
  projectId: r.project_id,
  channel: toChannel(r.channel),
  secretEnc: r.secret_enc,
  createdAt: r.created_at,
});

export async function getByToken(token: string): Promise<TwinInboundToken | null> {
  const row = getDb()
    .prepare(
      "SELECT token, user_id, project_id, channel, secret_enc, created_at FROM twin_inbound_tokens WHERE token = ?"
    )
    .get(token) as TokenRow | undefined;
  return row ? toToken(row) : null;
}

export async function listByProject(userId: string, projectId: string): Promise<TwinInboundToken[]> {
  const rows = getDb()
    .prepare(
      `SELECT token, user_id, project_id, channel, secret_enc, created_at FROM twin_inbound_tokens
       WHERE user_id = ? AND project_id = ? ORDER BY token ASC LIMIT ?`
    )
    .all(userId, projectId, MAX_INBOUND_ENDPOINTS) as unknown as TokenRow[];
  return rows.map(toToken);
}

export async function insert(row: TwinInboundToken): Promise<void> {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO twin_inbound_tokens (token, user_id, project_id, channel, secret_enc, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(row.token, row.userId, row.projectId, row.channel, row.secretEnc, row.createdAt);
}

/** Delete the project's endpoint for one channel; returns how many rows went. */
export async function deleteForChannel(
  userId: string,
  projectId: string,
  channel: TwinChannel
): Promise<number> {
  const res = getDb()
    .prepare("DELETE FROM twin_inbound_tokens WHERE user_id = ? AND project_id = ? AND channel = ?")
    .run(userId, projectId, channel);
  return Number(res.changes);
}

/** Delete every endpoint the project owns; returns how many rows went. */
export async function deleteForProject(userId: string, projectId: string): Promise<number> {
  const res = getDb()
    .prepare("DELETE FROM twin_inbound_tokens WHERE user_id = ? AND project_id = ?")
    .run(userId, projectId);
  return Number(res.changes);
}
