/** Route significant performance anomalies (cost spikes, revenue drops, outages,
 *  PNO goal-breaches) into the same durable alert inbox + email + webhook pipeline
 *  that campaign criticals already use. The dashboard's anomaly detector only
 *  rendered these inline — so a problem was invisible unless someone opened the
 *  dashboard. Now the hourly cron sync surfaces them proactively, with the same
 *  "already alerted" de-dupe discipline as `evaluateAndAlert`. Server-only. */
import { firestore } from "@/lib/firebase";
import { SITE_NAME } from "@/lib/site";
import { sendEmail, sendWebhook } from "@/lib/email";
import { detectAnomalies, anomalyImpact, type Anomaly } from "@/lib/metrics/anomalies";
import { fmtCZKCompact, fmtDate, fmtSignedCZKCompact } from "@/lib/format";
import type { DailyPoint as MetricsDailyPoint } from "@/lib/types";
import type { DailyPoint } from "./types";
import { recordAlert, getUserEmail, type AlertItem } from "./alerts";
import { recordActivity } from "./activity";

/** Default PNO target when a tenant carries no explicit goal (matches the
 *  case-study client's 0.15). Anomaly goal-breaches are measured against this. */
export const DEFAULT_PNO_GOAL = 0.15;

/** Cap on how many anomalies we spell out in one alert body, by severity. */
const MAX_ITEMS = 5;

/** The campaign series carries `conversionValue` (no `visits`/`revenue`), while the
 *  anomaly detector speaks the dashboard's metric shape. Bridge the two so the
 *  detector can run unchanged; `visits` is absent in this feed (→ 0, which the
 *  detector safely ignores once its std is 0). */
function toMetricSeries(series: DailyPoint[]): MetricsDailyPoint[] {
  return series.map((p) => ({
    date: p.date,
    visits: 0,
    cost: p.cost,
    conversions: p.conversions,
    revenue: p.conversionValue,
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
  const pnoGoal = opts.pnoGoal ?? DEFAULT_PNO_GOAL;
  const anomalies = detectAnomalies(toMetricSeries(series), { pno: pnoGoal });
  if (anomalies.length === 0) {
    // Clear the remembered set so a future recurrence re-alerts cleanly.
    await firestore.collection("tenants").doc(tenant).set({ alertedAnomalyKeys: [] }, { merge: true });
    return 0;
  }

  const currentKeys = anomalies.map(anomalyKey);
  const tenantRef = firestore.collection("tenants").doc(tenant);
  const prev: string[] = (await tenantRef.get()).data()?.alertedAnomalyKeys ?? [];
  const fresh = anomalies.filter((a) => !prev.includes(anomalyKey(a)));

  // Remember the full current set so resolved days drop and can re-alert later.
  await tenantRef.set({ alertedAnomalyKeys: currentKeys }, { merge: true });
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"
  );
}
