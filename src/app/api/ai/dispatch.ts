/** The shared metering + wiring behind every AI tool call (server-only).
 *
 *  Direction 1 ("everyone rides one chokepoint") pulled the metering core and the
 *  descriptor-table wiring out of the /api/ai route so THREE callers can share them:
 *    • the generic /api/ai route (via `cachedRespond`, unchanged behaviour);
 *    • the /api/social/draft delegate (its AI path);
 *    • the /api/campaigns/analyze delegate (its cache-miss generation path).
 *
 *  `runMetered` is the single place daily-quota, the global-ceiling refund, the
 *  demo/BYOM refund, the response cache and abort are applied — so social + campaign
 *  eval inherit exactly what the 19 in-table tools already had, instead of each route
 *  re-implementing (and drifting on) its own copy. It returns a discriminated result
 *  rather than a Response so a delegate can reshape the AiResponse into its own
 *  route-specific envelope; `cachedRespond` is the thin Response-wrapping adapter the
 *  /api/ai route uses (byte-identical to the old inline version). */
import {
  generateAds,
  generateAdsDiagnosis,
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
  generateLocalPage,
  generateLocalReviewReply,
  generateLpVariantDraft,
  generateLpVariantIdeas,
  generateMonthlyRecap,
  generateOnboardingScan,
  generateRepurpose,
  generateSocialPosts,
} from "@/lib/ai/tools";
// W2-C — the local-page grounding lives in lib (it is shared with the publish route).
import { resolveLocalPage } from "@/lib/local-signals/page-grounding";
// W3-B — the lp-variant-draft grounding lives in lib beside the experiments store.
import { resolveLpDraft } from "@/lib/lp-exp/draft-grounding";
import { consume, refund } from "@/lib/usage";
import { refundGlobalSpend } from "@/lib/ai/durable-limit";
import { getByomContext } from "@/lib/llm/byom-context";
import type { SupportedLocale } from "@/lib/format";
import type { AiResponse } from "@/lib/ai-types";
import { fetchSiteText, FeedFetchError } from "@/lib/onboarding/site-fetch";
import { resolveTwinVoice } from "@/lib/twin/load";
import {
  getCachedAi,
  getCachedAiDurable,
  hashAiInput,
  setCachedAi,
  setCachedAiDurable,
} from "@/lib/ai/response-cache";
import { recordRecap, buildStoredRecap, recapInputHash } from "@/lib/recaps";
import { randomUUID } from "node:crypto";
import { createModeTable, type ModeDeps } from "./modes";
import {
  resolveGrounding,
  resolveAdPatterns,
  resolveBrandContext,
  resolveSocialContext,
  resolveLeadGrounding,
  resolveCohortDiagnosis,
  resolveLeadSourceDiagnosis,
  resolveLocalDiagnosis,
  resolveAdsDiagnosis,
} from "./grounding";

/** The real store-/provider-/network-touching wiring behind every mode. The
 *  descriptor table (./modes) declares WHAT each tool does; this binds it to the
 *  concrete generators, grounding resolvers, site fetch and recap persistence. A
 *  22nd tool adds its generator here and one row there — nothing else. */
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
    adsDiagnosis: generateAdsDiagnosis,
    localPage: generateLocalPage,
    lpVariantDraft: generateLpVariantDraft,
    channelResearch: generateChannelResearch,
    onboardingScan: generateOnboardingScan,
    // Social takes a single arg object; adapt it to the (value, locale, signal) Gen shape.
    social: (value, locale, signal) => generateSocialPosts({ ...value, locale, signal }),
  },
  resolveGrounding,
  resolveAdPatterns,
  resolveBrandContext,
  resolveTwinVoice,
  resolveSocialContext,
  resolveLeadGrounding,
  resolveCohortDiagnosis,
  resolveLeadSourceDiagnosis,
  resolveLocalDiagnosis,
  resolveAdsDiagnosis,
  resolveLocalPage,
  resolveLpDraft,
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
export const MODE_TABLE = createModeTable(realDeps);

/** The assembled prompt is a DEBUG channel, not a client one.
 *
 *  `meta.prompt` carries the fully-assembled prompt INCLUDING every server-resolved
 *  grounding the caller never sent — competitor lists, catalog rows, the twin voice
 *  profile, lead/diagnosis figures. `/api/ai` is a public, unauthenticated POST, so
 *  returning it verbatim published that grounding to anyone who could shape an input;
 *  writing it into the durable L2 cache persisted it too. Both egresses are masked
 *  here, at the ONE door every /api/ai response passes through.
 *
 *  The escape hatch is the repo's existing local-inspection flag (`npm run
 *  dev:inspect` → DEV_INSPECT=1), read per call so nothing is baked at module load
 *  and production — which never sets it — cannot be flipped by a stale import.
 *  Consumers treat `meta.prompt` as optional (see AiMeta) and render nothing when
 *  it is absent. */
function inspectEnabled(): boolean {
  return process.env.DEV_INSPECT === "1";
}

/** Strip `meta.prompt` unless local inspection is on. Returns the SAME object when
 *  there is nothing to strip, so the untouched path stays byte-identical. */
function maskPrompt<T>(r: AiResponse<T>): AiResponse<T> {
  if (inspectEnabled() || r.meta?.prompt === undefined) return r;
  const meta = { ...r.meta };
  delete meta.prompt;
  return { ...r, meta };
}

