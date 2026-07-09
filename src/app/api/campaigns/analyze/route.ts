/** Evaluate a single campaign or the whole portfolio with the LLM, persist the
 *  report to SQLite and return it. The period is taken from the synced metadata
 *  so a stored report always matches the data currently on screen. */
import { currentUserId } from "@/lib/session";
import { generateCampaignEvaluation } from "@/lib/ai/tools";
import { validateEvaluationRequest } from "@/lib/ai/validation";
import { getPatternLines } from "@/lib/patterns/store";
import { consume, getUserPlan } from "@/lib/usage";
import { enterByomForOperation } from "@/lib/llm/byom/request";
import { ByomUserError } from "@/lib/llm/errors";
import { resolveTenant } from "@/lib/campaigns/connector";
import { getServerLocale } from "@/lib/i18n/locale";
import {
  findCachedReport,
  getCampaign,
  getLatestChanges,
  getReportHistory,
  getSyncMeta,
  hashEvalInputs,
  listCampaigns,
  saveReport,
} from "@/lib/campaigns/store";
import { aggregate, withMetrics, type Campaign } from "@/lib/campaigns/types";
import {
  RATE_RULES,
  acquireSlot,
  clientIp,
  payloadTooLarge,
  releaseSlot,
  tooLarge,
  tooManyRequests,
} from "@/lib/ai/rate-limit";
import { durableGuard } from "@/lib/ai/durable-limit";


export async function POST(request: Request) {
  // Abuse guards first — evaluation is a paid LLM call on a public endpoint.
  if (tooLarge(request)) {
    return payloadTooLarge("Požadavek je příliš velký.");
  }
  const limited = await durableGuard(clientIp(request), [RATE_RULES.evalPerMin(), RATE_RULES.evalPerDay()], { spendUnits: 1 });
  if (!limited.ok) {
    return tooManyRequests(
      limited.retryAfter,
      `Příliš mnoho vyhodnocení. Zkuste to prosím znovu za ${limited.retryAfter} s.`
    );
  }
  if (!acquireSlot()) {
    return tooManyRequests(5, "Server je momentálně vytížený. Zkuste to prosím za chvíli.");
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Neplatný JSON v požadavku." }, { status: 400 });
    }

    const parsed = validateEvaluationRequest(body);
    if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });

    const userId = await currentUserId();
    const rawProjectId = (body as { projectId?: unknown } | null)?.projectId;
    const projectId = typeof rawProjectId === "string" ? rawProjectId : undefined;
    const tenant = await resolveTenant(userId, projectId);

    const meta = await getSyncMeta(tenant);
    const campaigns = await listCampaigns(tenant);
    if (!meta || campaigns.length === 0) {
      return Response.json(
        { error: "Nejdřív synchronizujte kampaně z Google Ads." },
        { status: 409 }
      );
    }

    const { scope } = parsed.value;
    const campaignId = parsed.value.campaignId ?? null;

    let target: Campaign | null = null;
    if (scope === "campaign") {
      target = campaignId ? await getCampaign(tenant, campaignId) : null;
      if (!target) return Response.json({ error: "Kampaň nebyla nalezena." }, { status: 404 });
    }

    // The sync-over-sync diff grounds the prompts in the same change-aware
    // triage the UI badges show (and is folded into the input hash below, so a
    // new sync that moves the diff invalidates the cached report).
    const changes = await getLatestChanges(tenant);

    // Skip the paid LLM call when an identical-input evaluation already exists
    // (same campaigns, same period, same diff). `?force=1` bypasses for a
    // deliberate re-run.
    const reportCampaignId = scope === "campaign" ? campaignId : null;
    const inputHash = hashEvalInputs(
      scope,
      reportCampaignId,
      meta.period,
      campaigns,
      changes?.current ?? null
    );
    const force = new URL(request.url).searchParams.get("force") === "1";
    if (!force) {
      const cached = await findCachedReport(tenant, scope, reportCampaignId, meta.period, inputHash);
      if (cached) {
        const history = await getReportHistory(tenant, scope, reportCampaignId);
        return Response.json({ report: cached, history, cached: true });
      }
    }

    // BYOM: run "campaign-eval" on the caller's assigned provider (matrix override
    // or global active); BYOM-served calls skip the per-user quota.
    const byomPlan = userId ? await getUserPlan(userId) : "free";
    const byom = await enterByomForOperation(userId, byomPlan, "campaign-eval");
    // Per-user daily quota — only counts an actual (non-cached, non-BYOM) LLM call.
    if (userId && !byom) {
      const quota = await consume(userId, "aiEval");
      if (!quota.ok) {
        return Response.json(
          {
            error: `Denní limit AI vyhodnocení vyčerpán (${quota.status.used.aiEval}/${quota.status.limits.aiEval}). Zkuste to zítra nebo přejděte na vyšší plán (ceník na /cena).`,
            upgradeUrl: "/cena",
          },
          { status: 429 }
        );
      }
    }

    // Ground the portfolio eval in the account's own winning patterns, ranked by
    // semantic relevance to the current portfolio situation (RAG).
    let patternLines: string[] | undefined;
    if (scope === "overall") {
      const totals = aggregate(campaigns);
      const rows = campaigns.map(withMetrics);
      const best = [...rows].sort((a, b) => b.roas - a.roas)[0];
      const worst = [...rows].filter((c) => c.cost > 0).sort((a, b) => a.roas - b.roas)[0];
      const query = [
        `Portfolio ROAS ${totals.roas.toFixed(1)}, PNO ${(totals.pno * 100).toFixed(0)} %.`,
        best ? `Nejlepší kampaň ${best.name} (${best.type}).` : "",
        worst ? `Nejslabší kampaň ${worst.name} (${worst.type}).` : "",
      ]
        .filter(Boolean)
        .join(" ");
      patternLines = await getPatternLines(tenant, query);
    }

    try {
      const response = await generateCampaignEvaluation({
        scope,
        target,
        campaigns,
        period: meta.period,
        patternLines,
        changes: changes ?? undefined,
        locale: await getServerLocale(),
        // Client abort propagation: a closed tab / re-run stops the provider work.
        signal: request.signal,
      });
      const report = await saveReport(tenant, {
        scope,
        campaignId: reportCampaignId,
        period: meta.period,
        response,
        inputHash,
      });
      // Return the refreshed history alongside the report so the trend timeline
      // updates without a full reload.
      const history = await getReportHistory(tenant, scope, scope === "campaign" ? campaignId : null);
      return Response.json({ report, history });
    } catch (err) {
      if (err instanceof ByomUserError) {
        const status =
          err.code === "auth" || err.code === "permission" ? 401 : err.code === "quota" ? 429 : 400;
        return Response.json({ error: err.message, code: "provider" }, { status });
      }
      console.error("[campaigns] evaluation failed:", err);
      return Response.json(
        { error: "Vyhodnocení se nezdařilo. Zkuste to prosím za chvíli znovu." },
        { status: 502 }
      );
    }
  } finally {
    releaseSlot();
  }
}
