import { auth } from "@/auth";
import {
  generateAds,
  generateAnalysis,
  generateChannelResearch,
  generateChat,
  generateArticleDraft,
  generateBrief,
  generateCohortDiagnosis,
  generateComparisonOutline,
  generateKeywordClusters,
  generateTwinReply,
  generateTwinStyle,
  generateLeadSourceDiagnosis,
  generateLocalReviewReply,
  generateLpVariantIdeas,
  generateMonthlyRecap,
  generateOnboardingScan,
  generateRepurpose,
} from "@/lib/ai/tools";
import {
  validateAdRequest,
  validateAnalysisRequest,
  validateChannelResearchRequest,
  validateOnboardingScanRequest,
  validateMonthlyRecapRequest,
  validateChatRequest,
  validateArticleDraftRequest,
  validateBriefRequest,
  validateCohortDiagnosisRequest,
  validateComparisonOutlineRequest,
  validateKeywordClustersRequest,
  validateTwinReplyRequest,
  validateTwinStyleRequest,
  validateLeadSourceDiagnosisRequest,
  validateLocalReviewReplyRequest,
  validateLpVariantIdeasRequest,
  validateRepurposeRequest,
} from "@/lib/ai/validation";
import { consume, refund, getUserPlan } from "@/lib/usage";
import { refundGlobalSpend } from "@/lib/ai/durable-limit";
import { getServerLocale } from "@/lib/i18n/locale";
import { getByomContext } from "@/lib/llm/byom-context";
import { enterLlmRequestContext } from "@/lib/llm/request-context";
import { enterByomForOperation } from "@/lib/llm/byom/request";
import { ByomUserError } from "@/lib/llm/errors";
import type { SupportedLocale } from "@/lib/format";
import type { AiResponse, ChatRequest, MonthlyRecapRequest, LpVariantIdeasRequest, AnalysisPeriod, OnboardingScanRequest } from "@/lib/ai-types";
import { fetchSiteText, FeedFetchError } from "@/lib/onboarding/site-fetch";
import { buildSnapshot } from "@/lib/snapshot";
import type { PerformanceData } from "@/lib/types";
import type { ProjectType } from "@/lib/projects/types";
import { getProject } from "@/lib/projects/store";
import { loadBrandContext } from "@/lib/brand/load";
import { resolveTwinVoice } from "@/lib/twin/load";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { leadSignalsPromptText } from "@/lib/lead-signals/summary";
import { localSignalsPromptText } from "@/lib/local-signals/summary";
import { getCompetitors } from "@/lib/competitors/store";
import { competitorGroundingText } from "@/lib/competitors/grounding";
import { getCostModel } from "@/lib/cost-model/store";
import { profitGroundingText, historyGroundingText } from "@/lib/report/recap-context";
import { DEMO_PROJECTS } from "@/lib/demo/projects";
import { getCachedAi, hashAiInput, setCachedAi } from "@/lib/ai/response-cache";
import { releaseSlot } from "@/lib/ai/rate-limit";
import { guardPaidGeneration } from "@/lib/ai/paid-guard";


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

  // The caller (guardPaidGeneration) has ALREADY charged one global spend unit on the
  // daily ceiling for this request. A cache hit does zero provider work, so hand that
  // unit back before returning — otherwise a hot key drains the ceiling on repeats.
  const cached = getCachedAi(key);
  if (cached) {
    await refundGlobalSpend(1);
    return Response.json(cached);
  }

  // Per-user daily AI quota (signed-in users) — charged only on a real generation,
  // and SKIPPED for BYOM-served calls: the BYOM plan is unlimited by design (the
  // user pays their own tokens), and the per-IP durable guard above still bounds
  // abuse. A recoverable BYOM fallback to the app provider is rare (our fault /
  // outage) and stays within that per-IP cap.
  let charged = false;
  if (userId && !byom) {
    const quota = await consume(userId, "aiEval");
    if (!quota.ok) {
      await refundGlobalSpend(1); // no generation will run — release the ceiling unit.
      return Response.json(
        {
          error: `Denní limit AI generování vyčerpán (${quota.status.used.aiEval}/${quota.status.limits.aiEval}). Zkuste to zítra nebo přejděte na vyšší plán (ceník na /cena).`,
          code: "quota",
          upgradeUrl: "/cena",
        },
        { status: 429 }
      );
    }
    charged = true;
  }

  let result: AiResponse<unknown>;
  try {
    result = await gen();
  } catch (err) {
    // The generation threw — no billable provider work landed. Hand back both the
    // per-user quota unit and the global ceiling unit so a provider outage doesn't
    // silently bill the caller.
    if (charged && userId) await refund(userId, "aiEval");
    await refundGlobalSpend(1);
    throw err;
  }

  // A demo / no-provider degradation (result.meta.demo) served canned text without
  // touching a paid provider: refund the ceiling unit, and the per-user quota unit
  // if we charged one — the caller didn't actually consume paid AI.
  if (result.meta?.demo) {
    await refundGlobalSpend(1);
    if (charged && userId) await refund(userId, "aiEval");
  } else if (byom) {
    // BYOM served real work on the user's own tokens — the app ceiling shouldn't
    // count it (we never charged the per-user quota for BYOM above).
    await refundGlobalSpend(1);
  }

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
  locale: SupportedLocale,
  // R02: the recap period, so the lead-signals breakdown scales to the SAME period
  // lead total the report tile shows (reconciled tile ↔ narrative). Undefined → the
  // sample totals are left unscaled (callers that don't render a report tile).
  period?: AnalysisPeriod
): Promise<{ data?: PerformanceData; keyId: string; businessType?: string; projectType?: ProjectType; groundingContext?: string }> {
  if (!projectId) return { keyId: "base" };
  // The period lead total = the tile's conversion figure (buildSnapshot drives both).
  const targetLeads = (data: PerformanceData) =>
    period ? buildSnapshot(period, "previous", data).current.conversions : undefined;
  const demo = DEMO_PROJECTS.find((p) => p.id === projectId);
  if (demo) {
    const data = getProjectDataset(demo);
    const localText = await localSignalsPromptText(demo, locale);
    const comp = await mergeGrounding(demo.id, leadSignalsPromptText(demo, targetLeads(data)), localText, data, locale);
    return {
      data,
      // C3: the grounding inputs' versions enter the cache key so edits re-generate.
      keyId: comp.keySuffix ? `${demo.id}#${comp.keySuffix}` : demo.id,
      businessType: BUSINESS_TYPE[demo.type],
      // R01: raw type shapes the recap DATA block's metric vocabulary.
      projectType: demo.type,
      // C2 lead-source + C3 competitors + profit/history → deeper recap grounding.
      groundingContext: comp.text,
    };
  }
  if (userId) {
    const project = await getProject(userId, projectId);
    if (project) {
      // A1: ground on the project's LIVE Ads data when synced, else the sample spine.
      // A live sync's timestamp keys the cache so a re-sync serves fresh, not stale.
      const resolved = await resolveReportDataset(project);
      const localText = await localSignalsPromptText(project, locale);
      const comp = await mergeGrounding(project.id, leadSignalsPromptText(project, targetLeads(resolved.data)), localText, resolved.data, locale);
      const base = resolved.live && resolved.syncedAt ? `${project.id}@${resolved.syncedAt}` : project.id;
      return {
        data: resolved.data,
        keyId: comp.keySuffix ? `${base}#${comp.keySuffix}` : base,
        businessType: BUSINESS_TYPE[project.type],
        projectType: project.type,
        groundingContext: comp.text,
      };
    }
  }
  return { keyId: "base" };
}

