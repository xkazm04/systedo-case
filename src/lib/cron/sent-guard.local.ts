/** Cron sent-guard — LOCAL node:sqlite backend. One row per (tenant, kind) in
 *  `.data/systedo.db` (table `cron_sent_guard`, DDL in src/lib/db.ts). Selected
 *  when LOCAL_DB is on. Server-only. Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";

/** Atomic claim-first via UPSERT-where: insert the (tenant, kind, period) row, or
 *  on conflict update it ONLY when the period differs. SQLite reports 0 changed
 *  rows when the DO UPDATE's WHERE is false (period already == this one), so
 *  `changes > 0` is exactly "this call claimed a new period". node:sqlite is
 *  synchronous, so the read-modify-write is a single atomic statement. */
export async function claimSentPeriod(
  tenant: string,
  kind: string,
  period: string
): Promise<boolean> {
  const { changes } = getDb()
    .prepare(
      `INSERT INTO cron_sent_guard (tenant, kind, period, claimed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (tenant, kind)
       DO UPDATE SET period = excluded.period, claimed_at = excluded.claimed_at
       WHERE cron_sent_guard.period <> excluded.period`
    )
    .run(tenant, kind, period, new Date().toISOString());
  return Number(changes) > 0;
}

/** Release a claim: delete the row ONLY when it still holds this exact period —
 *  a later period's claim is left untouched (the WHERE makes it a targeted no-op).
 *  node:sqlite is synchronous, so the conditional delete is atomic. */
export async function releaseSentPeriod(
  tenant: string,
  kind: string,
  period: string
): Promise<void> {
  getDb()
    .prepare(`DELETE FROM cron_sent_guard WHERE tenant = ? AND kind = ? AND period = ?`)
    .run(tenant, kind, period);
}
