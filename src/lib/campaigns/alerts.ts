/** Turn a fresh sync into alerts across channels — email, an outbound webhook,
 *  and a persisted in-app inbox — for campaigns that have *newly* become critical.
 *  Re-alerting is governed by a hysteresis + cooldown policy (see
 *  ./alert-suppression) persisted on the tenant doc, so a campaign flickering
 *  across the critical boundary alerts once per cooldown window instead of every
 *  sync. The same path runs on the hourly cron and on a manual sync, so the inbox
 *  always reflects reality. Server-only.
 *
 *  The inbox itself (`tenants/{tenant}/alerts`) speaks through the generic
 *  per-tenant document seam (ADR-0001), so it works on the node:sqlite twin under
 *  LOCAL_DB. `firestore` is still imported for the two reads that are NOT under
 *  that sub-collection and have no seam of their own: `users/{userId}` (the
 *  notification address) and the tenant ROOT doc that carries
 *  `criticalAlertState` — the latter is shared with ./anomaly-alerts.ts, so it
 *  needs its own seam rather than a private one here. */
import { firestore } from "@/lib/firebase";
import { tenantDocs, type DocData } from "@/lib/tenant-docs/backend";
import { SITE_NAME } from "@/lib/site";
import { sendEmail, sendWebhook } from "@/lib/email";
import { emitOutboundForTenant } from "@/lib/outbound/emit";
import { escapeHtml } from "@/lib/html";
import { czPlural } from "@/lib/format";
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

/** How many of the newest alerts the mark-all-read sweep considers. The inbox is
 *  itself capped ({@link listAlerts} reads 20), so an alert outside this window is
 *  unreachable in the product — and a bounded read is what lets the sweep run on
 *  the generic document seam, whose equality query takes a string (`read` is a
 *  boolean). See {@link markAlertsRead}. */
const UNREAD_SWEEP_LIMIT = 200;

export type AlertType = "critical" | "digest";

export interface AlertItem {
  /** The campaign this item concerns. For an anomaly item (`kind: "anomaly"`) this
   *  is a SYNTHETIC key (`ANOMALY_CAMPAIGN_ID_PREFIX + anomalyKey`, e.g.
   *  "anomaly:2026-07-10|cost|spike"), NOT a resolvable campaign id — consumers that
   *  scope real campaigns (alertCampaignIds → the alert→change-set flow) must skip
   *  these, or they scope donors to ids that match no campaign and dead-end. */
  campaignId: string;
  name: string;
  reason: string;
  /** Discriminates a real campaign alert from a synthetic anomaly item. Absent is
   *  treated as "campaign" for backward-compat with records written before the field
   *  existed (the prefix on `campaignId` is the durable guard for those). */
  kind?: "campaign" | "anomaly";
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

/** The sub-collection under `tenants/{tenant}` the inbox lives in — unchanged;
 *  addressed through the generic per-tenant document seam ({@link tenantDocs},
 *  ADR-0001) so the inbox also works on the node:sqlite twin under LOCAL_DB. The
 *  Firestore backend of that seam issues the same paths and the same
 *  `orderBy("createdAt","desc").limit(n)` read this module issued before. */
const ALERTS = "alerts";

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
  return (await tenantDocs()).addDoc(tenant, ALERTS, {
    ...rest,
    ...(href ? { href } : {}),
    createdAt: new Date().toISOString(),
    read: false,
    status: "new" satisfies AlertStatus,
  });
}

/** One alert by id (for scoping a staged change-set to its campaigns), or null. */
export async function getAlert(tenant: string, id: string): Promise<AlertRecord | null> {
  const data = await (await tenantDocs()).getDoc(tenant, ALERTS, id);
  return data ? { id, ...(data as AlertDoc) } : null;
}

/** Advance ONE alert's workflow status under a compare-and-set guard — the seam
 *  equivalent of the read-check-write transaction `acknowledgeAlert` and
 *  `resolveAlert` used before. `decide` is the pure policy (nextAckStatus /
 *  resolveWrites) and sees the DEFAULTED status, exactly as the transaction did;
 *  returning null means "no write", which is how both callers stay idempotent.
 *  The guard is the status the decision was made on, so exactly one of two
 *  concurrent writers lands — the same one-winner property the transaction gave
 *  (the Firestore backend of `compareAndSet` IS a runTransaction on that field).
 *
 *  Legacy exception: a doc written before the workflow field existed carries no
 *  `status`, and `compareAndSet` compares a string — there is nothing to guard on.
 *  Those docs take a plain merge write, the same value the transaction would have
 *  written. The property that lapses is first-writer-wins on `resolvedBy` for two
 *  SIMULTANEOUS resolves of a pre-workflow alert; every alert written since the
 *  workflow shipped carries `status` and keeps the guarded path, and a sequential
 *  re-resolve still no-ops on either path. */
