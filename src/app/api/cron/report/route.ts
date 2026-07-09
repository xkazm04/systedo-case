/** Scheduled client report: for each connected tenant whose report cadence is due
 *  today (weekly = Monday, monthly = 1st), create a fresh shared report and email
 *  the link to the configured recipients (+ in-app + webhook). Reuses the share
 *  link, alert inbox and email infra.
 *
 *  Guarded by CRON_SECRET; runs daily (vercel.json) and self-filters by cadence.
 *  Automatic delivery covers connected live accounts (the cron's user set). */
import { getAdsConnection, listConnectedUserIds } from "@/lib/campaigns/connection";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listProjects } from "@/lib/projects/store";
import { createSharedReport } from "@/lib/campaigns/shared-report";
import { getReportConfig, markReportSent, type ReportCadence } from "@/lib/campaigns/report-config";
import { getUserEmail, recordAlert } from "@/lib/campaigns/alerts";
import { sendEmail, sendWebhook } from "@/lib/email";
import { canonical } from "@/lib/site";
import { cronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 300;

/** Is a cadence due on this date? weekly → Monday, monthly → the 1st (UTC). */
function isDue(cadence: ReportCadence, now: Date): boolean {
  if (cadence === "weekly") return now.getUTCDay() === 1;
  if (cadence === "monthly") return now.getUTCDate() === 1;
  return false;
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const userIds = await listConnectedUserIds();
  const results: { userId: string; projectId?: string; ok: boolean; sent?: boolean; reason?: string }[] = [];

  for (const userId of userIds) {
    const projects = await listProjects(userId);
    const targets = projects.length ? projects : [null];
    for (const project of targets) {
    try {
      const tenant = await resolveTenant(userId, project?.id);
      const config = await getReportConfig(tenant);

      if (!isDue(config.cadence, now) || config.lastSentDay === today) {
        results.push({ userId, projectId: project?.id, ok: true, sent: false, reason: "not-due" });
        continue;
      }

      const accountName =
        (await getAdsConnection(userId))?.customerName ?? project?.name ?? "Ukázkový účet";
      // Client report brand defaults to the project (client) brand, not the vendor.
      const token = await createSharedReport(tenant, accountName, {
        name: project?.name,
        accent: project?.accentColor,
        // R08: carry the client logo so a cron-generated report is branded like the
        // manual share (which already captures it).
        logo: project?.logoUrl,
      });
      if (!token) {
        results.push({ userId, projectId: project?.id, ok: true, sent: false, reason: "no-evaluation" });
        continue;
      }

      const url = canonical(`/report/${token}`);
      const brand = config.brandName || project?.name || accountName;
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

      results.push({ userId, projectId: project?.id, ok: true, sent: true });
    } catch (err) {
      console.error(`[cron] report failed for ${userId}/${project?.id}:`, err);
      results.push({ userId, projectId: project?.id, ok: false, reason: err instanceof Error ? err.message : String(err) });
    }
    }
  }

  return Response.json({ users: results.length, sent: results.filter((r) => r.sent).length, results });
}
