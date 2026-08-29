/** Outbound-feed tokens — LOCAL node:sqlite backend (WP W2-D). One row per token in
 *  `.data/systedo.db` (table `feed_tokens`, DDL + migration v29 in src/lib/db.ts):
 *  `token` is the primary key (the address space is global, not per-tenant) and
 *  `(user_id, project_id)` is the indexed owner pair backing the by-project lookup.
 *  Selected when LOCAL_DB is on. Server-only. Mirrors the Firestore backend exactly.
 *
 *  `getByProject` sorts by `token` before capping, because the Firestore twin's
 *  otherwise-unordered `limit(1)` query is ordered by `__name__` — which IS the token.
 *  ADR-0001's capped-read rule: both drivers must select the same row. In practice the
 *  dispatcher keeps at most one row per project, so the ordering only matters if a
 *  crash between mint's delete and insert ever left two. */
import { getDb } from "@/lib/db";
import type { FeedToken } from "./feed-token-store";

interface TokenRow {
  token: string;
  user_id: string;
  project_id: string;
  created_at: string;
}

const toToken = (row: TokenRow): FeedToken => ({
  token: row.token,
  userId: row.user_id,
  projectId: row.project_id,
  createdAt: row.created_at,
});

export async function getByToken(token: string): Promise<FeedToken | null> {
  const row = getDb()
    .prepare("SELECT token, user_id, project_id, created_at FROM feed_tokens WHERE token = ?")
    .get(token) as TokenRow | undefined;
  return row ? toToken(row) : null;
}

export async function getByProject(userId: string, projectId: string): Promise<FeedToken | null> {
  const row = getDb()
    .prepare(
      `SELECT token, user_id, project_id, created_at FROM feed_tokens
       WHERE user_id = ? AND project_id = ? ORDER BY token LIMIT 1`
    )
    .get(userId, projectId) as TokenRow | undefined;
  return row ? toToken(row) : null;
}

export async function insert(row: FeedToken): Promise<void> {
  getDb()
    .prepare("INSERT OR REPLACE INTO feed_tokens (token, user_id, project_id, created_at) VALUES (?, ?, ?, ?)")
    .run(row.token, row.userId, row.projectId, row.createdAt);
}

/** Delete every token the project owns; returns how many rows went. */
export async function deleteForProject(userId: string, projectId: string): Promise<number> {
  const res = getDb()
    .prepare("DELETE FROM feed_tokens WHERE user_id = ? AND project_id = ?")
    .run(userId, projectId);
  return Number(res.changes);
}
