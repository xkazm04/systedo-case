/** Local (node:sqlite) user store — used only in LOCAL_DB mode. The signed-in
 *  identity comes from DEV_AUTH's synthetic session; this persists a matching row
 *  in `.data/systedo.db` so projects can foreign-key to a real user and the local
 *  DB is a faithful stand-in for the Firestore user collection. Server-only. */
import { getDb } from "@/lib/db";

export interface LocalUser {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  created_at: string;
}

function toUser(r: UserRow): LocalUser {
  return { id: r.id, name: r.name, email: r.email, image: r.image, createdAt: r.created_at };
}

/** Upsert (insert-if-absent) a user row, filling name/email from the DEV_AUTH_*
 *  env — the same identity DEV_SESSION uses — when not supplied. Idempotent and
 *  cheap, so it's safe to call on every project-store access to guarantee the
 *  signed-in dev user always has a row. */
export function ensureLocalUser(
  id: string,
  info?: { name?: string; email?: string | null; image?: string | null }
): LocalUser {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  if (existing) return toUser(existing);

  const user: LocalUser = {
    id,
    name: info?.name ?? process.env.DEV_AUTH_USER_NAME ?? "Dev Tester",
    email: info?.email ?? process.env.DEV_AUTH_USER_EMAIL ?? "dev@local.test",
    image: info?.image ?? null,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO users (id, name, email, image, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(user.id, user.name, user.email, user.image, user.createdAt);
  return user;
}

export function getLocalUser(id: string): LocalUser | null {
  const r = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return r ? toUser(r) : null;
}

export function listLocalUsers(): LocalUser[] {
  const rows = getDb()
    .prepare("SELECT * FROM users ORDER BY created_at ASC")
    .all() as unknown as UserRow[];
  return rows.map(toUser);
}
