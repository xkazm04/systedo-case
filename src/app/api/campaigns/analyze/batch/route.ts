/** Batch evaluation: walk the whole portfolio (overall + every campaign) in one
 *  request and only pay for targets whose current input fingerprint has no
 *  stored report — the "re-evaluate whatever changed" power move after a sync.
 *  Combined with the stale badges this is one-click portfolio hygiene: cached
 *  (unchanged) targets cost nothing, quota exhaustion stops the walk gracefully
 *  and reports what remains. Signed-in only (the anonymous shared `sample`
 *  tenant must not be able to burn a batch of paid calls), sequential
 *  (concurrency 1 — the same discipline as the client-side flagged queue).
 *
 *  A NEW sibling of the gate-hashed analyze route: reuses the identical
 *  hash/cache/save seams from the store, so neither the hashed route nor the
 *  LLM chokepoint is touched. */
import { currentUserId } from "@/lib/session";
import { generateCampaignEvaluation } from "@/lib/ai/tools";
import { getPatternLines } from "@/lib/patterns/store";
import { consume, getUserPlan } from "@/lib/usage";
import { enterByomForOperation } from "@/lib/llm/byom/request";
import { ByomUserError } from "@/lib/llm/errors";
import { resolveTenant } from "@/lib/campaigns/connector";
import { getServerLocale } from "@/lib/i18n/locale";
import {
  findCachedReport,
  getLatestChanges,
  getSyncMeta,
  hashEvalInputs,
  listCampaigns,
  saveReport,
} from "@/lib/campaigns/store";
import { aggregate, indexChanges, withMetrics, type Campaign } from "@/lib/campaigns/types";
import { triageWeight } from "@/lib/campaigns/triage";
import type { EvalScope } from "@/lib/ai-types";
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

// A portfolio of sequential model calls takes a while — same budget as the cron.
export const maxDuration = 300;

interface BatchTarget {
  /** report key: "overall" or the campaign id */
  key: string;
  scope: EvalScope;
  campaign: Campaign | null;
  inputHash: string;
}

