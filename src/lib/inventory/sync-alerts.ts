/** Surface scheduled-sync health to the user. The cron re-sync records each
 *  connection's outcome on the connection itself (lastError/failCount); this module
 *  turns the healthy→failing transition into an alert (inbox + webhook + email) and a
 *  recovery into an inbox note — reusing the campaigns alert/activity/email pipeline.
 *  Transition-based so a persistently-broken connection alerts once, not every night.
 *  Server-only. */
import "server-only";
import { getUserEmail, recordAlert } from "@/lib/campaigns/alerts";
import { recordActivity } from "@/lib/campaigns/activity";
import { resolveTenant } from "@/lib/campaigns/connector";
import { getProject } from "@/lib/projects/store";
import { sendEmail, sendWebhook } from "@/lib/email";
import { SITE_NAME } from "@/lib/site";
import { escapeHtml } from "@/lib/html";
import { syncProvider } from "./providers";

async function context(userId: string, projectId: string, providerId: string) {
  const [project, tenant] = await Promise.all([getProject(userId, projectId), resolveTenant(userId, projectId)]);
  return {
    tenant,
    projectName: project?.name ?? projectId,
    providerLabel: syncProvider(providerId)?.label ?? providerId,
  };
}

/** A scheduled sync just started failing: inbox + webhook + email. Best-effort. */
export async function alertSyncFailed(
  userId: string,
  projectId: string,
  providerId: string,
  message: string
): Promise<void> {
  try {
    const { tenant, projectName, providerLabel } = await context(userId, projectId, providerId);
    const title = "Synchronizace skladu selhala";
    const body = `${providerLabel} · ${projectName}: ${message}`;
    await recordAlert(tenant, { type: "critical", title, body, items: [] });
    await recordActivity(tenant, { kind: "alert", title, detail: body, actor: "Plánovaná synchronizace" });
    await sendWebhook(`${SITE_NAME}: ${title}\n${body}`);
    const email = await getUserEmail(userId);
    if (email) {
      const html =
        `<p>Plánovaná synchronizace skladu selhala pro <strong>${escapeHtml(projectName)}</strong> ` +
        `(${escapeHtml(providerLabel)}).</p>` +
        `<p style="color:#b3261e">${escapeHtml(message)}</p>` +
        `<p>Katalog se zatím neaktualizoval. Zkontrolujte připojení v modulu Katalog → Sklad.</p>`;
      await sendEmail(email, `${SITE_NAME}: ${title}`, html);
    }
  } catch (err) {
    console.error(`[sync-alert] failure alert for ${userId}/${projectId}:`, err);
  }
}

/** A previously-failing sync recovered: inbox note only (less urgent). Best-effort. */
export async function alertSyncRecovered(userId: string, projectId: string, providerId: string): Promise<void> {
  try {
    const { tenant, projectName, providerLabel } = await context(userId, projectId, providerId);
    const title = "Synchronizace skladu obnovena";
    const body = `${providerLabel} · ${projectName}`;
    await recordAlert(tenant, { type: "digest", title, body, items: [] });
    await recordActivity(tenant, { kind: "alert", title, detail: body, actor: "Plánovaná synchronizace" });
  } catch (err) {
    console.error(`[sync-alert] recovery alert for ${userId}/${projectId}:`, err);
  }
}
