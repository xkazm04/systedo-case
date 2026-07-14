/** Durable cron run store — LOCAL node:sqlite backend. One row per invocation in
 *  `.data/systedo.db` (table `cron_runs`, DDL in src/lib/db.ts); the full record
 *  is the JSON `data` blob, with cron/finished_at/ok columned for retention +
 *  health. Selected when LOCAL_DB is on. Server-only. Mirrors the Firestore
 *  backend's interface. */
import { getDb } from "@/lib/db";
import { CRON_RUN_RETENTION, type CronRunRecord } from "./run-record";

interface DataRow {
  data: string;
}

export async function saveCronRun(record: CronRunRecord): Promise<void> {
  const db = getDb();
  db.prepare(
    `INSERT INTO cron_runs (id, cron, started_at, finished_at, ok, data)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.cron,
    record.startedAt,
    record.finishedAt,
    record.ok ? 1 : 0,
    JSON.stringify(record)
  );
  // Retention: keep only the newest CRON_RUN_RETENTION rows for THIS cron.
  db.prepare(
    `DELETE FROM cron_runs
     WHERE cron = ?
       AND id NOT IN (
         SELECT id FROM cron_runs WHERE cron = ?
         ORDER BY finished_at DESC, id DESC
         LIMIT ?
       )`
  ).run(record.cron, record.cron, CRON_RUN_RETENTION);
}

export async function listRecentCronRuns(limit = 200): Promise<CronRunRecord[]> {
  const rows = getDb()
    .prepare("SELECT data FROM cron_runs ORDER BY finished_at DESC LIMIT ?")
    .all(limit) as unknown as DataRow[];
  const out: CronRunRecord[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.data) as CronRunRecord);
    } catch {
      /* skip a corrupt blob rather than break the health probe */
    }
  }
  return out;
}