/** B1 — resolve a project's brand grounding (what it sells + how it talks) for the
 *  content tools (brief, article-draft), with the same demo-public / user-owned
 *  tenancy as resolveGrounding. Returns "" when there's no project or no catalogue,
 *  so the prompt stays byte-identical to the ungrounded path. Reuses the shared
 *  loadBrandContext the social/WeekPlanner endpoints already use, so all content
 *  surfaces ground from one derivation. */
async function resolveBrandContext(
  projectId: string | undefined,
  userId: string | null,
  locale: SupportedLocale
): Promise<string> {
  if (!projectId) return "";
  const demo = DEMO_PROJECTS.find((p) => p.id === projectId);
  if (demo) return loadBrandContext(demo, locale);
  if (userId) {
    const project = await getProject(userId, projectId);
    if (project) return loadBrandContext(project, locale);
  }
  return "";
}

/** Combine the recap grounding inputs into one block: lead-signals (C2), the
 *  competitor set (C3), true net profit (A3 cost model) and the 12-month history.
 *  `keySuffix` carries the competitor + cost-model versions so an edit invalidates
 *  the recap cache. */
async function mergeGrounding(
  projectId: string,
  leadText: string | null,
  // R06: map-pack coverage + review sentiment for a local project (null otherwise),
  // resolved by the caller (it needs the project object, not just the id).
  localText: string | null,
  data: PerformanceData | undefined,
  locale: SupportedLocale
): Promise<{ text?: string; keySuffix?: string }> {
  const [set, costModel] = await Promise.all([getCompetitors(projectId), getCostModel(projectId)]);
  const merged = [
    leadText,
    localText,
    competitorGroundingText(set, locale),
    profitGroundingText(data, costModel, locale),
    historyGroundingText(data, locale),
  ]
    .filter(Boolean)
    .join(" ");
  const keySuffix = [set?.updatedAt, costModel?.updatedAt].filter(Boolean).join("|");
  return { text: merged || undefined, keySuffix: keySuffix || undefined };
}

