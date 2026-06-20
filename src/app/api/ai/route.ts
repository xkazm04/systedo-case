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
import type { SupportedLocale } from "@/lib/format";
import type { AiResponse } from "@/lib/ai-types";
import { getCachedAi, hashAiInput, setCachedAi } from "@/lib/ai/response-cache";
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

/** Cache-then-quota-then-generate for one tool call. An identical (mode, locale,
 *  input) returns the cached result WITHOUT spending the daily quota or re-paying
 *  the model; only a real cache-miss generation is metered. */
async function cachedRespond(
  mode: string,
  value: unknown,
  locale: SupportedLocale,
  gen: () => Promise<AiResponse<unknown>>
): Promise<Response> {
  const key = hashAiInput(mode, locale, value);
  const cached = getCachedAi(key);
  if (cached) return Response.json(cached);

  // Per-user daily AI quota (signed-in users) — charged only on a real generation.
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

  const result = await gen();
  setCachedAi(key, result);
  return Response.json(result);
}

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
    const bad = (error: string) => Response.json({ error }, { status: 422 });

    switch (mode) {
      case "ads": {
        const p = validateAdRequest(body, locale);
        return p.valid ? cachedRespond("ads", p.value, locale, () => generateAds(p.value, locale)) : bad(p.error);
      }
      case "brief": {
        const p = validateBriefRequest(body, locale);
        return p.valid ? cachedRespond("brief", p.value, locale, () => generateBrief(p.value, locale)) : bad(p.error);
      }
      case "analysis": {
        const p = validateAnalysisRequest(body, locale);
        return p.valid ? cachedRespond("analysis", p.value, locale, () => generateAnalysis(p.value, locale)) : bad(p.error);
      }
      case "lead-reply": {
        const p = validateLeadReplyRequest(body, locale);
        return p.valid ? cachedRespond("lead-reply", p.value, locale, () => generateLeadReply(p.value, locale)) : bad(p.error);
      }
      case "repurpose": {
        const p = validateRepurposeRequest(body, locale);
        return p.valid ? cachedRespond("repurpose", p.value, locale, () => generateRepurpose(p.value, locale)) : bad(p.error);
      }
      case "local-review-reply": {
        const p = validateLocalReviewReplyRequest(body, locale);
        return p.valid ? cachedRespond("local-review-reply", p.value, locale, () => generateLocalReviewReply(p.value, locale)) : bad(p.error);
      }
      case "article-draft": {
        const p = validateArticleDraftRequest(body, locale);
        return p.valid ? cachedRespond("article-draft", p.value, locale, () => generateArticleDraft(p.value, locale)) : bad(p.error);
      }
      case "cohort-diagnosis": {
        const p = validateCohortDiagnosisRequest(body, locale);
        return p.valid ? cachedRespond("cohort-diagnosis", p.value, locale, () => generateCohortDiagnosis(p.value, locale)) : bad(p.error);
      }
      case "keyword-clusters": {
        const p = validateKeywordClustersRequest(body, locale);
        return p.valid ? cachedRespond("keyword-clusters", p.value, locale, () => generateKeywordClusters(p.value, locale)) : bad(p.error);
      }
      case "comparison-outline": {
        const p = validateComparisonOutlineRequest(body, locale);
        return p.valid ? cachedRespond("comparison-outline", p.value, locale, () => generateComparisonOutline(p.value, locale)) : bad(p.error);
      }
      case "lp-variant-ideas": {
        const p = validateLpVariantIdeasRequest(body, locale);
        return p.valid ? cachedRespond("lp-variant-ideas", p.value, locale, () => generateLpVariantIdeas(p.value, locale)) : bad(p.error);
      }
      case "lead-source-diagnosis": {
        const p = validateLeadSourceDiagnosisRequest(body, locale);
        return p.valid ? cachedRespond("lead-source-diagnosis", p.value, locale, () => generateLeadSourceDiagnosis(p.value, locale)) : bad(p.error);
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
