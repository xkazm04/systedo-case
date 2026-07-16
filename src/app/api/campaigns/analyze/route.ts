/** Evaluate a single campaign or the whole portfolio with the LLM, persist the
 *  report to SQLite and return it. The period is taken from the synced metadata
 *  so a stored report always matches the data currently on screen. */
import { currentUserId } from "@/lib/session";
import { generateCampaignEvaluation } from "@/lib/ai/tools";
import { validateEvaluationRequest } from "@/lib/ai/validation";
import { getPatternLines } from "@/lib/patterns/store";
import { overallPatternQuery, campaignPatternQuery } from "@/lib/patterns/query";
import { getUserPlan } from "@/lib/usage";
import { enterByomForOperation } from "@/lib/llm/byom/request";
import { ByomUserError } from "@/lib/llm/errors";
import type { AiResponse, CampaignReportResult } from "@/lib/ai-types";
import { runMetered } from "@/app/api/ai/dispatch";
import { resolveTenant } from "@/lib/campaigns/connector";
import { getClientProfile } from "@/lib/campaigns/report-config";
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
import type { Campaign } from "@/lib/campaigns/types";
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
  if (tooLarge(request)) {
    return payloadTooLarge("Požadavek je příliš velký.");
  }
  // Free-path throttle: a per-minute cap guards the cache lookup + DB reads for
  // anonymous callers, but deliberately does NOT touch the daily eval budget or the
  // global spend ceiling. A cache hit is a free repeat, not a paid evaluation — the
  // daily budget + ceiling are charged below only on a real cache-miss generation
  // (matching the batch sibling's cache-first-then-charge order).
  const throttle = await durableGuard(clientIp(request), [RATE_RULES.evalPerMin()]);
  if (!throttle.ok) {
    return tooManyRequests(
      throttle.retryAfter,
      `Příliš mnoho vyhodnocení. Zkuste to prosím znovu za ${throttle.retryAfter} s.`
    );
  }

  {
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
    // A refine re-run is a deliberate steer: bypass the DB report cache like ?force=1,
    // since hashEvalInputs doesn't include the refine note (the note would otherwise be
    // swallowed by the cached report). The response-cache key downstream DOES include it.
    const force = new URL(request.url).searchParams.get("force") === "1" || Boolean(parsed.value.refine);
    if (!force) {
      const cached = await findCachedReport(tenant, scope, reportCampaignId, meta.period, inputHash);
      if (cached) {
        const history = await getReportHistory(tenant, scope, reportCampaignId);
        return Response.json({ report: cached, history, cached: true });
      }
    }

    // Cache miss → a real, paid evaluation. Take the concurrency slot and charge the
    // daily eval budget + global spend ceiling now — never before the cache lookup, so
    // a cached repeat costs neither the daily budget nor the ceiling.
    if (!acquireSlot()) {
      return tooManyRequests(5, "Server je momentálně vytížený. Zkuste to prosím za chvíli.");
    }
    const limited = await durableGuard(
      clientIp(request),
      [RATE_RULES.evalPerDay()],
      { spendUnits: 1 }
    );
    if (!limited.ok) {
      releaseSlot(); // no provider work will run — don't hold the slot for a 429.
      return tooManyRequests(
        limited.retryAfter,
        `Příliš mnoho vyhodnocení. Zkuste to prosím znovu za ${limited.retryAfter} s.`
      );
    }

    try {
    // BYOM: run "campaign-eval" on the caller's assigned provider (matrix override
    // or global active); BYOM-served calls skip the per-user quota. Entered BEFORE
    // runMetered, which reads it back for the cache bucket + quota-skip. The per-user
    // daily quota + the global-ceiling / demo refund are now applied inside runMetered
    // (Direction 1 — one metering chokepoint), not re-implemented here.
    const byomPlan = userId ? await getUserPlan(userId) : "free";
    await enterByomForOperation(userId, byomPlan, "campaign-eval");

    // The tenant's client profile grounds the prompt identity + PNO goal AND the
    // bar its own winning patterns are mined against — resolved once here so the
    // pattern query and the eval prompt share the read (no redundant Firestore hit).
    const client = await getClientProfile(tenant);

    // Ground BOTH eval scopes in the account's own winning patterns (RAG), ranked
    // by relevance and mined against the tenant's own PNO target (client.pnoGoal).
    // Overall: the whole portfolio; per-campaign: that campaign's type + metrics —
    // so a per-campaign eval is grounded too, not just the portfolio verdict.
    const patternQuery =
      scope === "overall" ? overallPatternQuery(campaigns) : target ? campaignPatternQuery(target) : "";
    const patternLines = patternQuery
      ? await getPatternLines(tenant, patternQuery, 6, client.pnoGoal)
      : undefined;

    // The eval input the prompt + cache key are a pure function of (locale/signal are
    // wrapper concerns, folded in only at the generation call).
    const evalInput = {
      scope,
      target,
      campaigns,
      period: meta.period,
      patternLines,
      changes: changes ?? undefined,
      client,
      // Platform-aware persona: a Sklik-sourced tenant gets Sklik vocabulary + no
      // Google-only recommendations (google-ads / sample stay byte-identical).
      source: meta.source,
      // Direction 3: the operator's re-run steer, appended to the USER prompt only. It
      // rides the eval input → the response-cache key, so a steered re-run isn't served
      // the previous cached report (matching the ?force bypass on the DB cache above).
      ...(parsed.value.refine ? { refine: parsed.value.refine } : {}),
    };
    const locale = await getServerLocale();

    try {
      // Route the paid generation through the shared metering core: it charges the
      // per-user daily quota, refunds the ceiling on a cache hit, and — the robustness
      // win — refunds both when the tool degrades to its deterministic demo (a keyless
      // fallback no longer bills as a real evaluation). A quota-exhausted caller gets
      // the shared 429. The DB report cache above already deduped identical inputs.
      const metered = await runMetered("campaign-eval", evalInput, locale, userId, () =>
        generateCampaignEvaluation({
          ...evalInput,
          locale,
          // Client abort propagation: a closed tab / re-run stops the provider work.
          signal: request.signal,
        })
      );
      if (!metered.ok) return metered.response;
      const response = metered.result as AiResponse<CampaignReportResult>;
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
}