/** D4: the account's lead-quality / CVR grounding for LP-experiment hypotheses,
 *  tenancy-checked (demo public, real id owner-only). Leadgen/local only (else the
 *  summary is null). keyId keys the cache by the effective project. */
async function resolveLeadGrounding(
  projectId: string | undefined,
  userId: string | null
): Promise<{ text?: string; keyId: string }> {
  if (!projectId) return { keyId: "base" };
  const demo = DEMO_PROJECTS.find((p) => p.id === projectId);
  if (demo) return { text: leadSignalsPromptText(demo) ?? undefined, keyId: demo.id };
  if (userId) {
    const project = await getProject(userId, projectId);
    if (project) return { text: leadSignalsPromptText(project) ?? undefined, keyId: project.id };
  }
  return { keyId: "base" };
}

export async function POST(request: Request) {
  // Abuse guards first — this endpoint is a public, unauthenticated POST that
  // shells out to a paid provider, so it must be throttled before any work. The
  // full tooLarge → durableGuard → acquireSlot sequence lives in guardPaidGeneration;
  // releaseSlot() below pairs with the slot it took on a null (proceed) return.
  const guard = await guardPaidGeneration(request);
  if (guard) return guard;

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
        if (!p.valid) return bad(p.error);
        // Ground the brief in the project's real product/voice (B1). Server-derived
        // so the client can't spoof it; enters the cache key so different brands
        // don't collide. Empty for public/demo-less calls → prompt unchanged.
        p.value.brand = await resolveBrandContext(p.value.projectId, userId, locale);
        return cachedRespond("brief", p.value, locale, userId, () => generateBrief(p.value, locale, request.signal));
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
        const { data, keyId, businessType, projectType, groundingContext } = await resolveGrounding(p.value.projectId, userId, locale, p.value.period);
        const value: MonthlyRecapRequest = { ...p.value, projectId: keyId };
        return cachedRespond("monthly-recap", value, locale, userId, () =>
          generateMonthlyRecap(p.value, locale, request.signal, data, businessType, groundingContext, projectType)
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
      case "twin-reply": {
        const p = validateTwinReplyRequest(body, locale);
        if (p.valid) {
          // Ground the reply in the project's real offering (what they sell + how
          // they talk), upgrading the plain brand name the client sends. Falls back
          // to that name when there's no catalog. USER-prompt only → golden holds.
          p.value.brand = (await resolveBrandContext(p.value.projectId, userId, locale)) || p.value.brand;
        }
        return p.valid ? cachedRespond("twin-reply", p.value, locale, userId, () => generateTwinReply(p.value, locale, request.signal)) : bad(p.error);
      }
      case "twin-style": {
        const p = validateTwinStyleRequest(body, locale);
        if (p.valid) {
          // Same brand grounding: a voice distilled with no idea what the business
          // sells drifts into generic "be friendly and professional" advice.
          p.value.brand = (await resolveBrandContext(p.value.projectId, userId, locale)) || p.value.brand;
        }
        return p.valid ? cachedRespond("twin-style", p.value, locale, userId, () => generateTwinStyle(p.value, locale, request.signal)) : bad(p.error);
      }
      case "repurpose": {
        const p = validateRepurposeRequest(body, locale);
        if (p.valid) {
          // Write the variant in the twin's trained voice. A newsletter is an email,
          // everything else is a social post — so the scope follows the channel and
          // falls back to the generic register. Resolved server-side (tenancy-checked)
          // and injected into the USER prompt only, so the golden holds. Because the
          // voice enters `p.value`, retraining it naturally busts the response cache.
          const scope = p.value.channels.includes("Newsletter") ? "email" : "social";
          p.value.voice = await resolveTwinVoice(p.value.projectId, userId, scope);
        }
        return p.valid ? cachedRespond("repurpose", p.value, locale, userId, () => generateRepurpose(p.value, locale, request.signal)) : bad(p.error);
      }
      case "local-review-reply": {
        const p = validateLocalReviewReplyRequest(body, locale);
        return p.valid ? cachedRespond("local-review-reply", p.value, locale, userId, () => generateLocalReviewReply(p.value, locale, request.signal)) : bad(p.error);
      }
      case "article-draft": {
        const p = validateArticleDraftRequest(body, locale);
        if (!p.valid) return bad(p.error);
        // Same brand grounding as the brief so the drafted article stays on-brand (B1).
        p.value.brand = await resolveBrandContext(p.value.projectId, userId, locale);
        return cachedRespond("article-draft", p.value, locale, userId, () => generateArticleDraft(p.value, locale, request.signal));
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
        if (!p.valid) return bad(p.error);
        // D4: ground the challenger hypotheses in the account's lead-quality / CVR
        // picture (tenancy-checked), cache by the effective project so an unowned id
        // degrades to base and can't serve another tenant's grounded variants.
        const { text, keyId } = await resolveLeadGrounding(p.value.projectId, userId);
        const value: LpVariantIdeasRequest = { ...p.value, projectId: keyId };
        return cachedRespond("lp-variant-ideas", value, locale, userId, () =>
          generateLpVariantIdeas(p.value, locale, request.signal, text)
        );
      }
      case "lead-source-diagnosis": {
        const p = validateLeadSourceDiagnosisRequest(body, locale);
        return p.valid ? cachedRespond("lead-source-diagnosis", p.value, locale, userId, () => generateLeadSourceDiagnosis(p.value, locale, request.signal)) : bad(p.error);
      }
      case "channel-research": {
        const p = validateChannelResearchRequest(body, locale);
        return p.valid ? cachedRespond("channel-research", p.value, locale, userId, () => generateChannelResearch(p.value, locale, request.signal)) : bad(p.error);
      }
      case "onboarding-scan": {
        // This mode makes the server fetch a caller-supplied URL. Even behind the
        // SSRF guard, only signed-in users may drive that outbound fetch — an
        // anonymous caller must not be able to use us as a fetch proxy.
        if (!userId) {
          return Response.json(
            { error: "Pro sken webu se přihlaste.", code: "auth" },
            { status: 401 }
          );
        }
        const p = validateOnboardingScanRequest(body, locale);
        if (!p.valid) return bad(p.error);
        // Fetch the user's OWN homepage server-side (SSRF-guarded) and inject the
        // extracted text — the client never supplies page content. A fetch failure is
        // a clear 422 (bad/unreachable URL), not a generic generation error. Cache by
        // the client value (url/type/brand), not the fetched text.
        let site: { title: string; description: string; text: string };
        try {
          site = await fetchSiteText(p.value.url);
        } catch (err) {
          const msg = err instanceof FeedFetchError ? err.message : "Web se nepodařilo načíst.";
          return Response.json({ error: msg, code: "invalid" }, { status: 422 });
        }
        if (site.text.length < 40) {
          return bad("Na webu jsem nenašel dost textu ke skenu. Zkuste jinou stránku (např. hlavní).");
        }
        const full: OnboardingScanRequest = {
          ...p.value,
          pageText: site.text,
          ...(site.title ? { siteTitle: site.title } : {}),
          ...(site.description ? { siteDescription: site.description } : {}),
        };
        return cachedRespond("onboarding-scan", p.value, locale, userId, () =>
          generateOnboardingScan(full, locale, request.signal)
        );
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
