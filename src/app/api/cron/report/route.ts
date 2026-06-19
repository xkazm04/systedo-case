/** Scheduled client report: for each connected tenant whose report cadence is due
 *  today (weekly = Monday, monthly = 1st), create a fresh shared report and email
 *  the link to the configured recipients (+ in-app + webhook). Reuses the share
 *  link, alert inbox and email infra.
 *
 *  Guarded by CRON_SECRET; runs daily (vercel.json) and self-filters by cadence.
 *  Automatic delivery covers connected live accounts (the cron's user set). */
import { getAdsConnection, listConnectedUserIds } from "@/lib/campaigns/connection";
import { resolveTenant } from "@/lib/campaigns/connector";
import { createSharedReport } from "@/lib/campaigns/shared-report";
import { getReportConfig, markReportSent, type ReportCadence } from "@/lib/campaigns/report-config";
import { getUserEmail, recordAlert } from "@/lib/campaigns/alerts";
import { sendEmail, sendWebhook } from "@/lib/email";
import { canonical } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Is a cadence due on this date? weekly → Monday, monthly → the 1st (UTC). */
function isDue(cadence: ReportCadence, now: Date): boolean {
  if (cadence === "weekly") return now.getUTCDay() === 1;
  if (cadence === "monthly") return now.getUTCDate() === 1;
  return false;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const userIds = await listConnectedUserIds();
  const results: { userId: string; ok: boolean; sent?: boolean; reason?: string }[] = [];

  for (const userId of userIds) {
    try {
      const tenant = await resolveTenant(userId);
      const config = await getReportConfig(tenant);

      if (!isDue(config.cadence, now) || config.lastSentDay === today) {
        results.push({ userId, ok: true, sent: false, reason: "not-due" });
        continue;
      }

      const accountName = (await getAdsConnection(userId))?.customerName ?? "Ukázkový účet";
      const token = await createSharedReport(tenant, accountName);
      if (!token) {
        results.push({ userId, ok: true, sent: false, reason: "no-evaluation" });
        continue;
      }

      const url = canonical(`/report/${token}`);
      const brand = config.brandName || "Adamant";
      const title = `Pravidelný report výkonu — ${accountName}`;

      const recipients = config.recipients.length
        ? config.recipients
        : [await getUserEmail(userId)].filter((e): e is string => Boolean(e));

      const html =
        `<p>Je připravený nový report výkonu pro <strong>${accountName}</strong>.</p>` +
        `<p><a href="${url}">Otevřít report</a></p>` +
        `<p style="color:#56697a;font-size:12px">${brand} · odkaz je platný 30 dní.</p>`;
      for (const to of recipients) {
        await sendEmail(to, `${brand}: ${title}`, html);
      }

      await sendWebhook(`${brand} — ${title}: ${url}`);
      await recordAlert(tenant, {
        type: "digest",
        title: "Klientský report odeslán",
        body: `${title} · ${recipients.length} příjemců`,
        items: [],
      });
      await markReportSent(tenant, today);

      results.push({ userId, ok: true, sent: true });
    } catch (err) {
      console.error(`[cron] report failed for ${userId}:`, err);
      results.push({ userId, ok: false, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ users: results.length, sent: results.filter((r) => r.sent).length, results });
}
