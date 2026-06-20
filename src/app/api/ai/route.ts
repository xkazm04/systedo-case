import { auth } from "@/auth";
import {
  generateAds,
  generateAnalysis,
  generateArticleDraft,
  generateBrief,
  generateCohortDiagnosis,
  generateComparisonOutline,
  generateKeywordClusters,
  generateLeadReply,
  generateLeadSourceDiagnosis,
  generateLocalReviewReply,
  generateLpVariantIdeas,
  generateRepurpose,
} from "@/lib/ai/tools";
import {
  validateAdRequest,
  validateAnalysisRequest,
  validateArticleDraftRequest,
  validateBriefRequest,
  validateCohortDiagnosisRequest,
  validateComparisonOutlineRequest,
  validateKeywordClustersRequest,
  validateLeadReplyRequest,
  validateLeadSourceDiagnosisRequest,
  validateLocalReviewReplyRequest,
  validateLpVariantIdeasRequest,
  validateRepurposeRequest,
} from "@/lib/ai/validation";
import { consume } from "@/lib/usage";
import { getServerLocale } from "@/lib/i18n/locale";
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

// The Gemini SDK needs the Node.js runtime (not Edge).
export const runtime = "nodejs";

export async function POST(request: Request) {
  // Abuse guards first — this endpoint is a public, unauthenticated POST that
  // shells out to a paid provider, so it must be throttled before any work.
  if (tooLarge(request)) {
    return payloadTooLarge("Požadavek je příliš velký.");
  }
  const limited = rateLimit(clientIp(request), [RATE_RULES.aiPerMin(), RATE_RULES.aiPerDay()]);
  if (!limited.ok) {
    return tooManyRequests(
      limited.retryAfter,
      `Příliš mnoho požadavků. Zkuste to prosím znovu za ${limited.retryAfter} s.`
    );
  }
  if (!acquireSlot()) {
    return tooManyRequests(5, "Server je momentálně vytížený. Zkuste to prosím za chvíli.");
  }

  let mode: unknown;
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Neplatný JSON v požadavku." }, { status: 400 });
    }

    mode = (body as { mode?: unknown })?.mode;
    // Output language follows the user's chosen locale, so AI content matches the
    // UI language instead of always being Czech.
    const locale = await getServerLocale();

    // Per-user daily AI quota (signed-in users); anonymous use is IP-rate-limited.
    if (
      mode === "ads" ||
      mode === "brief" ||
      mode === "analysis" ||
      mode === "lead-reply" ||
      mode === "repurpose" ||
      mode === "local-review-reply" ||
      mode === "article-draft" ||
      mode === "cohort-diagnosis" ||
      mode === "keyword-clusters" ||
      mode === "comparison-outline" ||
      mode === "lp-variant-ideas" ||
      mode === "lead-source-diagnosis"
    ) {
      const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
      if (userId) {
        const quota = await consume(userId, "aiEval");
        if (!quota.ok) {
          return Response.json(
            {
              error: `Denní limit AI generování vyčerpán (${quota.status.used.aiEval}/${quota.status.limits.aiEval}). Zkuste to zítra nebo přejděte na vyšší plán (ceník na /cena).`,
              upgradeUrl: "/cena",
            },
            { status: 429 }
          );
        }
      }
    }

    switch (mode) {
      case "ads": {
        const parsed = validateAdRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateAds(parsed.value, locale));
      }
      case "brief": {
        const parsed = validateBriefRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateBrief(parsed.value, locale));
      }
      case "analysis": {
        const parsed = validateAnalysisRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateAnalysis(parsed.value, locale));
      }
      case "lead-reply": {
        const parsed = validateLeadReplyRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateLeadReply(parsed.value, locale));
      }
      case "repurpose": {
        const parsed = validateRepurposeRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateRepurpose(parsed.value, locale));
      }
      case "local-review-reply": {
        const parsed = validateLocalReviewReplyRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateLocalReviewReply(parsed.value, locale));
      }
      case "article-draft": {
        const parsed = validateArticleDraftRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateArticleDraft(parsed.value, locale));
      }
      case "cohort-diagnosis": {
        const parsed = validateCohortDiagnosisRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateCohortDiagnosis(parsed.value, locale));
      }
      case "keyword-clusters": {
        const parsed = validateKeywordClustersRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateKeywordClusters(parsed.value, locale));
      }
      case "comparison-outline": {
        const parsed = validateComparisonOutlineRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateComparisonOutline(parsed.value, locale));
      }
      case "lp-variant-ideas": {
        const parsed = validateLpVariantIdeasRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateLpVariantIdeas(parsed.value, locale));
      }
      case "lead-source-diagnosis": {
        const parsed = validateLeadSourceDiagnosisRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateLeadSourceDiagnosis(parsed.value, locale));
      }
      default:
        return Response.json({ error: "Neznámý režim nástroje." }, { status: 400 });
    }
  } catch (err) {
    console.error(`[ai] generation failed (mode=${String(mode)}):`, err);
    return Response.json(
      { error: "Generování se nezdařilo. Zkuste to prosím za chvíli znovu." },
      { status: 502 }
    );
  } finally {
    releaseSlot();
  }
}