async function advanceAlert(
  tenant: string,
  id: string,
  decide: (current: AlertStatus) => DocData | null
): Promise<void> {
  const store = await tenantDocs();
  const data = await store.getDoc(tenant, ALERTS, id);
  if (!data) return;
  const patch = decide(alertStatus(data as { status?: AlertStatus }));
  if (!patch) return;
  const from: unknown = data.status;
  if (typeof from !== "string") {
    await store.setDoc(tenant, ALERTS, id, patch, { merge: true });
    return;
  }
  await store.compareAndSet(tenant, ALERTS, id, { field: "status", equals: from }, patch);
}

/** Move an alert to `acknowledged`: the operator has taken responsibility for it
 *  without (yet) acting. Guarded at the store write via a read-check-write txn so
 *  it matches its contract exactly: advances `new → acknowledged` only, and NEVER
 *  regresses a `resolved` alert (nor re-touches an already-acknowledged one). The
 *  decision is the pure {@link nextAckStatus}; the txn makes it race-safe. */
export async function acknowledgeAlert(tenant: string, id: string): Promise<void> {
  await advanceAlert(tenant, id, (current) => {
    const next = nextAckStatus(current);
    return next ? { status: next satisfies AlertStatus } : null;
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
  await advanceAlert(tenant, id, (current) =>
    resolveWrites(current)
      ? { status: "resolved" satisfies AlertStatus, resolvedBy: changeSetId }
      : null
  );
}

/** Newest alerts for a tenant's inbox. */
export async function listAlerts(tenant: string, limit = 20): Promise<AlertRecord[]> {
  const rows = await (await tenantDocs()).listDocs(tenant, ALERTS, {
    orderBy: { field: "createdAt", dir: "desc" },
    limit,
  });
  return rows.map((d) => ({ id: d.id, ...(d.data as AlertDoc) }));
}

/** Mark one alert (by id) or all unread alerts as read. */
export async function markAlertsRead(tenant: string, id?: string): Promise<void> {
  const store = await tenantDocs();
  if (id) {
    await store.setDoc(tenant, ALERTS, id, { read: true }, { merge: true });
    return;
  }
  // The unread sweep is a newest-first page + an in-memory filter rather than a
  // `where("read","==",false)` query: the generic document seam's equality query
  // takes a STRING value and `read` is a boolean, and widening that contract for
  // one call site is worse than bounding this one. Bounding it is free — the inbox
  // surfaces read 20 alerts, so an alert older than UNREAD_SWEEP_LIMIT is not
  // reachable to be seen, let alone left unread. Each write is the same per-doc
  // merge-set the Firestore batch performed (the batch was already split across
  // several commits at 500, so it was never one atomic sweep either).
  const rows = await store.listDocs(tenant, ALERTS, {
    orderBy: { field: "createdAt", dir: "desc" },
    limit: UNREAD_SWEEP_LIMIT,
  });
  for (const row of rows) {
    if (row.data.read) continue;
    await store.setDoc(tenant, ALERTS, row.id, { read: true }, { merge: true });
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

  const alertIds = new Set(toAlert);
  const fresh = criticals.filter((c) => alertIds.has(c.id));
  if (fresh.length === 0) {
    // Nothing to deliver — still roll the episode memory forward (recovery bands
    // open/close, cooldown tombstones age out) exactly as before.
    await tenantRef.set({ criticalAlertState: nextState }, { merge: true });
    return 0;
  }

  const items: AlertItem[] = fresh.map((c) => ({
    campaignId: c.id,
    name: c.name,
    reason: triage(c, changesById[c.id]).primary?.detail ?? "Vyžaduje pozornost.",
  }));
  const title = `${fresh.length} ${czPlural(
    fresh.length,
    "nová kritická kampaň",
    "nové kritické kampaně",
    "nových kritických kampaní"
  )}`;
  const body = items.map((i) => `${i.name} — ${i.reason}`).join(" · ");

  // In-app inbox first — the durable record that never depends on a 3rd party —
  // and only THEN commit the suppression state. Committing the state before the
  // delivery meant a recordAlert throw left the episodes marked "alerted" while
  // nothing reached the inbox: permanent silence for those campaigns until the
  // cooldown. In this order a crash between the two writes costs at worst a rare
  // duplicate inbox row on the next sync (the state still says un-alerted) —
  // a duplicate is recoverable, a swallowed alert is not.
  // Thread the alert id into the activity feed so the timeline can tie this
  // detection to the change-set later staged from it (alert → change-set → apply).
  const alertId = await recordAlert(tenant, { type: "critical", title, body, items });
  await tenantRef.set({ criticalAlertState: nextState }, { merge: true });
  await recordActivity(tenant, {
    kind: "alert",
    title,
    detail: body,
    actor: "Automatická synchronizace",
    alertId,
  });

  // Outbound webhook (Slack/Teams/…), best-effort.
  await sendWebhook(`${SITE_NAME}: ${title}\n${body}`);

  // The tenant's OWN signed webhook endpoints (WP W1-E). The line above reaches the
  // operator's single ALERT_WEBHOOK_URL; this one reaches the project owner's. Not
  // awaited — a delivery must never delay or fail the alert that produced it.
  void emitOutboundForTenant(userId, tenant, { type: "alert.critical", title, body, data: { alertId, items } });

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
