/** Scheduled client report: for each connected tenant whose report cadence is due
 *  today (weekly = Monday, monthly = 1st), create a fresh shared report and email
 *  the link to the configured recipients (+ in-app + webhook). Reuses the share
 *  link, alert inbox and email infra.
 *
 *  Guarded by CRON_SECRET; runs daily (vercel.json) and self-filters by cadence.
 *  Automatic delivery covers connected live accounts (the cron's user set). */
import { forEachSyncPair, resolvePairTenant } from "@/lib/cron/fan-out";
import { createSharedReport } from "@/lib/campaigns/shared-report";
import { getReportConfig, markReportSent, type ReportCadence } from "@/lib/campaigns/report-config";
import { getUserEmail, recordAlert } from "@/lib/campaigns/alerts";
import { sendEmail, sendWebhook, summarizeDelivery } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
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
  const results: {
    userId: string;
    projectId?: string;
    customerId?: string;
    ok: boolean;
    sent?: boolean;
    reason?: string;
  }[] = [];

  // One fan-out spine: iterate only the LINKED (account, project) pairs
  // planSyncTargets resolves (same tenants the sync cron writes). The old cron
  // fanned out every account × every project, so one client account's report could
  // be emailed under another client's project; linked pairs close that breach.
  await forEachSyncPair(
    async (pair) => {
      const { userId, account, project } = pair;
      const tenant = await resolvePairTenant(pair);
      const config = await getReportConfig(tenant);

      if (!isDue(config.cadence, now) || config.lastSentDay === today) {
        results.push({ userId, projectId: project?.id, customerId: account?.customerId, ok: true, sent: false, reason: "not-due" });
        return;
      }

      const accountName = account?.customerName ?? project?.name ?? "Ukázkový účet";
      // Client report brand defaults to the project (client) brand, not the vendor.
      const token = await createSharedReport(tenant, accountName, {
        name: project?.name,
        accent: project?.accentColor,
        // R08: carry the client logo so a cron-generated report is branded like the
        // manual share (which already captures it).
        logo: project?.logoUrl,
      });
      if (!token) {
        results.push({ userId, projectId: project?.id, customerId: account?.customerId, ok: true, sent: false, reason: "no-evaluation" });
        return;
      }

      const url = canonical(`/report/${token}`);
      const brand = config.brandName || project?.name || accountName;
      const title = `Pravidelný report výkonu — ${accountName}`;

      const recipients = config.recipients.length
        ? config.recipients
        : [await getUserEmail(userId)].filter((e): e is string => Boolean(e));

      // accountName / brand are user- and Google-supplied free text; escape them (and
      // encode the URL) before interpolating into the outbound client email — the
      // sibling digest route already does this.
      const html =
        `<p>Je připravený nový report výkonu pro <strong>${escapeHtml(accountName)}</strong>.</p>` +
        `<p><a href="${encodeURI(url)}">Otevřít report</a></p>` +
        `<p style="color:#56697a;font-size:12px">${escapeHtml(brand)} · odkaz je platný 30 dní.</p>`;

      // Guard each recipient: one bad address / transient SMTP error must not abort the
      // rest and skip markReportSent (isDue is true only on the cadence day, so a full
      // abort would never retry this period, leaving a silent partial send). sendEmail
      // is best-effort — it RETURNS false on an HTTP/transport failure rather than
      // throwing, so we count the boolean, not merely "did it not throw".
      const outcomes: boolean[] = [];
      const failed: string[] = [];
      for (const to of recipients) {
        let ok = false;
        try {
          ok = await sendEmail(to, `${brand}: ${title}`, html);
        } catch (mailErr) {
          console.error(`[cron] report email to ${to} threw:`, mailErr);
        }
        outcomes.push(ok);
        if (ok) {
          console.log(`[cron] report email to ${to}: sent`);
        } else {
          console.error(`[cron] report email to ${to}: not delivered`);
          failed.push(to);
        }
      }
      const { delivered, shouldMarkSent } = summarizeDelivery(outcomes);

      await sendWebhook(`${brand} — ${title}: ${url}`);
      await recordAlert(tenant, {
        type: "digest",
        title: "Klientský report odeslán",
        body: `${title} · ${delivered}/${recipients.length} příjemců`,
        items: [],
      });
      // Mark sent only once at least one recipient actually got it, so the report
      // isn't re-sent to everyone on the next daily run — while a TOTAL failure
      // leaves lastSentDay unset so the next run retries the whole batch.
      if (shouldMarkSent) await markReportSent(tenant, today);

      results.push({
        userId,
        projectId: project?.id,
        customerId: account?.customerId,
        ok: failed.length === 0,
        sent: delivered > 0,
        reason: failed.length ? `partial: ${failed.length} recipient(s) failed` : undefined,
      });
    },
    (pair, err) => {
      const { userId, target } = pair;
      console.error(`[cron] report failed for ${userId}/${target.projectId}/${target.customerId}:`, err);
      results.push({
        userId,
        projectId: target.projectId,
        customerId: target.customerId ?? undefined,
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  );

  return Response.json({ users: results.length, sent: results.filter((r) => r.sent).length, results });
}
