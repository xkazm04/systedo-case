/** Per-user Sklik connection store — LOCAL node:sqlite backend (table
 *  `sklik_connection`, DDL in src/lib/db.ts). Selected by the dispatcher when
 *  LOCAL_DB is on. Server-only. Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import { ensureLocalUser } from "@/lib/users/local";
import type { OwnedSklikConnection, SklikConnection, SklikMoneyVerdict } from "./sklik-connection";

interface Row {
  user_id: string;
  token_enc: string;
  connected_at: string;
  money_verdict: string | null;
  money_verdict_at: string | null;
  halere_confirmed: number | null;
  halere_confirmed_at: string | null;
}

function toStored(r: Row): SklikConnection {
  return {
    tokenEnc: r.token_enc,
    connectedAt: r.connected_at,
    ...(r.money_verdict ? { moneyVerdict: r.money_verdict as SklikMoneyVerdict } : {}),
    ...(r.money_verdict_at ? { moneyVerdictAt: r.money_verdict_at } : {}),
    ...(r.halere_confirmed ? { halereConfirmed: true } : {}),
    ...(r.halere_confirmed_at ? { halereConfirmedAt: r.halere_confirmed_at } : {}),
  };
}

export async function getSklikConnection(userId: string): Promise<SklikConnection | null> {
  const r = getDb()
    .prepare("SELECT * FROM sklik_connection WHERE user_id = ?")
    .get(userId) as Row | undefined;
  return r ? toStored(r) : null;
}

export async function saveSklikConnection(userId: string, conn: SklikConnection): Promise<void> {
  ensureLocalUser(userId);
  getDb()
    .prepare(
      `INSERT INTO sklik_connection
         (user_id, token_enc, connected_at, money_verdict, money_verdict_at,
          halere_confirmed, halere_confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         token_enc = excluded.token_enc,
         connected_at = excluded.connected_at,
         money_verdict = excluded.money_verdict,
         money_verdict_at = excluded.money_verdict_at,
         halere_confirmed = excluded.halere_confirmed,
         halere_confirmed_at = excluded.halere_confirmed_at`
    )
    .run(
      userId,
      conn.tokenEnc,
      conn.connectedAt,
      conn.moneyVerdict ?? null,
      conn.moneyVerdictAt ?? null,
      conn.halereConfirmed ? 1 : null,
      conn.halereConfirmedAt ?? null
    );
}

export async function deleteSklikConnection(userId: string): Promise<void> {
  getDb().prepare("DELETE FROM sklik_connection WHERE user_id = ?").run(userId);
}

export async function listSklikConnectedUserIds(): Promise<string[]> {
  const rows = getDb()
    .prepare("SELECT user_id FROM sklik_connection")
    .all() as unknown as { user_id: string }[];
  return rows.map((r) => r.user_id);
}

/** Every stored connection with its owner (unused by the dispatcher today; kept
 *  symmetric with the Firestore backend + the inventory precedent). */
export async function listAllSklikConnections(): Promise<OwnedSklikConnection[]> {
  const rows = getDb().prepare("SELECT * FROM sklik_connection").all() as unknown as Row[];
  return rows.map((r) => ({ userId: r.user_id, connection: toStored(r) }));
}
