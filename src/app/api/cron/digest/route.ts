/** Weekly digest: a positive, periodic counterpart to the critical-only alert —
 *  for every connected user, email + webhook + in-app a portfolio summary (KPIs,
 *  critical count, top recommended budget moves). The "AI provoz" rollup from the
 *  LLM telemetry the wrapper records (calls, est. cost, demo-rate, repairs,
 *  contract drift) is APP-WIDE, so it goes ONLY to the once-per-run operator
 *  webhook + the cron-run record — never into a tenant's email, which is
 *  client-facing (the digest fans out per user/account/project).
 *
 *  Guarded by CRON_SECRET; schedule lives in vercel.json (weekly). */
import { forEachSyncPair, resolvePairTenant } from "@/lib/cron/fan-out";
import { claimWeeklyDigest, releaseWeeklyDigest } from "@/lib/cron/sent-guard";
import { isoWeekKey } from "@/lib/cron/schedule";
import { recordCronRun } from "@/lib/cron/run";
import { getLatestChanges, getSyncMeta, listCampaigns } from "@/lib/campaigns/store";
import { recommendBudgetMoves } from "@/lib/campaigns/budget-moves";
import { aggregate, indexChanges, withMetrics } from "@/lib/campaigns/types";
import { triage } from "@/lib/campaigns/triage";
import { getUserEmail, recordAlert, type AlertItem } from "@/lib/campaigns/alerts";
import { sendEmail, sendWebhook } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { fmtCZK, fmtMultiple, fmtPct, fmtSignedCZK } from "@/lib/format";
import { aggregateTelemetry, listLlmTelemetrySince } from "@/lib/llm/telemetry";
import { aiOpsLines, summarizeAiOps } from "@/lib/llm/telemetry-ops";
import { cronAuthorized } from "@/lib/cron-auth";
import { listDiagnoses } from "@/lib/diagnoses/store";
import { shouldRunWeeklyDiagnosis } from "@/lib/diagnoses/schedule";
import { runTenantDiagnoses, type DigestDiagnosisResult } from "@/lib/diagnoses/digest-run";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import {
  insightBriefAlertBody,
  insightBriefHtml,
  selectDigestInsights,
} from "@/lib/cron/insight-brief";

export const maxDuration = 300;

/** Build the "Diagnóza týdne" alert body (plain text) + email section (HTML) from
 *  the produced diagnoses. Empty when nothing ran (see Direction 1: the cohort
 *  diagnosis is skipped honestly, and each arm runs only on its own live data).
 *
 *  Wave 1: the ads-performance arm renders beside the lead-source one, and `module`
 *  is where the alert deep-links — the module that OWNS the diagnosis, so a tenant
 *  whose only live data is Ads lands on Výkon instead of an empty lead funnel. */
