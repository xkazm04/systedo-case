/** Route significant performance anomalies (cost spikes, revenue drops, outages,
 *  PNO goal-breaches) into the same durable alert inbox + email + webhook pipeline
 *  that campaign criticals already use. The dashboard's anomaly detector only
 *  rendered these inline — so a problem was invisible unless someone opened the
 *  dashboard. Now the hourly cron sync surfaces them proactively, with the same
 *  "already alerted" de-dupe discipline as `evaluateAndAlert`. Server-only. */
import { firestore } from "@/lib/firebase";
import { SITE_NAME } from "@/lib/site";
import { sendEmail, sendWebhook } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { detectAnomalies, anomalyImpact, type Anomaly } from "@/lib/metrics/anomalies";
import { fmtCZKCompact, fmtDate, fmtSignedCZKCompact } from "@/lib/format";
import type { DailyPoint as MetricsDailyPoint } from "@/lib/types";
import type { DailyPoint } from "./types";
import { recordAlert, getUserEmail, type AlertItem } from "./alerts";
import { recordActivity } from "./activity";
import { planSuppression, type AlertState } from "./alert-suppression";
import { getClientProfile } from "./report-config";
import { PAID_PORTFOLIO_TARGET_PNO } from "@/lib/targets";

/** Default PNO goal for anomaly goal-breaches — the ONE paid-portfolio target
 *  (0.18) that triage and reporting also use, instead of the old rogue 0.15 that
 *  split-brained against them. The per-tenant ClientProfile.pnoGoal overrides it
 *  (resolved inside evaluateAnomalyAlerts); an explicit `opts.pnoGoal` still wins. */
export const DEFAULT_PNO_GOAL = PAID_PORTFOLIO_TARGET_PNO;

/** Cap on how many anomalies we spell out in one alert body, by severity. */
const MAX_ITEMS = 5;

/** The campaign series carries `conversionValue` (no `visits`/`revenue`), while the
 *  anomaly detector speaks the dashboard's metric shape. Bridge the two so the
 *  detector can run unchanged; `visits` is absent in this feed (→ 0, which the
 *  detector safely ignores once its std is 0). Clicks/impressions carry through when
 *  present (the widened spine) so a CTR collapse or CPC spike can now alert — absent,
 *  the detector's ratio pass silently skips them (legacy points stay unchanged). */
function toMetricSeries(series: DailyPoint[]): MetricsDailyPoint[] {
  return series.map((p) => ({
    date: p.date,
    visits: 0,
    cost: p.cost,
    conversions: p.conversions,
    revenue: p.conversionValue,
    ...(p.clicks !== undefined ? { clicks: p.clicks } : {}),
    ...(p.impressions !== undefined ? { impressions: p.impressions } : {}),
  }));
}

const KIND_LABEL: Record<Anomaly["kind"], string> = {
  spike: "Nárůst",
  drop: "Pokles",
  outage: "Výpadek",
  "goal-breach": "Překročení cíle PNO",
};

const METRIC_LABEL: Record<string, string> = {
  revenue: "obratu",
  cost: "nákladů",
  conversions: "konverzí",
  visits: "návštěv",
  pno: "PNO",
  ctr: "CTR",
  cpc: "CPC",
};

/** Stable de-dupe key for one flagged day, so the same anomaly never re-alerts. */
function anomalyKey(a: Anomaly): string {
  return `${a.date}|${a.metric}|${a.kind}`;
}

/** One human-readable line per anomaly for the inbox body / email. */
function describe(a: Anomaly): string {
  const what = `${KIND_LABEL[a.kind]} ${METRIC_LABEL[a.metric] ?? a.metric}`;
  if (a.kind === "goal-breach") {
    return `${what} (${fmtDate(a.date)}): PNO ${(a.observed * 100).toFixed(0)} % vs. cíl ${(a.expected * 100).toFixed(0)} %`;
  }
  return `${what} (${fmtDate(a.date)}): ${fmtCZKCompact(a.observed)} oproti očekávaným ${fmtCZKCompact(a.expected)}`;
}

/**
 * Detect anomalies on a freshly-synced series and emit a single alert for the
 * days that are *newly* anomalous. Returns the count of fresh anomalies (0 when
 * nothing new). Best-effort: never throws into the sync loop.
 */
