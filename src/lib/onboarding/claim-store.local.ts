/** Public-scan claim store — LOCAL node:sqlite backend. One row per token in
 *  `.data/systedo.db` (table `scan_claims`, migration v28) holding the JSON claim
 *  blob. Selected when LOCAL_DB is on. Server-only. Mirrors the Firestore backend's
 *  interface exactly; all TTL / minting policy lives in the dispatcher. */
import { getDb } from "@/lib/db";
import type { ScanClaim } from "./claim-token";

interface Row {
  data: string;
}

export async function getClaim(token: string): Promise<ScanClaim | null> {
  const row = getDb()
    .prepare("SELECT data FROM scan_claims WHERE token = ?")
    .get(token) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as ScanClaim;
  } catch {
    return null;
  }
}

export async function putClaim(claim: ScanClaim): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO scan_claims (token, data, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT (token)
       DO UPDATE SET data = excluded.data, created_at = excluded.created_at`
    )
    .run(claim.token, JSON.stringify(claim), claim.createdAt);
}

export async function deleteClaim(token: string): Promise<void> {
  getDb().prepare("DELETE FROM scan_claims WHERE token = ?").run(token);
}

/** Delete up to `limit` rows created before `cutoffIso`. The sub-select keeps the
 *  sweep bounded (node:sqlite has no DELETE … LIMIT) so an opportunistic prune on
 *  the mint path can never turn into a full-table delete. `created_at` is stored
 *  as an ISO-8601 UTC string, which sorts lexicographically — the same ordering
 *  the Firestore twin's range query uses. */
export async function pruneClaims(cutoffIso: string, limit: number): Promise<number> {
  const res = getDb()
    .prepare(
      `DELETE FROM scan_claims
       WHERE token IN (SELECT token FROM scan_claims WHERE created_at < ? ORDER BY created_at LIMIT ?)`
    )
    .run(cutoffIso, limit);
  return Number(res.changes ?? 0);
}
