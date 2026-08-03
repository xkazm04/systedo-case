/** Social-post drafting: topic + tone + platforms → one tailored caption per
 *  platform. Two modes:
 *   - template (default): deterministic, instant, free.
 *   - ai:true: the LLM social tool (richer copy), IP-throttled + per-user AI quota,
 *     with the deterministic templates as the demo fallback.
 *
 *  Direction 1 ("everyone rides one chokepoint"): the AI path is now a THIN DELEGATE.
 *  The social tool is a real /api/ai mode row (src/app/api/ai/modes.ts): its server-
 *  side grounding (perf / brand / competitor) + trained twin voice are resolved in the
 *  row's prepare(), and the generation runs through the shared `runMetered` core — so
 *  social inherits the response cache, the cache-hit ceiling refund, the demo refund
 *  (canned templates no longer bill as real) and abort, exactly like the other tools.
 *  This route keeps only what is genuinely route-specific: the free template mode, the
 *  IP throttle + concurrency slot, and reshaping the AiResponse into the {drafts,
 *  source, model, tookMs} envelope its clients already consume (so they don't change). */
import { currentUserId } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import { enterByomForOperation } from "@/lib/llm/byom/request";
import { enterLlmRequestContext } from "@/lib/llm/request-context";
import { ByomUserError } from "@/lib/llm/errors";
import { getServerLocale } from "@/lib/i18n/locale";
import { draftPosts } from "@/lib/social/draft";
import type { SocialDraftResult } from "@/lib/social/types";
import type { AiResponse } from "@/lib/ai-types";
import { validateSocialRequest } from "@/lib/ai/validation";
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
import type { DispatchCtx } from "@/app/api/ai/modes";
import { MODE_TABLE, runMetered } from "@/app/api/ai/dispatch";

export async function POST(request: Request) {
  if (tooLarge(request)) return payloadTooLarge("Požadavek je příliš velký.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const parsed = validateSocialRequest(body, await getServerLocale());
  if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
  const value = parsed.value;

  // Template mode — deterministic, instant, no quota. Carry the project brand so
  // captions never sign off as a placeholder company.
  if ((body as { ai?: unknown }).ai !== true) {
    return Response.json({ drafts: draftPosts(value.topic, value.tone, value.platforms, value.brand), source: "template" });
  }

  // AI mode — a paid model call: throttle + per-user daily quota (the latter now
  // charged inside runMetered, not here).
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

  try {
    const userId = await currentUserId();
    const plan = userId ? await getUserPlan(userId) : "free";
    // BYOM: an entitled caller runs "social" on their assigned provider (matrix
    // override or global active); BYOM-served calls skip the per-user quota. Entered
    // BEFORE runMetered, which reads it back for the cache bucket + quota-skip.
    await enterByomForOperation(userId, plan, "social");
    const locale = await getServerLocale();
    enterLlmRequestContext({
      ...(userId ? { userId } : {}),
      ...(value.projectId ? { projectId: value.projectId } : {}),
    });

    // The social mode row resolves the server-side grounding (perf / brand /
    // competitor) + trained twin voice into the SocialSkillInput, then hands back the
    // cacheValue + metered generation. No guard on this row, so prepare() is called
    // directly with the already-validated value.
    const ctx: DispatchCtx = {
      body,
      locale,
      userId,
      projectIdStr: value.projectId,
      signal: request.signal,
    };
    const prepared = await MODE_TABLE["social"].prepare(value, ctx);
    if (prepared instanceof Response) return prepared;
    const metered = await runMetered("social", prepared.cacheValue, locale, userId, prepared.gen);
    if (!metered.ok) return metered.response;
    const res = metered.result as AiResponse<SocialDraftResult>;
    return Response.json({
      drafts: res.result.posts,
      source: res.meta.demo ? "demo" : "ai",
      model: res.meta.model,
      tookMs: res.meta.tookMs,
      // This delegate FLATTENS the AiResponse into its own envelope, so the wrapper's
      // honesty fields have to be carried explicitly or they die here. Additive +
      // omitted on a clean answer, so today's payload is byte-identical.
      ...(res.meta.status ? { status: res.meta.status } : {}),
      ...(res.meta.repaired ? { repaired: true } : {}),
      ...(res.meta.violations?.length ? { violations: res.meta.violations } : {}),
    });
  } catch (err) {
    if (err instanceof ByomUserError) {
      const status =
        err.code === "auth" || err.code === "permission" ? 401 : err.code === "quota" ? 429 : 400;
      return Response.json({ error: err.message, code: "provider" }, { status });
    }
    console.error("[social] AI draft failed:", err);
    return Response.json(
      { error: "Návrh se nezdařil. Zkuste to prosím za chvíli znovu." },
      { status: 502 }
    );
  } finally {
    releaseSlot();
  }
}
