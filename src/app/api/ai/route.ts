import { currentUserId } from "@/lib/session";
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
  generateLocalDiagnosis,
  generateLocalReviewReply,
  generateLpVariantIdeas,
  generateMonthlyRecap,
  generateOnboardingScan,
  generateRepurpose,
} from "@/lib/ai/tools";
import { consume, refund, getUserPlan } from "@/lib/usage";
import { refundGlobalSpend } from "@/lib/ai/durable-limit";
import { getServerLocale } from "@/lib/i18n/locale";
import { getByomContext } from "@/lib/llm/byom-context";
import { enterLlmRequestContext } from "@/lib/llm/request-context";
import { enterByomForOperation } from "@/lib/llm/byom/request";
import { ByomUserError } from "@/lib/llm/errors";
import type { SupportedLocale } from "@/lib/format";
import type { AiResponse } from "@/lib/ai-types";
import { fetchSiteText, FeedFetchError } from "@/lib/onboarding/site-fetch";
import { resolveTwinVoice } from "@/lib/twin/load";
import { getCachedAi, hashAiInput, setCachedAi } from "@/lib/ai/response-cache";
import { recordRecap, buildStoredRecap, recapInputHash } from "@/lib/recaps";
import { randomUUID } from "node:crypto";
import { releaseSlot } from "@/lib/ai/rate-limit";
import { guardPaidGeneration } from "@/lib/ai/paid-guard";
import { createModeTable, dispatchMode, type ModeDeps } from "./modes";
import {
  resolveGrounding,
  resolveAdPatterns,
  resolveBrandContext,
  resolveLeadGrounding,
} from "./grounding";


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

/** The real store-/provider-/network-touching wiring behind every mode. The
 *  descriptor table (./modes) declares WHAT each tool does; this binds it to the
 *  concrete generators, grounding resolvers, site fetch and recap persistence. A
 *  22nd tool adds its generator here and one row there — nothing else in this file. */
const realDeps: ModeDeps = {
  gen: {
    ads: generateAds,
    brief: generateBrief,
    analysis: generateAnalysis,
    monthlyRecap: generateMonthlyRecap,
    chat: generateChat,
    twinReply: generateTwinReply,
    twinStyle: generateTwinStyle,
    repurpose: generateRepurpose,
    localReviewReply: generateLocalReviewReply,
    articleDraft: generateArticleDraft,
    cohortDiagnosis: generateCohortDiagnosis,
    keywordClusters: generateKeywordClusters,
    comparisonOutline: generateComparisonOutline,
    lpVariantIdeas: generateLpVariantIdeas,
    leadSourceDiagnosis: generateLeadSourceDiagnosis,
    localDiagnosis: generateLocalDiagnosis,
    channelResearch: generateChannelResearch,
    onboardingScan: generateOnboardingScan,
  },
  resolveGrounding,
  resolveAdPatterns,
  resolveBrandContext,
  resolveTwinVoice,
  resolveLeadGrounding,
  fetchSiteText,
  // A fetch failure is a clear 422 (bad/unreachable URL), not a generic generation
  // error — byte-identical to the old inline onboarding-scan catch.
  onFetchError: (err) => {
    const msg = err instanceof FeedFetchError ? err.message : "Web se nepodařilo načíst.";
    return Response.json({ error: msg, code: "invalid" }, { status: 422 });
  },
  recap: {
    record: recordRecap,
    build: buildStoredRecap,
    inputHash: recapInputHash,
    uuid: randomUUID,
  },
};

/** Built once at module load — the descriptor table is pure per-request state-free
 *  policy; only its injected deps touch the world. */
const MODE_TABLE = createModeTable(realDeps);

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
    const userId = await currentUserId();

    // Identity attribution for telemetry (per-user + per-project spend). Best-effort:
    // the projectId is taken from the payload when the caller names one — read back
    // by generateStructured at the recordLlmCall seam.
    const reqProjectId = (body as { projectId?: unknown })?.projectId;
    const projectIdStr = typeof reqProjectId === "string" && reqProjectId ? reqProjectId : undefined;
    enterLlmRequestContext({
      ...(userId ? { userId } : {}),
      ...(projectIdStr ? { projectId: projectIdStr } : {}),
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
    // provider request instead of burning a concurrency slot on unread output. The
    // per-mode policy (validate / ground / persist / cache-key-rewrite) lives in the
    // descriptor table (./modes); this dispatch is the ONE generic loop over it.
    return await dispatchMode(
      MODE_TABLE,
      typeof mode === "string" ? mode : "",
      { body, locale, userId, projectIdStr, signal: request.signal },
      cachedRespond
    );
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