export async function POST(request: Request) {
  if (tooLarge(request)) {
    return payloadTooLarge("Požadavek je příliš velký.");
  }

  const userId = await currentUserId();
  if (!userId) {
    return Response.json(
      { error: "Hromadné vyhodnocení je dostupné jen přihlášeným uživatelům." },
      { status: 401 }
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine */
  }
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

  // Same change-aware fingerprint recipe as the single analyze route, so a
  // report this batch would produce is byte-cacheable by that route and
  // vice versa.
  const changes = await getLatestChanges(tenant);
  const changesById = indexChanges(changes);

  // Overall first, then campaigns in triage order — the documented order a PPC
  // manager should spend evaluation credits, so quota exhaustion cuts off the
  // least urgent tail, never the portfolio verdict.
  const ordered = campaigns
    .map(withMetrics)
    .sort((a, b) => triageWeight(b, changesById[b.id]) - triageWeight(a, changesById[a.id]));
  const targets: BatchTarget[] = [
    {
      key: "overall",
      scope: "overall",
      campaign: null,
      inputHash: hashEvalInputs("overall", null, meta.period, campaigns, changes?.current ?? null),
    },
    ...ordered.map((c) => ({
      key: c.id,
      scope: "campaign" as const,
      campaign: campaigns.find((x) => x.id === c.id) ?? null,
      inputHash: hashEvalInputs("campaign", c.id, meta.period, campaigns, changes?.current ?? null),
    })),
  ];

  // Cache pass first (free): only targets whose data moved since their last
  // stored report go on the paid list.
  const cached: string[] = [];
  const pending: BatchTarget[] = [];
  for (const target of targets) {
    const hit = await findCachedReport(
      tenant,
      target.scope,
      target.scope === "campaign" ? target.key : null,
      meta.period,
      target.inputHash
    );
    if (hit) cached.push(target.key);
    else pending.push(target);
  }

  if (pending.length === 0) {
    return Response.json({ evaluated: [], cached, remaining: [], quotaExhausted: false });
  }

  // Durable abuse/spend ceiling, charged for the whole planned batch up front —
  // a batch must not be a way around the per-request eval budget.
  const limited = await durableGuard(
    clientIp(request),
    [RATE_RULES.evalPerMin(), RATE_RULES.evalPerDay()],
    { spendUnits: pending.length }
  );
  if (!limited.ok) {
    return tooManyRequests(
      limited.retryAfter,
      `Příliš mnoho vyhodnocení. Zkuste to prosím znovu za ${limited.retryAfter} s.`
    );
  }
  if (!acquireSlot()) {
    return tooManyRequests(5, "Server je momentálně vytížený. Zkuste to prosím za chvíli.");
  }

  const evaluated: string[] = [];
  let quotaExhausted = false;
  let failure: string | null = null;
  let providerError: string | null = null;

  // BYOM: run the whole batch on the caller's "campaign-eval" provider (matrix
  // override or global active); BYOM-served calls skip the per-user quota.
  const byomPlan = await getUserPlan(userId);
  const byom = await enterByomForOperation(userId, byomPlan, "campaign-eval");

  try {
    const locale = await getServerLocale();

    for (let i = 0; i < pending.length; i++) {
      const target = pending[i]!;

      // Per-user daily quota per actual (non-cached, non-BYOM) model call.
      // Exhaustion ends the batch gracefully with a report of what remains,
      // instead of a hard 429 that throws away partial work.
      if (!byom) {
        const quota = await consume(userId, "aiEval");
        if (!quota.ok) {
          quotaExhausted = true;
          break;
        }
      }

      // Ground the portfolio eval in the account's own winning patterns (RAG) —
      // the same query the single analyze route builds.
      let patternLines: string[] | undefined;
      if (target.scope === "overall") {
        const totals = aggregate(campaigns);
        const rows = campaigns.map(withMetrics);
        const best = [...rows].sort((a, b) => b.roas - a.roas)[0];
        const worst = [...rows].filter((c) => c.cost > 0).sort((a, b) => a.roas - b.roas)[0];
        const query = [
          `Portfolio ROAS ${totals.roas.toFixed(1)}, PNO ${(totals.pno * 100).toFixed(0)} %.`,
          best ? `Nejlepší kampaň ${best.name} (${best.type}).` : "",
          worst ? `Nejslabší kampaň ${worst.name} (${worst.type}).` : "",
        ]
          .filter(Boolean)
          .join(" ");
        patternLines = await getPatternLines(tenant, query);
      }

      try {
        const response = await generateCampaignEvaluation({
          scope: target.scope,
          target: target.campaign,
          campaigns,
          period: meta.period,
          patternLines,
          changes: changes ?? undefined,
          locale,
          // A closed tab stops the remaining provider work mid-batch.
          signal: request.signal,
        });
        await saveReport(tenant, {
          scope: target.scope,
          campaignId: target.scope === "campaign" ? target.key : null,
          period: meta.period,
          response,
          inputHash: target.inputHash,
        });
        evaluated.push(target.key);
      } catch (err) {
        // Stop at the first failure — the same "don't hammer a failing
        // provider" rule the client-side flagged queue follows. A BYOM user fault
        // (their key/account/model) is surfaced verbatim below.
        if (err instanceof ByomUserError) providerError = err.message;
        else console.error(`[campaigns] batch evaluation failed at ${target.key}:`, err);
        failure = target.key;
        break;
      }
    }
  } finally {
    releaseSlot();
  }

  const doneKeys = new Set([...evaluated, ...cached]);
  const remaining = pending.map((p) => p.key).filter((k) => !doneKeys.has(k));

  return Response.json({
    evaluated,
    cached,
    remaining,
    quotaExhausted,
    ...(providerError
      ? { error: providerError, code: "provider" }
      : failure
        ? { error: `Vyhodnocení „${failure}“ se nezdařilo — dávka byla zastavena.` }
        : {}),
  });
}
