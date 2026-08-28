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
import { planSuppression } from "@/lib/campaigns/alert-suppression";
import { getProject } from "@/lib/projects/store";
import { sendEmail, sendWebhook } from "@/lib/email";
import { SITE_NAME } from "@/lib/site";
import { escapeHtml } from "@/lib/html";
import { HOME_MARKET_LOCALE, type SupportedLocale } from "@/lib/format";
import { toProducts, type Offering } from "@/lib/catalog/offering";
import { syncProvider } from "./providers";
import { stockRows } from "./compute";
import { breachingSkus, stockAlertPayload } from "./plan-types";
import { getStockAlertState, saveStockAlertState } from "./plan-store";

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

/** Stockout alerts: after a warehouse sync merges fresh stock, alert on SKUs that
 *  have CROSSED into a pause (< 7 days cover) or at-risk (7–14 days) condition —
 *  reusing the exact recordAlert + planSuppression machinery the campaign-critical
 *  alerts use, so an already-alerted SKU is suppressed until it recovers (transition-
 *  only), governed by the per-key cooldown. Per-SKU suppression state persists in the
 *  inventory-plan store (Firestore + LOCAL twin).
 *
 *  Honesty gate: this runs ONLY from the real-connection sync path (runCatalogSync
 *  with a stored connection) and ONLY for e-shop projects — the module's availableFor.
 *  A project with no synced warehouse data therefore never alerts on its sample-/seed-
 *  derived stock; the alert reflects a real feed, not an illustrative catalog. The
 *  `now` and `offerings` are the sync's own reference date + merged catalog, so the
 *  stock projection matches exactly what the module renders. Best-effort; never throws.
 *
 *  Returns the SKUs alerted (empty when none crossed) or null when gated out — for the
 *  cron/route to report, and for tests. */
export async function alertStockTransitions(
  userId: string,
  projectId: string,
  offerings: Offering[],
  now: Date,
  locale: SupportedLocale = HOME_MARKET_LOCALE
): Promise<{ alerted: string[] } | null> {
  try {
    const project = await getProject(userId, projectId);
    // Eshop-only: the Sklad & sezónnost module (and its stock model) is availableFor eshop.
    if (!project || project.type !== "eshop") return null;

    const products = toProducts(offerings);
    const rows = stockRows(products, now);
    const breaching = breachingSkus(rows);

    // Transition + cooldown via the shared suppression policy. No hysteresis band for
    // stock (a SKU is either breaching or not), so `banded` is empty.
    const prev = await getStockAlertState(projectId);
    const { toAlert, nextState } = planSuppression(prev, { breaching, banded: [], now: now.getTime() });
    await saveStockAlertState(projectId, nextState);
    if (toAlert.length === 0) return { alerted: [] };

    const bySku = new Map(rows.map((r) => [r.product.sku, r]));
    const alertingRows = toAlert.map((sku) => bySku.get(sku)).filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (alertingRows.length === 0) return { alerted: [] };

    const tenant = await resolveTenant(userId, projectId);
    const payload = stockAlertPayload(alertingRows, projectId, locale);
    await recordAlert(tenant, payload);
    await recordActivity(tenant, {
      kind: "alert",
      title: payload.title,
      detail: payload.body,
      actor: "Skladová synchronizace",
    });
    return { alerted: toAlert };
  } catch (err) {
    console.error(`[sync-alert] stock-transition alert for ${userId}/${projectId}:`, err);
    return null;
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
