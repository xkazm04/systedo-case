/** Seed the local node:sqlite DB (.data/systedo.db) with a dev user + a couple of
 *  known sample projects, so the authed product (/app) and the simulated-UAT
 *  harness have a deterministic, OAuth-free starting state.
 *
 *  Run:  npm run seed:local
 *  Then: DEV_AUTH=true LOCAL_DB=true npm run dev   (or npm run dev:local)
 *        → open /app  (project hub)  or  /app/demo-eshop  (a seeded workspace).
 *
 *  Identity matches DEV_SESSION (src/auth.ts): overridable via DEV_AUTH_USER_*.
 *  The table DDL mirrors src/lib/db.ts (source of truth) — kept here too so the
 *  seed is standalone and works before the dev server has ever created the file.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), ".data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(join(dir, "systedo.db"));
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, image TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
    accent_color TEXT NOT NULL, logo_url TEXT, domain TEXT, tenant TEXT, ads_customer_id TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_projects_user ON projects (user_id, created_at);
`);

const userId = process.env.DEV_AUTH_USER_ID || "dev-user";
const userName = process.env.DEV_AUTH_USER_NAME || "Dev Tester";
const userEmail = process.env.DEV_AUTH_USER_EMAIL || "dev@local.test";
const now = new Date().toISOString();

db.prepare(
  `INSERT INTO users (id, name, email, image, created_at) VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email`
).run(userId, userName, userEmail, null, now);

// Stable ids so the UAT env recipe can navigate to /app/<id> deterministically.
// Types match ProjectType (src/lib/projects/types.ts): eshop | app | leadgen | content | local.
const projects = [
  { id: "demo-eshop", name: "Mionelo (demo)", type: "eshop", accent: "#14b8b1", domain: "mionelo.cz", order: 2 },
  { id: "demo-leadgen", name: "Služby (demo)", type: "leadgen", accent: "#fb7141", domain: null, order: 1 },
  { id: "demo-app", name: "SaaS nástroj (demo)", type: "app", accent: "#6366f1", domain: null, order: 3 },
  { id: "demo-content", name: "Magazín (demo)", type: "content", accent: "#f59e0b", domain: null, order: 4 },
  { id: "demo-local", name: "Dentalis (demo)", type: "local", accent: "#0891b2", domain: "dentalis.cz", order: 5 },
];

const upsert = db.prepare(
  `INSERT INTO projects
     (id, user_id, name, type, accent_color, domain, tenant, ads_customer_id, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET
     name = excluded.name, type = excluded.type, accent_color = excluded.accent_color,
     domain = excluded.domain, updated_at = excluded.updated_at`
);
for (const p of projects) {
  // Stagger created_at by `order` so listing (created_at DESC) is deterministic.
  const created = new Date(Date.parse(now) + p.order * 1000).toISOString();
  upsert.run(p.id, userId, p.name, p.type, p.accent, p.domain, null, null, created, created);
}

console.log(
  `Seeded .data/systedo.db → user "${userId}" (${userEmail}), ` +
    `${projects.length} projects: ${projects.map((p) => `/app/${p.id}`).join(", ")}`
);
db.close();
