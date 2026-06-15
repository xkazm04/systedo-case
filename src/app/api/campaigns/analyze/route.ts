/** Evaluate a single campaign or the whole portfolio with the LLM, persist the
 *  report to SQLite and return it. The period is taken from the synced metadata
 *  so a stored report always matches the data currently on screen. */
import { generateCampaignEvaluation } from "@/lib/gemini";
import { validateEvaluationRequest } from "@/lib/ai-types";
import {
  getCampaign,
  getReportHistory,
  getSyncMeta,
  listCampaigns,
  saveReport,
} from "@/lib/campaigns/store";
import type { Campaign } from "@/lib/campaigns/types";
import {
  RATE_RULES,
  acquireSlot,
  clientIp,
  payloadTooLarge,
  rateLimit,
  releaseSlot,
  tooLarge,
  tooManyRequests,
} from "@/lib/ai/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Abuse guards first — evaluation is a paid LLM call on a public endpoint.
  if (tooLarge(request)) {
    return payloadTooLarge("Požadavek je příliš velký.");
  }
  const limited = rateLimit(clientIp(request), [RATE_RULES.evalPerMin(), RATE_RULES.evalPerDay()]);
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

    const meta = getSyncMeta();
    const campaigns = listCampaigns();
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
      target = campaignId ? getCampaign(campaignId) : null;
      if (!target) return Response.json({ error: "Kampaň nebyla nalezena." }, { status: 404 });
    }

    try {
      const response = await generateCampaignEvaluation({
        scope,
        target,
        campaigns,
        period: meta.period,
      });
      const report = saveReport({
        scope,
        campaignId: scope === "campaign" ? campaignId : null,
        period: meta.period,
        response,
      });
      // Return the refreshed history alongside the report so the trend timeline
      // updates without a full reload.
      const history = getReportHistory(scope, scope === "campaign" ? campaignId : null);
      return Response.json({ report, history });
    } catch (err) {
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
