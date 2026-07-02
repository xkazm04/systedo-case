/** Turn a fresh sync into alerts across channels — email, an outbound webhook,
 *  and a persisted in-app inbox — for campaigns that have *newly* become critical
 *  (don't re-alert ones already flagged). The "already alerted" set lives on the
 *  tenant doc, so a recovered-then-relapsed campaign re-alerts. The same path runs
 *  on the hourly cron and on a manual sync, so the inbox always reflects reality.
 *  Server-only. */
import { firestore } from "@/lib/firebase";
import { sendEmail, sendWebhook } from "@/lib/email";
import { withMetrics, type Campaign, type CampaignChange } from "./types";
import { triage } from "./triage";
import { recordActivity } from "./activity";

export type AlertType = "critical" | "digest";

export interface AlertItem {
  campaignId: string;
  name: string;
  reason: string;
}

export interface AlertDoc {
  type: AlertType;
  title: string;
  /** short plain-text body for the inbox row + webhook */
  body: string;
  items: AlertItem[];
  createdAt: string;
  read: boolean;
}

export interface AlertRecord extends AlertDoc {
  id: string;
}

function alertsCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("alerts");
}

/** Persist one alert to the tenant's in-app inbox (always, even when no email/
 *  webhook is configured — so there's a durable record either way). */
export async function recordAlert(
  tenant: string,
  alert: { type: AlertType; title: string; body: string; items: AlertItem[] }
): Promise<void> {
  await alertsCol(tenant).add({ ...alert, createdAt: new Date().toISOString(), read: false });
}

/** Newest alerts for a tenant's inbox. */
export async function listAlerts(tenant: string, limit = 20): Promise<AlertRecord[]> {
  const snap = await alertsCol(tenant).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as AlertDoc) }));
}

/** Mark one alert (by id) or all unread alerts as read. */
export async function markAlertsRead(tenant: string, id?: string): Promise<void> {
  if (id) {
    await alertsCol(tenant).doc(id).set({ read: true }, { merge: true });
    return;
  }
  const snap = await alertsCol(tenant).where("read", "==", false).get();
  const batch = firestore.batch();
  snap.forEach((d) => batch.set(d.ref, { read: true }, { merge: true }));
  await batch.commit();
}

/** The signed-in user's email, for outbound notifications. */
export async function getUserEmail(userId: string): Promise<string | null> {
  const data = (await firestore.collection("users").doc(userId).get()).data();
  return (data?.email as string | undefined) ?? null;
}

/** Evaluate the just-synced campaigns and alert on new criticals across all
 *  channels. Returns how many new criticals were found. When the sync-over-sync
 *  diff is supplied (indexChanges over store.getLatestChanges), the change-aware
 *  rules also run, so a ROAS crater reaches the inbox/email/webhook pipeline
 *  instead of waiting for someone to open the page. */
export async function evaluateAndAlert(
  tenant: string,
  userId: string,
  campaigns: Campaign[],
  changesById: Record<string, CampaignChange> = {}
): Promise<number> {
  const rows = campaigns.map(withMetrics);
  const criticals = rows.filter((c) => triage(c, changesById[c.id]).severity === "critical");
  const criticalIds = criticals.map((c) => c.id);

  const tenantRef = firestore.collection("tenants").doc(tenant);
  const prevAlerted: string[] = (await tenantRef.get()).data()?.alertedCampaignIds ?? [];
  const fresh = criticals.filter((c) => !prevAlerted.includes(c.id));

  // Remember the current criticals so recovered ones drop and can re-alert later.
  await tenantRef.set({ alertedCampaignIds: criticalIds }, { merge: true });

  if (fresh.length === 0) return 0;

  const items: AlertItem[] = fresh.map((c) => ({
    campaignId: c.id,
    name: c.name,
    reason: triage(c, changesById[c.id]).primary?.detail ?? "Vyžaduje pozornost.",
  }));
  const title = `${fresh.length} nových kritických kampaní`;
  const body = items.map((i) => `${i.name} — ${i.reason}`).join(" · ");

  // In-app inbox first — the durable record that never depends on a 3rd party.
  await recordAlert(tenant, { type: "critical", title, body, items });
  await recordActivity(tenant, {
    kind: "alert",
    title,
    detail: body,
    actor: "Automatická synchronizace",
  });

  // Outbound webhook (Slack/Teams/…), best-effort.
  await sendWebhook(`Systedo: ${title}\n${body}`);

  // Email, best-effort (needs the user's address).
  const email = await getUserEmail(userId);
  if (!email) {
    console.log(`[alert] tenant ${tenant}: ${fresh.length} new criticals, no user email`);
    return fresh.length;
  }

  const li = items
    .map(
      (i) =>
        `<li style="margin:6px 0"><strong>${escapeHtml(i.name)}</strong> — ${escapeHtml(i.reason)}</li>`
    )
    .join("");
  const html =
    `<p>Při poslední synchronizaci se objevily nové kritické kampaně:</p>` +
    `<ul>${li}</ul>` +
    `<p>Otevřete přehled v Systedo pro detail, doporučené přesuny rozpočtu a AI vyhodnocení.</p>`;

  await sendEmail(email, `Systedo: ${title}`, html);
  return fresh.length;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"
  );
}