function renderDiagnosis(d: DigestDiagnosisResult): {
  alertBody: string;
  html: string;
  module: "kvalita-leadu" | "vykon";
} {
  const bodies: string[] = [];
  const rows: string[] = [];
  if (d.leadSource) {
    bodies.push(`Zdroj ${d.leadSource.subject}: ${d.leadSource.recommendation}`);
    rows.push(
      `<li style="margin:6px 0"><strong>Zdroj ${escapeHtml(d.leadSource.subject)}:</strong> ${escapeHtml(
        d.leadSource.recommendation
      )}</li>`
    );
  }
  if (d.ads) {
    bodies.push(`Reklamy — ${d.ads.subject}: ${d.ads.recommendation}`);
    rows.push(
      `<li style="margin:6px 0"><strong>Reklamy — ${escapeHtml(d.ads.subject)}:</strong> ${escapeHtml(
        d.ads.recommendation
      )}</li>`
    );
  }
  if (rows.length === 0) return { alertBody: "", html: "", module: "kvalita-leadu" };
  const html =
    `<p style="margin-top:16px"><strong>Diagnóza týdne</strong></p><ul>` + rows.join("") + `</ul>`;
  // The lead arm keeps the historical destination when it ran; an ads-only week
  // points at the module that actually holds the diagnosis.
  return { alertBody: bodies.join(" · "), html, module: d.leadSource ? "kvalita-leadu" : "vykon" };
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const now = new Date();
  // "Diagnóza týdne": one passive diagnosis per PROJECT per run.
  const diagnosedProjects = new Set<string>();
  const results: {
    userId: string;
    projectId?: string;
    customerId?: string;
    ok: boolean;
    sent?: boolean;
    error?: string;
    /** honest run/skip notes from the passive diagnosis (Direction 1) */
    diagnosisNotes?: string[];
  }[] = [];

  // AI operations rollup over the digest window — global (llmTelemetry is
  // app-wide, not per-tenant), so it is OPERATOR-ONLY: it feeds the once-per-run
  // operator webhook + the cron-run record below and is never embedded in a
  // tenant's email — the digest fans out per (user, account, project), and
  // app-wide call counts / cost / provider health are internal ops data (and a
  // hint of other tenants' activity) that must not reach a client-facing email.
  // Best-effort: the reader returns [] on failure.
  const aiEntries = await listLlmTelemetrySince(new Date(Date.now() - 7 * 86_400_000).toISOString());
  // Pass the raw entries too so the summary carries status counts + latency
  // percentiles (surfaced in the extra aiOpsLines status line).
  const aiOps = summarizeAiOps(aggregateTelemetry(aiEntries), aiEntries);
  const aiLines = aiOpsLines(aiOps);

  // One fan-out spine: iterate only the LINKED (account, project) pairs
  // planSyncTargets resolves — the sync cron already writes exactly these tenants.
  // The old cron fanned out every account × every project, so one client account's
  // data could land in another client's digest email; iterating linked pairs closes
  // that cross-project breach (an unlinked account writes nowhere). Per-pair
  // try/catch lives in the spine (onError below).
  await forEachSyncPair(
    async (pair) => {
      const { userId, account, project } = pair;
      const tenant = await resolvePairTenant(pair);
      const meta = await getSyncMeta(tenant);
      const campaigns = await listCampaigns(tenant);
      if (!meta || campaigns.length === 0) {
        results.push({ userId, projectId: project?.id, ok: true, sent: false });
        return;
      }

      // Weekly double-run guard, CLAIM-FIRST: the digest had none, so a manual
      // re-fire re-sent every tenant's email/alert. Atomically claim this ISO week
      // for the tenant BEFORE recording/sending; a second run in the same week
      // finds it claimed and skips. The winner proceeds to send below.
      if (!(await claimWeeklyDigest(tenant, isoWeekKey(now)))) {
        results.push({ userId, projectId: project?.id, customerId: account?.customerId, ok: true, sent: false });
        return;
      }

      // Claim/release pairing (mirrors the report cron): the claim above is
      // released in the catch below when NOTHING was delivered, so a transient
      // failure doesn't silently consume the tenant's whole week. Once the first
      // durable channel (the in-app digest alert) lands, the claim stands —
      // at-most-once for what was delivered.
      let deliveredAnything = false;
      try {
      const totals = aggregate(campaigns);
      const rows = campaigns.map(withMetrics);
      // Change-aware: a cratering campaign counts as critical in the weekly
      // recap too, matching the table badges and the sync-time alerts.
      const changesById = indexChanges(await getLatestChanges(tenant));
      const criticals = rows.filter(
        (c) => triage(c, changesById[c.id]).severity === "critical"
      ).length;
      const moves = recommendBudgetMoves(rows).moves.slice(0, 3);

      const kpis: [string, string][] = [
        ["Náklady", fmtCZK(totals.cost)],
        ["Hodnota konverzí", fmtCZK(totals.conversionValue)],
        ["ROAS", fmtMultiple(totals.roas)],
        ["PNO", fmtPct(totals.pno)],
      ];

      const items: AlertItem[] = moves.map((m) => ({
        campaignId: m.fromId,
        name: `${m.fromName} → ${m.toName}`,
        reason: `přesunout ${fmtCZK(m.amount)} (${fmtSignedCZK(m.estValueGain)} hodnoty)`,
      }));

      // Name the client account so an agency's per-account digests are distinguishable
      // (subject/text only — never interpolated into the HTML body).
      const title = account
        ? `Týdenní souhrn výkonu (${account.customerName || account.customerId})`
        : "Týdenní souhrn výkonu";
      // Tenant-facing body: campaign KPIs only — the app-wide AI ops rollup
      // (including its demo-rate warning) is operator-only, see above.
      const body =
        `ROAS ${fmtMultiple(totals.roas)} · PNO ${fmtPct(totals.pno)} · ` +
        `${criticals} kritických · ${moves.length} doporučených přesunů`;

      await recordAlert(tenant, { type: "digest", title, body, items });
      deliveredAnything = true;
      await sendWebhook(`Adamant – ${title}: ${body}`);

      // "Diagnóza týdne" + "Přehled týdne": once per project per digest (the weekly
      // claim above already bounds the whole email/alert to one ISO week). This
      // branch is reached only for a connected tenant (meta && campaigns exist →
      // not sample-only).
      let diagnosisHtml = "";
      let insightHtml = "";
      let diagnosisNotes: string[] | undefined;
      if (project && !diagnosedProjects.has(project.id)) {
        diagnosedProjects.add(project.id);

        // Diagnóza týdne: run the gate-tracked lead-source diagnosis over the
        // tenant's REAL resolved data, once per week (the newest digest-produced
        // diagnosis gates re-runs). Direction 1: it runs only on genuinely imported
        // leads; the cohort diagnosis is skipped honestly (recorded in notes).
        const priorDigest = (await listDiagnoses(project.id))
          .filter((d) => d.origin === "digest")
          .map((d) => d.createdAt)
          .sort();
        const shouldRun = shouldRunWeeklyDiagnosis({
          hasLiveData: true,
          lastRunAt: priorDigest.at(-1) ?? null,
          now: now.getTime(),
        });
        if (shouldRun) {
          const diagnosis = await runTenantDiagnoses(project, now, userId);
          diagnosisNotes = diagnosis.notes;
          const { alertBody, html, module } = renderDiagnosis(diagnosis);
          if (alertBody) {
            await recordAlert(tenant, {
              type: "digest",
              title: "Diagnóza týdne",
              body: alertBody,
              items: [],
              href: `/app/${project.id}/${module}`,
            });
            diagnosisHtml = html;
          }
        }

        // Přehled týdne: the week's top computed insights from the SAME
        // deterministic engine + selection the Výkon dashboard uses, over this
        // project's resolved dataset (live when synced, else the honest sample,
        // labeled as such). Zero new LLM calls; the section is omitted when there
        // is nothing worth surfacing.
        const resolved = await resolveReportDataset(project);
        const insightLines = selectDigestInsights(resolved.data, "cs");
        const briefBody = insightBriefAlertBody(insightLines, resolved.live, "cs");
        if (briefBody) {
          await recordAlert(tenant, {
            type: "digest",
            title: "Přehled týdne",
            body: briefBody,
            items: [],
            href: `/app/${project.id}/vykon`,
          });
          insightHtml = insightBriefHtml(insightLines, resolved.live, "cs");
        }
      }

      const email = await getUserEmail(userId);
      if (email) {
        const kpiHtml = kpis
          .map(
            ([k, v]) =>
              `<td style="padding:8px 14px"><div style="font-size:12px;color:#56697a">${k}</div><div style="font-size:18px;font-weight:600;color:#0b1b2b">${v}</div></td>`
          )
          .join("");
        const movesHtml = items.length
          ? `<p style="margin-top:16px">Doporučené přesuny rozpočtu:</p><ul>${items
              .map((i) => `<li style="margin:6px 0">${escapeHtml(i.name)}: ${escapeHtml(i.reason)}</li>`)
              .join("")}</ul>`
          : "";
        const html =
          `<p>Souhrn výkonu vašich kampaní za poslední období:</p>` +
          `<table style="border-collapse:collapse;margin-top:8px"><tr>${kpiHtml}</tr></table>` +
          `<p style="margin-top:12px">${criticals} kampaní vyžaduje pozornost.</p>` +
          movesHtml +
          insightHtml +
          diagnosisHtml +
          `<p style="margin-top:16px">Otevřete přehled v Adamant pro detail a AI vyhodnocení.</p>`;
        await sendEmail(email, `Adamant: ${title}`, html);
      }

      results.push({
        userId,
        projectId: project?.id,
        customerId: account?.customerId,
        ok: true,
        sent: true,
        ...(diagnosisNotes ? { diagnosisNotes } : {}),
      });
      } catch (err) {
        // Nothing reached the tenant → hand the week back so the next run
        // retries it; the sibling report cron documents the same pairing. If
        // even one channel landed, keep the claim (no double-send). The release
        // itself is best-effort — never mask the original error.
        if (!deliveredAnything) {
          try {
            await releaseWeeklyDigest(tenant, isoWeekKey(now));
          } catch (relErr) {
            console.error(`[cron] digest claim release failed for ${tenant}:`, relErr);
          }
        }
        throw err; // onError records the failure per pair
      }
    },
    (pair, err) => {
      const { userId, target } = pair;
      console.error(`[cron] digest failed for ${userId}/${target.projectId}/${target.customerId}:`, err);
      results.push({
        userId,
        projectId: target.projectId,
        customerId: target.customerId ?? undefined,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  );

  // One operator-facing webhook per run (not per tenant) when the AI layer
  // needs attention: demo-rate over threshold or a drifted tool contract.
  if (aiOps.warn || aiOps.driftedTools.length > 0) {
    await sendWebhook(`Adamant – AI provoz (7 dní): ${aiLines.join(" · ")}`);
  }

  const failed = results.filter((r) => !r.ok);
  await recordCronRun("digest", startedAt, {
    ok: failed.length === 0,
    counts: {
      pairs: results.length,
      sent: results.filter((r) => r.sent).length,
      failed: failed.length,
      aiCalls: aiOps.calls,
      aiDrifted: aiOps.driftedTools.length,
    },
    results,
    errors: failed,
  });

  return Response.json({
    users: results.length,
    sent: results.filter((r) => r.sent).length,
    ai: { calls: aiOps.calls, demoRate: aiOps.demoRate, drifted: aiOps.driftedTools.length },
    results,
  });
}