export async function evaluateAnomalyAlerts(
  tenant: string,
  userId: string,
  series: DailyPoint[],
  opts: { pnoGoal?: number } = {}
): Promise<number> {
  // Single source: the tenant's client PNO goal (defaulting to the one paid-
  // portfolio target). An explicit opts.pnoGoal still wins for callers that pass one.
  const pnoGoal = opts.pnoGoal ?? (await getClientProfile(tenant)).pnoGoal;
  const anomalies = detectAnomalies(toMetricSeries(series), { pno: pnoGoal });

  // Hysteresis+cooldown memory, shared with campaign alerts. Anomalies carry no
  // recovery band (a flagged day is discrete), so `banded` is empty — but the
  // cooldown tombstones mean a zero-anomaly sync no longer WIPES the memory (the
  // old bug: the next sync re-alerted the very same days). Runs even when there
  // are zero anomalies, so recovered keys age out through the cooldown window.
  //
  // remindAfterCooldown:false — one alert per detected (day, metric, kind). Each
  // key is a discrete PAST day; while it keeps re-surfacing in the detector's
  // window every 6h sync it must NOT re-alert as a reminder (the campaign-critical
  // "still broken, nudge me" reminder is wrong for a historical day). The key
  // simply ages out once the day leaves the window and stops breaching. The
  // campaign path keeps the default (reminders on) → its behavior is byte-identical.
  const tenantRef = firestore.collection("tenants").doc(tenant);
  const prevState: AlertState = (await tenantRef.get()).data()?.anomalyAlertState ?? {};
  const byKey = new Map(anomalies.map((a) => [anomalyKey(a), a]));
  const { toAlert, nextState } = planSuppression(prevState, {
    breaching: [...byKey.keys()],
    now: Date.now(),
    remindAfterCooldown: false,
  });
  await tenantRef.set({ anomalyAlertState: nextState }, { merge: true });

  const fresh = toAlert.map((k) => byKey.get(k)!).filter(Boolean);
  if (fresh.length === 0) return 0;

  // Most severe first, then cap the spelled-out list.
  const ranked = [...fresh].sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const shown = ranked.slice(0, MAX_ITEMS);

  const items: AlertItem[] = shown.map((a) => ({
    campaignId: `anomaly:${anomalyKey(a)}`,
    name: `${KIND_LABEL[a.kind]} ${METRIC_LABEL[a.metric] ?? a.metric}`,
    reason: describe(a),
  }));

  const impact = anomalyImpact(fresh);
  // Signed helper: a negative net carries a true minus (Intl would emit an ASCII
  // hyphen), and a positive net is explicitly "+" so it cannot read as damage.
  const moneyTail = impact.count > 0 ? ` · dopad ≈ ${fmtSignedCZKCompact(impact.net)}` : "";
  const title = `${fresh.length} ${fresh.length === 1 ? "nová anomálie" : "nových anomálií"} ve výkonu`;
  const extra = fresh.length > shown.length ? ` · +${fresh.length - shown.length} dalších` : "";
  const body = shown.map(describe).join(" · ") + extra + moneyTail;

  // Durable in-app record first, then best-effort outbound channels.
  await recordAlert(tenant, { type: "critical", title, body, items });
  await recordActivity(tenant, {
    kind: "alert",
    title,
    detail: body,
    actor: "Automatická synchronizace",
  });
  await sendWebhook(`${SITE_NAME}: ${title}\n${body}`);

  const email = await getUserEmail(userId);
  if (email) {
    const li = shown
      .map((a) => `<li style="margin:6px 0">${escapeHtml(describe(a))}</li>`)
      .join("");
    const html =
      `<p>Při poslední synchronizaci se objevily nové anomálie ve výkonu kampaní:</p>` +
      `<ul>${li}</ul>` +
      (impact.count > 0 ? `<p>Odhadovaný dopad: <strong>${escapeHtml(fmtSignedCZKCompact(impact.net))}</strong>.</p>` : "") +
      `<p>Otevřete dashboard v ${SITE_NAME} pro detail a doporučené kroky.</p>`;
    await sendEmail(email, `${SITE_NAME}: ${title}`, html);
  }

  return fresh.length;
}
