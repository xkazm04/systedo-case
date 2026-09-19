/** Per-tenant client-report configuration — LOCAL node:sqlite backend. One row
 *  per tenant in `.data/systedo.db` (table `report_config`, migration v35)
 *  holding the whole config as a JSON blob. Selected when LOCAL_DB is on.
 *  Server-only. Mirrors the Firestore backend's interface
 *  (report-config.firestore.ts), same split as cron/sent-guard.ts. */
import { getDb } from "@/lib/db";
import type { ReportConfig } from "./report-config-types";

interface Row {
  data: string;
}

export async function readConfig(tenant: string): Promise<Partial<ReportConfig> | undefined> {
  const row = getDb().prepare("SELECT data FROM report_config WHERE tenant = ?").get(tenant) as
    | Row
    | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.data) as Partial<ReportConfig>;
  } catch {
    return undefined;
  }
}

export async function writeConfig(tenant: string, patch: Partial<ReportConfig>): Promise<void> {
  const current = (await readConfig(tenant)) ?? {};
  const next = { ...current, ...patch };
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO report_config (tenant, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (tenant)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(tenant, JSON.stringify(next), now);
}

/** Claim-first: only true when `day` was not already the recorded sent-day.
 *  node:sqlite is synchronous and LOCAL_DB is single-process, so the
 *  read-then-write here is uncontended in practice — the same relaxation the
 *  rest of this backend's siblings take (e.g. goals/store.ts's
 *  recordProjectGoal); the Firestore backend keeps the real transaction. */
export async function claimDay(tenant: string, day: string): Promise<boolean> {
  const current = (await readConfig(tenant)) ?? {};
  if (current.lastSentDay === day) return false;
  await writeConfig(tenant, { lastSentDay: day });
  return true;
}

/** Release a claim: clear `lastSentDay` only when it is still this exact day. */
export async function releaseDay(tenant: string, day: string): Promise<void> {
  const current = (await readConfig(tenant)) ?? {};
  if (current.lastSentDay !== day) return;
  const rest = { ...current };
  delete rest.lastSentDay;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO report_config (tenant, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (tenant)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(tenant, JSON.stringify(rest), now);
}