/** The outcome of a metered generation: an error Response (quota exhausted) to return
 *  as-is, or the AiResponse + whether it came from the response cache — so a delegate
 *  can reshape it into its own envelope. */
export type Metered =
  | { ok: true; result: AiResponse<unknown>; cached: boolean }
  | { ok: false; response: Response };

/** Cache-then-quota-then-generate for one tool call — the shared metering core. An
 *  identical (mode, locale, input) returns the cached result WITHOUT spending the
 *  daily quota or re-paying the model; only a real cache-miss generation is metered.
 *  Assumes the caller (guardPaidGeneration / the delegate's own guard) has ALREADY
 *  charged one global spend unit on the daily ceiling for this request. */
export async function runMetered(
  mode: string,
  value: unknown,
  locale: SupportedLocale,
  userId: string | null,
  gen: () => Promise<AiResponse<unknown>>
): Promise<Metered> {
  // The result depends on which provider serves it, so a BYOM caller gets its own
  // cache bucket (vendor + chosen models) and never shares a non-BYOM caller's
  // result — or another vendor/model's.
  const byom = getByomContext();
  const providerTag = byom ? `byom:${byom.vendor}:${byom.model ?? ""}:${byom.fastModel ?? ""}` : "app";
  const key = hashAiInput(mode, locale, value, providerTag);

  // A cache hit does zero provider work, so hand back the ceiling unit the caller
  // already charged before returning — otherwise a hot key drains the ceiling on repeats.
  const cached = getCachedAi(key);
  if (cached) {
    await refundGlobalSpend(1);
    return { ok: true, result: cached, cached: true };
  }

  // L1 miss → consult the durable L2 (cross-instance; survives a deploy that wiped
  // this instance's L1). A durable hit is promoted into L1 by getCachedAiDurable and,
  // like an L1 hit, did zero provider work — so refund the ceiling unit the same way.
  // One durable-store round-trip on this miss path only; the hot L1 path is untouched.
  const durable = await getCachedAiDurable(key);
  if (durable) {
    await refundGlobalSpend(1);
    return { ok: true, result: durable, cached: true };
  }

  // Per-user daily AI quota (signed-in users) — charged only on a real generation,
  // and SKIPPED for BYOM-served calls (the BYOM plan is unlimited by design; the
  // per-IP durable guard still bounds abuse).
  let charged = false;
  if (userId && !byom) {
    const quota = await consume(userId, "aiEval");
    if (!quota.ok) {
      await refundGlobalSpend(1); // no generation will run — release the ceiling unit.
      // A BYOM subscriber only reaches this app-funded counter when their own key
      // is missing/failing (a BYOM-served call skips metering entirely). Telling
      // them to "upgrade" (/cena) is nonsensical — they own the top AI tier — so
      // point them at fixing the key instead and drop the upgrade CTA.
      const onByomPlan = quota.status.plan === "byom";
      return {
        ok: false,
        response: Response.json(
          {
            error: onByomPlan
              ? `Denní limit záložního generování přes náš klíč vyčerpán (${quota.status.used.aiEval}/${quota.status.limits.aiEval}). Přidejte nebo obnovte vlastní API klíč pro neomezené generování.`
              : `Denní limit AI generování vyčerpán (${quota.status.used.aiEval}/${quota.status.limits.aiEval}). Zkuste to zítra nebo přejděte na vyšší plán (ceník na /cena).`,
            code: "quota",
            ...(onByomPlan ? {} : { upgradeUrl: "/cena" }),
          },
          { status: 429 }
        ),
      };
    }
    charged = true;
  }

  let result: AiResponse<unknown>;
  try {
    result = await gen();
  } catch (err) {
    // The generation threw — no billable provider work landed. Hand back both units.
    if (charged && userId) await refund(userId, "aiEval");
    await refundGlobalSpend(1);
    throw err;
  }

  // A demo / no-provider degradation (result.meta.demo) served canned text without
  // touching a paid provider: refund the ceiling unit, and the per-user quota unit if
  // charged — the caller didn't actually consume paid AI.
  if (result.meta?.demo) {
    await refundGlobalSpend(1);
    if (charged && userId) await refund(userId, "aiEval");
  } else if (byom) {
    // BYOM served real work on the user's own tokens — the app ceiling shouldn't
    // count it (we never charged the per-user quota for BYOM above).
    await refundGlobalSpend(1);
  }

  setCachedAi(key, result); // L1 (process-local, synchronous)
  // L2 (durable, fire-and-forget — never awaited). The durable copy outlives the
  // process and is read back by other instances, so the grounded prompt is stripped
  // BEFORE it is persisted, not only on the way out.
  setCachedAiDurable(mode, key, maskPrompt(result));
  return { ok: true, result, cached: false };
}

/** The /api/ai adapter: run the metered generation and wrap it as a JSON Response,
 *  with the assembled prompt masked out of the client egress (see maskPrompt). */
export async function cachedRespond(
  mode: string,
  value: unknown,
  locale: SupportedLocale,
  userId: string | null,
  gen: () => Promise<AiResponse<unknown>>
): Promise<Response> {
  const m = await runMetered(mode, value, locale, userId, gen);
  return m.ok ? Response.json(maskPrompt(m.result)) : m.response;
}
