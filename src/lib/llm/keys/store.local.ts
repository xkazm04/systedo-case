/** BYOM key store — LOCAL node:sqlite backend (table `byom_config`, DDL in
 *  src/lib/db.ts). Selected by the dispatcher when LOCAL_DB is on. Server-only.
 *  One JSON blob per user (active vendor + per-vendor ENCRYPTED keys); mirrors the
 *  Firestore backend's interface. */
import { getDb } from "@/lib/db";
import { ensureLocalUser } from "@/lib/users/local";
import type { StoredByomConfig } from "./types";

interface Row {
  data: string;
}

const EMPTY: StoredByomConfig = { keys: {} };

function parse(data: string): StoredByomConfig {
  try {
    const v = JSON.parse(data) as StoredByomConfig;
    if (v && typeof v === "object" && v.keys && typeof v.keys === "object") return v;
  } catch {
    /* corrupt blob — treat as unconfigured */
  }
  return { keys: {} };
}

export async function getByomConfig(userId: string): Promise<StoredByomConfig> {
  const r = getDb()
    .prepare("SELECT data FROM byom_config WHERE user_id = ?")
    .get(userId) as Row | undefined;
  return r ? parse(r.data) : { ...EMPTY };
}

export async function saveByomConfig(userId: string, cfg: StoredByomConfig): Promise<void> {
  ensureLocalUser(userId);
  getDb()
    .prepare(
      `INSERT INTO byom_config (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`
    )
    .run(userId, JSON.stringify(cfg), new Date().toISOString());
}

/** Atomic read-modify-write of a user's config, mirroring the Firestore backend.
 *  node:sqlite is synchronous (so the read→mutate→write can't interleave within a
 *  process), and BEGIN IMMEDIATE guards against a second process (a concurrent dev
 *  worker / the cron) racing the same row. `fn` must be synchronous. */
export async function mutateByomConfig(
  userId: string,
  fn: (cfg: StoredByomConfig) => StoredByomConfig
): Promise<StoredByomConfig> {
  ensureLocalUser(userId);
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = db.prepare("SELECT data FROM byom_config WHERE user_id = ?").get(userId) as Row | undefined;
    const cfg = r ? parse(r.data) : { keys: {} };
    const next = fn(cfg);
    db.prepare(
      `INSERT INTO byom_config (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`
    ).run(userId, JSON.stringify(next), new Date().toISOString());
    db.exec("COMMIT");
    return next;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export async function deleteByomConfig(userId: string): Promise<void> {
  getDb().prepare("DELETE FROM byom_config WHERE user_id = ?").run(userId);
}
