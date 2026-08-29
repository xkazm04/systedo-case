/** Webhook endpoint config — LOCAL node:sqlite backend (table `webhook_configs`,
 *  DDL + migration in src/lib/db.ts). Selected by the dispatcher when LOCAL_DB is
 *  on. Server-only. Mirrors the Firestore backend's interface exactly. */
import { getDb } from "@/lib/db";
import { ensureLocalUser } from "@/lib/users/local";
import { EMPTY_WEBHOOK_CONFIG, type OwnedWebhookConfig } from "./config-store";
import type { WebhookConfig } from "./types";

interface Row {
  project_id: string;
  data: string;
}

/** A corrupt blob reads as "no endpoints" rather than throwing: a settings page that
 *  500s is worse than one that shows an empty list the owner can rebuild. */
function parse(raw: string): WebhookConfig {
  try {
    const v = JSON.parse(raw) as WebhookConfig;
    return v && Array.isArray(v.endpoints) ? v : EMPTY_WEBHOOK_CONFIG;
  } catch {
    return EMPTY_WEBHOOK_CONFIG;
  }
}

export async function getWebhookConfig(userId: string, projectId: string): Promise<WebhookConfig> {
  const r = getDb()
    .prepare("SELECT project_id, data FROM webhook_configs WHERE user_id = ? AND project_id = ?")
    .get(userId, projectId) as Row | undefined;
  return r ? parse(r.data) : EMPTY_WEBHOOK_CONFIG;
}

export async function saveWebhookConfig(
  userId: string,
  projectId: string,
  config: WebhookConfig
): Promise<void> {
  ensureLocalUser(userId);
  getDb()
    .prepare(
      `INSERT INTO webhook_configs (user_id, project_id, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, project_id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`
    )
    .run(userId, projectId, JSON.stringify(config), new Date().toISOString());
}

export async function clearWebhookConfig(userId: string, projectId: string): Promise<void> {
  getDb()
    .prepare("DELETE FROM webhook_configs WHERE user_id = ? AND project_id = ?")
    .run(userId, projectId);
}

export async function listUserWebhookConfigs(userId: string): Promise<OwnedWebhookConfig[]> {
  const rows = getDb()
    .prepare("SELECT project_id, data FROM webhook_configs WHERE user_id = ?")
    .all(userId) as unknown as Row[];
  return rows.map((r) => ({ userId, projectId: r.project_id, config: parse(r.data) }));
}
