/** Weekly digest: a positive, periodic counterpart to the critical-only alert —
 *  for every connected user, email + webhook + in-app a portfolio summary (KPIs,
 *  critical count, top recommended budget moves), plus an "AI provoz" section
 *  rolled up from the LLM telemetry the wrapper already records (calls, est.
 *  cost, demo-rate, repairs, contract drift) — so the operator learns about an
 *  AI cost jump or a silently-down provider without opening anything.
 *
 *  Guarded by CRON_SECRET; schedule lives in vercel.json (weekly). */
import { listConnectedUserIds } from "@/lib/campaigns/connection";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listProjects } from "@/lib/projects/store";
import { getLatestChanges, getSyncMeta, listCampaigns } from "@/lib/campaigns/store";
import { recommendBudgetMoves } from "@/lib/campaigns/budget-moves";
import { aggregate, indexChanges, withMetrics } from "@/lib/campaigns/types";
import { triage } from "@/lib/campaigns/triage";
import { getUserEmail, recordAlert, type AlertItem } from "@/lib/campaigns/alerts";
import { sendEmail, sendWebhook } from "@/lib/email";
import { fmtCZK, fmtMultiple, fmtPct } from "@/lib/format";
import { aggregateTelemetry, listLlmTelemetrySince } from "@/lib/llm/telemetry";
import { aiOpsLines, summarizeAiOps } from "@/lib/llm/telemetry-ops";
import { cronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"
  );
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIds = await listConnectedUserIds();
  const results: { userId: string; projectId?: string; ok: boolean; sent?: boolean; error?: string }[] = [];

  // AI operations rollup over the digest window — global (llmTelemetry is
  // app-wide, not per-tenant), so compute it once per run. Best-effort: the
  // reader returns [] on failure and a quiet week renders no section at all.
  const aiOps = summarizeAiOps(
    aggregateTelemetry(
      await listLlmTelemetrySince(new Date(Date.now() - 7 * 86_400_000).toISOString())
    )
  );
  const aiLines = aiOpsLines(aiOps);
  const aiHtml = aiLines.length
    ? `<p style="margin-top:16px"><strong>AI provoz (7 dní)</strong></p><ul>${aiLines
        .map((l) => `<li style="margin:6px 0">${escapeHtml(l)}</li>`)
        .join("")}</ul>`
    : "";

  for (const userId of userIds) {
    const projects = await listProjects(userId);
    const targets = projects.length ? projects : [null];
    for (const project of targets) {
    try {
      const tenant = await resolveTenant(userId, project?.id);
      const meta = await getSyncMeta(tenant);
      const campaigns = await listCampaigns(tenant);
      if (!meta || campaigns.length === 0) {
        results.push({ userId, projectId: project?.id, ok: true, sent: false });
        continue;
      }

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
        reason: `přesunout ${fmtCZK(m.amount)} (+${fmtCZK(m.estValueGain)} hodnoty)`,
      }));

      const title = "Týdenní souhrn výkonu";
      const body =
        `ROAS ${fmtMultiple(totals.roas)} · PNO ${fmtPct(totals.pno)} · ` +
        `${criticals} kritických · ${moves.length} doporučených přesunů` +
        (aiOps.warn ? " · AI běží převážně v ukázkovém režimu" : "");

      await recordAlert(tenant, { type: "digest", title, body, items });
      await sendWebhook(`Adamant — ${title}: ${body}`);

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
              .map((i) => `<li style="margin:6px 0">${escapeHtml(i.name)} — ${escapeHtml(i.reason)}</li>`)
              .join("")}</ul>`
          : "";
        const html =
          `<p>Souhrn výkonu vašich kampaní za poslední období:</p>` +
          `<table style="border-collapse:collapse;margin-top:8px"><tr>${kpiHtml}</tr></table>` +
          `<p style="margin-top:12px">${criticals} kampaní vyžaduje pozornost.</p>` +
          movesHtml +
          aiHtml +
          `<p style="margin-top:16px">Otevřete přehled v Adamant pro detail a AI vyhodnocení.</p>`;
        await sendEmail(email, `Adamant: ${title}`, html);
      }

      results.push({ userId, projectId: project?.id, ok: true, sent: true });
    } catch (err) {
      console.error(`[cron] digest failed for ${userId}/${project?.id}:`, err);
      results.push({ userId, projectId: project?.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    }
  }

  // One operator-facing webhook per run (not per tenant) when the AI layer
  // needs attention: demo-rate over threshold or a drifted tool contract.
  if (aiOps.warn || aiOps.driftedTools.length > 0) {
    await sendWebhook(`Adamant — AI provoz (7 dní): ${aiLines.join(" · ")}`);
  }

  return Response.json({
    users: results.length,
    sent: results.filter((r) => r.sent).length,
    ai: { calls: aiOps.calls, demoRate: aiOps.demoRate, drifted: aiOps.driftedTools.length },
    results,
  });
}
