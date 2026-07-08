import { auth } from "@/auth";
import {
  generateAds,
  generateAnalysis,
  generateChat,
  generateArticleDraft,
  generateBrief,
  generateCohortDiagnosis,
  generateComparisonOutline,
  generateKeywordClusters,
  generateLeadReply,
  generateLeadSourceDiagnosis,
  generateLocalReviewReply,
  generateLpVariantIdeas,
  generateMonthlyRecap,
  generateRepurpose,
} from "@/lib/ai/tools";
import {
  validateAdRequest,
  validateAnalysisRequest,
  validateMonthlyRecapRequest,
  validateChatRequest,
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
import { consume, getUserPlan } from "@/lib/usage";
import { getServerLocale } from "@/lib/i18n/locale";
import { getByomContext } from "@/lib/llm/byom-context";
import { enterLlmRequestContext } from "@/lib/llm/request-context";
import { enterByomForOperation } from "@/lib/llm/byom/request";
import { ByomUserError } from "@/lib/llm/errors";
import type { SupportedLocale } from "@/lib/format";
import type { AiResponse, ChatRequest, MonthlyRecapRequest } from "@/lib/ai-types";
import type { PerformanceData } from "@/lib/types";
import type { ProjectType } from "@/lib/projects/types";
import { getProject } from "@/lib/projects/store";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { leadSignalsPromptText } from "@/lib/lead-signals/summary";
import { getCompetitors } from "@/lib/competitors/store";
import { competitorGroundingText } from "@/lib/competitors/grounding";
import { DEMO_PROJECTS } from "@/lib/demo/projects";
import { getCachedAi, hashAiInput, setCachedAi } from "@/lib/ai/response-cache";
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


/** Cache-then-quota-then-generate for one tool call. An identical (mode, locale,
 *  input) returns the cached result WITHOUT spending the daily quota or re-paying
 *  the model; only a real cache-miss generation is metered. */
async function cachedRespond(
  mode: string,
  value: unknown,
  locale: SupportedLocale,
  userId: string | null,
  gen: () => Promise<AiResponse<unknown>>
): Promise<Response> {
  // The result depends on which provider serves it, so a BYOM caller gets its own
  // cache bucket (vendor + chosen models) and never shares a non-BYOM caller's
  // result — or another vendor/model's.
  const byom = getByomContext();
  const providerTag = byom ? `byom:${byom.vendor}:${byom.model ?? ""}:${byom.fastModel ?? ""}` : "app";
  const key = hashAiInput(mode, locale, value, providerTag);
  const cached = getCachedAi(key);
  if (cached) return Response.json(cached);

  // Per-user daily AI quota (signed-in users) — charged only on a real generation,
  // and SKIPPED for BYOM-served calls: the BYOM plan is unlimited by design (the
  // user pays their own tokens), and the per-IP durable guard above still bounds
  // abuse. A recoverable BYOM fallback to the app provider is rare (our fault /
  // outage) and stays within that per-IP cap.
  if (userId && !byom) {
    const quota = await consume(userId, "aiEval");
    if (!quota.ok) {
      return Response.json(
        {
          error: `Denní limit AI generování vyčerpán (${quota.status.used.aiEval}/${quota.status.limits.aiEval}). Zkuste to zítra nebo přejděte na vyšší plán (ceník na /cena).`,
          code: "quota",
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

/** Czech business-type framing per project type — lets a grounded op (monthly
 *  recap) speak the project's language instead of assuming e-commerce. */
const BUSINESS_TYPE: Record<ProjectType, string> = {
  eshop: "e-shop (e-commerce)",
  app: "digitální produkt / aplikace",
  leadgen: "generování poptávek (leadgen)",
  content: "obsahový web / publisher",
  local: "lokální podnik / služby",
};

/** Resolve the dataset a grounded op (chat, monthly recap) reads, with tenancy. A
 *  demo project id is public; a real project id must belong to the caller. `keyId`
 *  keys the response cache by the EFFECTIVE grounding, so an unowned id can never
 *  serve another tenant's cached answer — it degrades to the shared base result.
 *  `businessType` frames per-type recaps (undefined for the base fallback). */
async function resolveGrounding(
  projectId: string | undefined,
  userId: string | null,
  locale: SupportedLocale
): Promise<{ data?: PerformanceData; keyId: string; businessType?: string; groundingContext?: string }> {
  if (!projectId) return { keyId: "base" };
  const demo = DEMO_PROJECTS.find((p) => p.id === projectId);
  if (demo) {
    const comp = await mergeGrounding(demo.id, leadSignalsPromptText(demo), locale);
    return {
      data: getProjectDataset(demo),
      // C3: the competitor set's version enters the cache key so edits re-generate.
      keyId: comp.keySuffix ? `${demo.id}#${comp.keySuffix}` : demo.id,
      businessType: BUSINESS_TYPE[demo.type],
      // C2 lead-source quality + C3 competitive set → comparative recap grounding.
      groundingContext: comp.text,
    };
  }
  if (userId) {
    const project = await getProject(userId, projectId);
    if (project) {
      // A1: ground on the project's LIVE Ads data when synced, else the sample spine.
      // A live sync's timestamp keys the cache so a re-sync serves fresh, not stale.
      const resolved = await resolveReportDataset(project);
      const comp = await mergeGrounding(project.id, leadSignalsPromptText(project), locale);
      const base = resolved.live && resolved.syncedAt ? `${project.id}@${resolved.syncedAt}` : project.id;
      return {
        data: resolved.data,
        keyId: comp.keySuffix ? `${base}#${comp.keySuffix}` : base,
        businessType: BUSINESS_TYPE[project.type],
        groundingContext: comp.text,
      };
    }
  }
  return { keyId: "base" };
}

/** Combine the lead-signal grounding (C2) with the project's competitor set (C3)
 *  into one grounding block. `keySuffix` carries the competitor set's version so an
 *  edit invalidates the recap cache. */
async function mergeGrounding(
  projectId: string,
  leadText: string | null,
  locale: SupportedLocale
): Promise<{ text?: string; keySuffix?: string }> {
  const set = await getCompetitors(projectId);
  const competitors = competitorGroundingText(set, locale);
  const merged = [leadText, competitors].filter(Boolean).join(" ");
  return { text: merged || undefined, keySuffix: set?.updatedAt };
}

export async function POST(request: Request) {
  // Abuse guards first — this endpoint is a public, unauthenticated POST that
  // shells out to a paid provider, so it must be throttled before any work.
  if (tooLarge(request)) {
    return payloadTooLarge("Požadavek je příliš velký.");
  }
  const limited = await durableGuard(clientIp(request), [RATE_RULES.aiPerMin(), RATE_RULES.aiPerDay()], { spendUnits: 1 });
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
      return Response.json({ error: "Neplatný JSON v požadavku.", code: "invalid" }, { status: 400 });
    }

    mode = (body as { mode?: unknown })?.mode;
    // Output language follows the user's chosen locale, so AI content matches the
    // UI language instead of always being Czech.
    const locale = await getServerLocale();
    // Resolved once: powers the daily quota AND per-project grounding tenancy.
    const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
    const bad = (error: string) => Response.json({ error, code: "invalid" }, { status: 422 });

    // Identity attribution for telemetry (per-user + per-project spend). Best-effort:
    // the projectId is taken from the payload when the caller names one — read back
    // by generateStructured at the recordLlmCall seam.
    const reqProjectId = (body as { projectId?: unknown })?.projectId;
    enterLlmRequestContext({
      ...(userId ? { userId } : {}),
      ...(typeof reqProjectId === "string" && reqProjectId ? { projectId: reqProjectId } : {}),
    });

    // BYOM: resolve the per-operation provider for THIS mode (the matrix override
    // for the tool, else the global active vendor) and enter it into the request
    // context — the helper gates on entitlement (byom plan or the BYOM_MATRIX dev
    // flag). cachedRespond reads it back for the cache key + quota-skip; a
    // non-entitled/anonymous caller resolves to none → the app's own providers.
    const plan = userId ? await getUserPlan(userId) : "free";
    await enterByomForOperation(userId, plan, typeof mode === "string" ? mode : "unknown");

    // Every tool call carries request.signal: when the client aborts (timeout,
    // re-run, closed tab), the wrapper kills the Claude CLI child / cancels the
    // provider request instead of burning a concurrency slot on unread output.
    switch (mode) {
      case "ads": {
        const p = validateAdRequest(body, locale);
        return p.valid ? cachedRespond("ads", p.value, locale, userId, () => generateAds(p.value, locale, request.signal)) : bad(p.error);
      }
      case "brief": {
        const p = validateBriefRequest(body, locale);
        return p.valid ? cachedRespond("brief", p.value, locale, userId, () => generateBrief(p.value, locale, request.signal)) : bad(p.error);
      }
      case "analysis": {
        const p = validateAnalysisRequest(body, locale);
        return p.valid ? cachedRespond("analysis", p.value, locale, userId, () => generateAnalysis(p.value, locale, request.signal)) : bad(p.error);
      }
      case "monthly-recap": {
        const p = validateMonthlyRecapRequest(body, locale);
        if (!p.valid) return bad(p.error);
        // Tenancy-checked per-project grounding + business-type framing; cache by
        // the EFFECTIVE project (keyId) so an unowned id degrades to base.
        const { data, keyId, businessType, groundingContext } = await resolveGrounding(p.value.projectId, userId, locale);
        const value: MonthlyRecapRequest = { ...p.value, projectId: keyId };
        return cachedRespond("monthly-recap", value, locale, userId, () =>
          generateMonthlyRecap(p.value, locale, request.signal, data, businessType, groundingContext)
        );
      }
      case "chat": {
        const p = validateChatRequest(body, locale);
        if (!p.valid) return bad(p.error);
        // Tenancy-checked grounding; cache by the EFFECTIVE project (keyId), so an
        // unowned id degrades to base and never serves another tenant's answer.
        const { data, keyId } = await resolveGrounding(p.value.projectId, userId, locale);
        const value: ChatRequest = { ...p.value, projectId: keyId };
        return cachedRespond("chat", value, locale, userId, () =>
          generateChat(p.value, locale, request.signal, data)
        );
      }
      case "lead-reply": {
        const p = validateLeadReplyRequest(body, locale);
        return p.valid ? cachedRespond("lead-reply", p.value, locale, userId, () => generateLeadReply(p.value, locale, request.signal)) : bad(p.error);
      }
      case "repurpose": {
        const p = validateRepurposeRequest(body, locale);
        return p.valid ? cachedRespond("repurpose", p.value, locale, userId, () => generateRepurpose(p.value, locale, request.signal)) : bad(p.error);
      }
      case "local-review-reply": {
        const p = validateLocalReviewReplyRequest(body, locale);
        return p.valid ? cachedRespond("local-review-reply", p.value, locale, userId, () => generateLocalReviewReply(p.value, locale, request.signal)) : bad(p.error);
      }
      case "article-draft": {
        const p = validateArticleDraftRequest(body, locale);
        return p.valid ? cachedRespond("article-draft", p.value, locale, userId, () => generateArticleDraft(p.value, locale, request.signal)) : bad(p.error);
      }
      case "cohort-diagnosis": {
        const p = validateCohortDiagnosisRequest(body, locale);
        return p.valid ? cachedRespond("cohort-diagnosis", p.value, locale, userId, () => generateCohortDiagnosis(p.value, locale, request.signal)) : bad(p.error);
      }
      case "keyword-clusters": {
        const p = validateKeywordClustersRequest(body, locale);
        return p.valid ? cachedRespond("keyword-clusters", p.value, locale, userId, () => generateKeywordClusters(p.value, locale, request.signal)) : bad(p.error);
      }
      case "comparison-outline": {
        const p = validateComparisonOutlineRequest(body, locale);
        return p.valid ? cachedRespond("comparison-outline", p.value, locale, userId, () => generateComparisonOutline(p.value, locale, request.signal)) : bad(p.error);
      }
      case "lp-variant-ideas": {
        const p = validateLpVariantIdeasRequest(body, locale);
        return p.valid ? cachedRespond("lp-variant-ideas", p.value, locale, userId, () => generateLpVariantIdeas(p.value, locale, request.signal)) : bad(p.error);
      }
      case "lead-source-diagnosis": {
        const p = validateLeadSourceDiagnosisRequest(body, locale);
        return p.valid ? cachedRespond("lead-source-diagnosis", p.value, locale, userId, () => generateLeadSourceDiagnosis(p.value, locale, request.signal)) : bad(p.error);
      }
      default:
        return Response.json({ error: "Neznámý režim nástroje.", code: "invalid" }, { status: 400 });
    }
  } catch (err) {
    // A BYOM user fault (bad/expired key, their account out of credit, a model they
    // picked that isn't available) reaches here from the wrapper — surface it with
    // an actionable message + the "provider" code so the client can point the user
    // at their key settings, instead of the generic failure. No app-provider retry.
    if (err instanceof ByomUserError) {
      const status =
        err.code === "auth" || err.code === "permission" ? 401 : err.code === "quota" ? 429 : 400;
      return Response.json({ error: err.message, code: "provider" }, { status });
    }
    console.error(`[ai] generation failed (mode=${String(mode)}):`, err);
    return Response.json(
      { error: "Generování se nezdařilo. Zkuste to prosím za chvíli znovu.", code: "failed" },
      { status: 502 }
    );
  } finally {
    releaseSlot();
  }
}
