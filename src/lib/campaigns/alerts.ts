/** Turn a fresh sync into alerts across channels — email, an outbound webhook,
 *  and a persisted in-app inbox — for campaigns that have *newly* become critical.
 *  Re-alerting is governed by a hysteresis + cooldown policy (see
 *  ./alert-suppression) persisted on the tenant doc, so a campaign flickering
 *  across the critical boundary alerts once per cooldown window instead of every
 *  sync. The same path runs on the hourly cron and on a manual sync, so the inbox
 *  always reflects reality. Server-only. */
import { firestore } from "@/lib/firebase";
import { SITE_NAME } from "@/lib/site";
import { sendEmail, sendWebhook } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { withMetrics, type Campaign, type CampaignChange } from "./types";
import { triage } from "./triage";
import { recordActivity } from "./activity";
import {
  planSuppression,
  alertStatus,
  nextAckStatus,
  resolveWrites,
  type AlertState,
  type AlertStatus,
} from "./alert-suppression";

/** Max writes per Firestore batch (hard limit is 500). markAlertsRead chunks its
 *  unread sweep at this size so a tenant with >500 unread never throws. */
const BATCH_CHUNK = 500;

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
  /** optional in-app deep-link target for the inbox row (e.g. a module panel the
   *  alert is about) — the "Diagnóza týdne" digest alert links to the LTV module. */
  href?: string;
  createdAt: string;
  read: boolean;
  /** where the alert sits in the operator's workflow (new → acknowledged →
   *  resolved). Omitted on docs written before the workflow existed — treat a
   *  missing value as "new" (see {@link alertStatus}). */
  status?: AlertStatus;
  /** the change-set id that resolved this alert, set when resolution came from an
   *  applied change-set staged off the alert. The activity thread's back-reference. */
  resolvedBy?: string;
}

export interface AlertRecord extends AlertDoc {
  id: string;
}

function alertsCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("alerts");
}

/** Persist one alert to the tenant's in-app inbox (always, even when no email/
 *  webhook is configured — so there's a durable record either way). New alerts
 *  start in the `new` workflow status. Returns the new alert's id so a caller can
 *  thread it into the activity feed / a staged change-set. */
export async function recordAlert(
  tenant: string,
  alert: { type: AlertType; title: string; body: string; items: AlertItem[]; href?: string }
): Promise<string> {
  // Firestore rejects an `undefined` field, so only include href when set.
  const { href, ...rest } = alert;
  const ref = await alertsCol(tenant).add({
    ...rest,
    ...(href ? { href } : {}),
    createdAt: new Date().toISOString(),
    read: false,
    status: "new" satisfies AlertStatus,
  });
  return ref.id;
}

/** One alert by id (for scoping a staged change-set to its campaigns), or null. */
export async function getAlert(tenant: string, id: string): Promise<AlertRecord | null> {
  const snap = await alertsCol(tenant).doc(id).get();
  return snap.exists ? { id, ...(snap.data() as AlertDoc) } : null;
}

/** Move an alert to `acknowledged`: the operator has taken responsibility for it
 *  without (yet) acting. Guarded at the store write via a read-check-write txn so
 *  it matches its contract exactly: advances `new → acknowledged` only, and NEVER
 *  regresses a `resolved` alert (nor re-touches an already-acknowledged one). The
 *  decision is the pure {@link nextAckStatus}; the txn makes it race-safe. */
export async function acknowledgeAlert(tenant: string, id: string): Promise<void> {
  const ref = alertsCol(tenant).doc(id);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const next = nextAckStatus(alertStatus(snap.data() as { status?: AlertStatus }));
    if (next) tx.set(ref, { status: next satisfies AlertStatus }, { merge: true });
  });
}

/** Close an alert as `resolved`, recording the change-set that resolved it as the
 *  back-reference. Called when a change-set staged off the alert is applied, so the
 *  inbox reflects that the detected problem was actioned. Idempotent (guarded by a
 *  read-check-write txn): the first resolve wins the `resolvedBy` reference and a
 *  re-resolve is a no-op that leaves it intact — the store never overwrites the
 *  original resolver. */
export async function resolveAlert(
  tenant: string,
  id: string,
  changeSetId: string
): Promise<void> {
  const ref = alertsCol(tenant).doc(id);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    if (!resolveWrites(alertStatus(snap.data() as { status?: AlertStatus }))) return;
    tx.set(ref, { status: "resolved" satisfies AlertStatus, resolvedBy: changeSetId }, { merge: true });
  });
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
  // Chunk at the Firestore 500-writes-per-batch limit so a tenant with a large
  // unread backlog marks everything read across several commits instead of
  // throwing on the 501st write.
  const snap = await alertsCol(tenant).where("read", "==", false).get();
  for (let i = 0; i < snap.docs.length; i += BATCH_CHUNK) {
    const batch = firestore.batch();
    for (const d of snap.docs.slice(i, i + BATCH_CHUNK)) {
      batch.set(d.ref, { read: true }, { merge: true });
    }
    await batch.commit();
  }
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
  // Split by severity so the hysteresis band (recovered-to-warning) can hold an
  // episode open — a critical→warning→critical flicker must NOT re-alert.
  const byId = new Map(rows.map((c) => [c.id, triage(c, changesById[c.id]).severity]));
  const criticals = rows.filter((c) => byId.get(c.id) === "critical");
  const banded = rows.filter((c) => byId.get(c.id) === "warning").map((c) => c.id);

  const tenantRef = firestore.collection("tenants").doc(tenant);
  const prevState: AlertState = (await tenantRef.get()).data()?.criticalAlertState ?? {};

  // Hysteresis + per-key cooldown: decide which criticals actually alert now and
  // roll the episode memory forward (grouped repeats stay in state, silent).
  const { toAlert, nextState } = planSuppression(prevState, {
    breaching: criticals.map((c) => c.id),
    banded,
    now: Date.now(),
  });
  await tenantRef.set({ criticalAlertState: nextState }, { merge: true });

  const alertIds = new Set(toAlert);
  const fresh = criticals.filter((c) => alertIds.has(c.id));
  if (fresh.length === 0) return 0;

  const items: AlertItem[] = fresh.map((c) => ({
    campaignId: c.id,
    name: c.name,
    reason: triage(c, changesById[c.id]).primary?.detail ?? "Vyžaduje pozornost.",
  }));
  const title = `${fresh.length} nových kritických kampaní`;
  const body = items.map((i) => `${i.name} — ${i.reason}`).join(" · ");

  // In-app inbox first — the durable record that never depends on a 3rd party.
  // Thread the alert id into the activity feed so the timeline can tie this
  // detection to the change-set later staged from it (alert → change-set → apply).
  const alertId = await recordAlert(tenant, { type: "critical", title, body, items });
  await recordActivity(tenant, {
    kind: "alert",
    title,
    detail: body,
    actor: "Automatická synchronizace",
    alertId,
  });

  // Outbound webhook (Slack/Teams/…), best-effort.
  await sendWebhook(`${SITE_NAME}: ${title}\n${body}`);

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
    `<p>Otevřete přehled v ${SITE_NAME} pro detail, doporučené přesuny rozpočtu a AI vyhodnocení.</p>`;

  await sendEmail(email, `${SITE_NAME}: ${title}`, html);
  return fresh.length;
}
