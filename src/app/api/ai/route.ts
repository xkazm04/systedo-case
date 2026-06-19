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
  generateLocalReviewReply,
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
  validateLocalReviewReplyRequest,
  validateRepurposeRequest,
} from "@/lib/ai/validation";
import { consume } from "@/lib/usage";
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
      mode === "comparison-outline"
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
        return Response.json(await generateAds(parsed.value));
      }
      case "brief": {
        const parsed = validateBriefRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateBrief(parsed.value));
      }
      case "analysis": {
        const parsed = validateAnalysisRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateAnalysis(parsed.value));
      }
      case "lead-reply": {
        const parsed = validateLeadReplyRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateLeadReply(parsed.value));
      }
      case "repurpose": {
        const parsed = validateRepurposeRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateRepurpose(parsed.value));
      }
      case "local-review-reply": {
        const parsed = validateLocalReviewReplyRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateLocalReviewReply(parsed.value));
      }
      case "article-draft": {
        const parsed = validateArticleDraftRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateArticleDraft(parsed.value));
      }
      case "cohort-diagnosis": {
        const parsed = validateCohortDiagnosisRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateCohortDiagnosis(parsed.value));
      }
      case "keyword-clusters": {
        const parsed = validateKeywordClustersRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateKeywordClusters(parsed.value));
      }
      case "comparison-outline": {
        const parsed = validateComparisonOutlineRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateComparisonOutline(parsed.value));
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
