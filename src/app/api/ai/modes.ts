/** The /api/ai mode descriptor table — the single place per-tool policy lives.
 *
 *  Every AI tool the app exposes rides one chokepoint (POST /api/ai). Historically
 *  each tool was a hand-wired `switch` arm that re-implemented the same four steps
 *  (validate → ground → pick generator → shape the cache key), so a new tool meant
 *  editing the switch, the resolvers, and inheriting no contract. This module makes
 *  each tool ONE declarative row instead.
 *
 *  ── Adding a 22nd tool ─────────────────────────────────────────────────────────
 *  1. Add its validator to `@/lib/ai/validation` and its generator to
 *     `@/lib/ai/tools` (the lib modules — this file wires, it doesn't implement).
 *  2. Add one row to `createModeTable`:
 *       "my-tool": defineMode<MyRequest>({
 *         validate: deps => validateMyRequest,        // (body, locale) => Valid<T>
 *         guard?:   ctx => Response | null,            // pre-validation gate (auth)
 *         prepare:  async (value, ctx) => ({           // returns { cacheValue, gen }
 *           cacheValue,                                //   → hashAiInput input
 *           gen: () => deps.gen.myTool(value, ...),    //   → the metered generation
 *         }),                                          // …or a Response to short-circuit
 *       }),
 *  3. Wire its generator (and any new resolver) into `realDeps` in route.ts.
 *  That's it — dispatch, quota, cache, refund and error handling are inherited.
 *
 *  ── The pieces ────────────────────────────────────────────────────────────────
 *  • `validate` — the runtime validator; a false result becomes the shared 422.
 *  • `guard`    — an optional pre-validation gate (only onboarding-scan uses it, to
 *                 require sign-in before it will fetch a caller-supplied URL).
 *  • `prepare`  — resolves per-tool grounding (through the injected resolvers) and
 *                 returns { cacheValue, gen }. `cacheValue` is the EXACT value
 *                 hashed into the response-cache key (see cacheKeyPolicy notes on
 *                 each row); `gen` is the metered generation cachedRespond runs on a
 *                 cache miss. `prepare` may instead return a `Response` to fail early
 *                 (onboarding-scan's fetch/short-text paths).
 *
 *  Everything store- or provider-touching is injected via `ModeDeps`, so the table
 *  and each mode's cache-key / generator wiring is unit-testable without Firestore
 *  (test-unit/ai-mode-table.test.mjs pins those shapes). The four tenancy-triad
 *  copies that used to live inline collapse into the ONE `resolveProjectAccess`
 *  helper the grounding resolvers below call.
 */
import type { SupportedLocale } from "@/lib/format";
import type {
  AiResponse,
  AdRequest,
  AnalysisRequest,
  AnalysisPeriod,
  ArticleDraftRequest,
  BriefRequest,
  ChannelResearchRequest,
  ChatRequest,
  CohortDiagnosisRequest,
  ComparisonOutlineRequest,
  KeywordClustersRequest,
  LeadSourceDiagnosisRequest,
  LocalDiagnosisRequest,
  LocalReviewReplyRequest,
  LpVariantIdeasRequest,
  MonthlyRecapRequest,
  MonthlyRecapResult,
  OnboardingScanRequest,
  RepurposeRequest,
  TwinReplyRequest,
  TwinReplyVoice,
  TwinStyleRequest,
} from "@/lib/ai-types";
import type { PerformanceData } from "@/lib/types";
import type { ProjectType } from "@/lib/projects/types";
import type { StoredRecap, RecapInput } from "@/lib/recaps";
import {
  validateAdRequest,
  validateAnalysisRequest,
  validateChannelResearchRequest,
  validateOnboardingScanRequest,
  validateMonthlyRecapRequest,
  validateChatRequest,
  validateArticleDraftRequest,
  validateBriefRequest,
  validateCohortDiagnosisIntent,
  validateComparisonOutlineRequest,
  validateKeywordClustersRequest,
  validateTwinReplyRequest,
  validateTwinStyleRequest,
  validateLeadSourceDiagnosisIntent,
  validateLocalDiagnosisIntent,
  validateLocalReviewReplyRequest,
  validateLpVariantIdeasRequest,
  validateRepurposeRequest,
  validateSocialRequest,
  type CohortDiagnosisIntent,
  type LeadSourceDiagnosisIntent,
  type LocalDiagnosisIntent,
  type SocialDraftRequest,
} from "@/lib/ai/validation";
import type { SocialSkillInput } from "@/lib/ai/tools/social";
import type { SocialDraftResult } from "@/lib/social/types";
import { inputDigest } from "@/lib/diagnoses/types";
import {
  extractCohortSnapshot,
  extractLeadSourceSnapshot,
  extractLocalSnapshot,
} from "@/lib/diagnoses/outcome";
import type { DiagnosisSnapshot } from "@/lib/ai-types";
import { isDemoProjectId } from "@/lib/projects/demo";
import type { GroundingResult, ResolvedDiagnosis } from "./grounding";
import { isTwinChannel, type DraftGateVerdict, type ToneScope, type TwinChannel } from "@/lib/twin/types";

// ─── shared contracts ──────────────────────────────────────────────────────────

/** A validator's discriminated result (mirrors the private `Valid<T>` in
 *  @/lib/ai/validation; not exported there, kept structurally identical here). */
export type Valid<T> = { valid: true; value: T } | { valid: false; error: string };

/** Per-request context threaded to every guard/prepare — everything the switch used
 *  to read from the POST closure (body, locale, the resolved caller identity, the
 *  payload-level projectId, and the client's abort signal). */
export interface DispatchCtx {
  body: unknown;
  locale: SupportedLocale;
  userId: string | null;
  /** The payload-level `projectId` (best-effort telemetry id), used by the ad-pattern
   *  and analysis grounding — distinct from a request body's own `value.projectId`. */
  projectIdStr: string | undefined;
  signal: AbortSignal;
}

/** What `prepare` hands back: the exact value hashed into the cache key, and the
 *  metered generation to run on a cache miss. */
export interface Prepared {
  cacheValue: unknown;
  gen: () => Promise<AiResponse<unknown>>;
}

export interface ModeDescriptor<T> {
  validate: (body: unknown, locale: SupportedLocale) => Valid<T>;
  guard?: (ctx: DispatchCtx) => Response | null;
  prepare: (value: T, ctx: DispatchCtx) => Promise<Prepared | Response> | Prepared | Response;
}

/** A descriptor with its request type erased, so heterogeneous rows share one
 *  record. `prepare` accepts `unknown` because dispatch only ever hands it the value
 *  THIS descriptor's own `validate` produced — the one cast (in `defineMode`) is
 *  sound by that invariant. */
export interface ErasedMode {
  validate: (body: unknown, locale: SupportedLocale) => Valid<unknown>;
  guard?: (ctx: DispatchCtx) => Response | null;
  prepare: (value: unknown, ctx: DispatchCtx) => Promise<Prepared | Response> | Prepared | Response;
}

/** Author a row with full per-tool inference; erase its request type for the table. */
function defineMode<T>(d: ModeDescriptor<T>): ErasedMode {
  return {
    validate: d.validate,
    guard: d.guard,
    prepare: (value, ctx) => d.prepare(value as T, ctx),
  };
}

// ─── injected dependencies (the table's store-/provider-touching seams) ──────────

/** A tool generator: the pure (mode, input) → response chokepoint. The grounded
 *  ones take extra resolved-grounding arguments (data / text / framing). */
type Gen<T, X extends unknown[] = [], R = unknown> = (
  value: T,
  locale: SupportedLocale,
  signal: AbortSignal,
  ...extra: X
) => Promise<AiResponse<R>>;

/** Everything the table needs that touches a store, a provider, or the network —
 *  injected so the table (and each mode's cache-key/generator wiring) is testable
 *  without Firestore. route.ts builds `realDeps` from the real imports. */
export interface ModeDeps {
  gen: {
    ads: Gen<AdRequest>;
    brief: Gen<BriefRequest>;
    analysis: Gen<AnalysisRequest, [PerformanceData | undefined]>;
    monthlyRecap: Gen<
      MonthlyRecapRequest,
      [PerformanceData | undefined, string | undefined, string | undefined, ProjectType | undefined],
      MonthlyRecapResult
    >;
    chat: Gen<ChatRequest, [PerformanceData | undefined]>;
    twinReply: Gen<TwinReplyRequest>;
    twinStyle: Gen<TwinStyleRequest>;
    repurpose: Gen<RepurposeRequest>;
    localReviewReply: Gen<LocalReviewReplyRequest>;
    articleDraft: Gen<ArticleDraftRequest>;
    cohortDiagnosis: Gen<CohortDiagnosisRequest>;
    keywordClusters: Gen<KeywordClustersRequest>;
    comparisonOutline: Gen<ComparisonOutlineRequest>;
    lpVariantIdeas: Gen<LpVariantIdeasRequest, [string | undefined]>;
    leadSourceDiagnosis: Gen<LeadSourceDiagnosisRequest>;
    localDiagnosis: Gen<LocalDiagnosisRequest>;
    channelResearch: Gen<ChannelResearchRequest>;
    onboardingScan: Gen<OnboardingScanRequest>;
    // Direction 1: social rides the mode table. Its grounding (perf/brand/competitor)
    // and twin voice are resolved into the SocialSkillInput before generation.
    social: Gen<SocialSkillInput, [], SocialDraftResult>;
  };
  resolveGrounding: (
    projectId: string | undefined,
    userId: string | null,
    locale: SupportedLocale,
    period?: AnalysisPeriod
  ) => Promise<GroundingResult>;
  resolveAdPatterns: (
    projectId: string | undefined,
    userId: string | null,
    req: { product: string; benefits: string; audience: string }
  ) => Promise<string[]>;
  resolveBrandContext: (
    projectId: string | undefined,
    userId: string | null,
    locale: SupportedLocale
  ) => Promise<string>;
  resolveTwinVoice: (
    projectId: string | undefined,
    userId: string | null,
    scope: ToneScope
  ) => Promise<TwinReplyVoice | undefined>;
  /** "Review means review": the twin-reply drafting gate — resolves the project's
   *  channel config server-side so a disabled/`review` channel refuses drafting.
   *  OPTIONAL and used by the twin-reply row alone: when absent, the row
   *  lazy-imports the real resolver (`@/lib/twin/load`), keeping the statically
   *  imported table store-free for its unit tests, which inject a fake here to pin
   *  both the allow and the deny path. */
  resolveTwinDraftGate?: (
    projectId: string | undefined,
    userId: string | null,
    channel: TwinChannel
  ) => Promise<DraftGateVerdict>;
  /** Direction 1: the social tool's server-side grounding — the "what's working" +
   *  competitor text, and the effective brand voice (override → auto-brand → none). */
  resolveSocialContext: (
    projectId: string | undefined,
    userId: string | null,
    locale: SupportedLocale,
    brandOverride?: string
  ) => Promise<{ grounding: string; brand: string | undefined }>;
  resolveLeadGrounding: (
    projectId: string | undefined,
    userId: string | null
  ) => Promise<{ text?: string; keyId: string }>;
  // Direction 1: the three diagnosis modes re-derive their request server-side from
  // the project (never the client body). `null` → no project resolves for the caller.
  resolveCohortDiagnosis: (
    projectId: string | undefined,
    userId: string | null
  ) => Promise<ResolvedDiagnosis<CohortDiagnosisRequest> | null>;
  resolveLeadSourceDiagnosis: (
    projectId: string | undefined,
    userId: string | null,
    source: string
  ) => Promise<ResolvedDiagnosis<LeadSourceDiagnosisRequest> | null>;
  resolveLocalDiagnosis: (
    projectId: string | undefined,
    userId: string | null
  ) => Promise<ResolvedDiagnosis<LocalDiagnosisRequest> | null>;
  fetchSiteText: (url: string) => Promise<{ title: string; description: string; text: string }>;
  onFetchError: (err: unknown) => Response;
  recap: {
    record: (projectId: string, recap: StoredRecap) => Promise<unknown>;
    build: (input: RecapInput, idOf: () => string) => StoredRecap;
    inputHash: (
      locale: SupportedLocale,
      period: AnalysisPeriod,
      projectType: ProjectType | undefined,
      data: PerformanceData | undefined
    ) => string;
    uuid: () => string;
  };
}

// ─── shared response builders (byte-identical to the old inline ones) ────────────

/** The old `bad(error)` closure: a 422 with the "invalid" machine code. */
function bad(error: string): Response {
  return Response.json({ error, code: "invalid" }, { status: 422 });
}

/** Direction 1: wrap a diagnosis generator so its response carries the honest
 *  sample-provenance flag AND the stable digest of the SERVER-rebuilt request. The
 *  flag lets the panel label a sample-grounded run truthfully; the digest lets the
 *  panel persist (and later stale-compare) the digest of what was actually diagnosed
 *  — not a client-supplied one. Additive to `meta`, so no tool fingerprint moves. */
function withDiagnosisMeta(
  gen: () => Promise<AiResponse<unknown>>,
  sample: boolean,
  digest: string,
  // Direction 1 (the loop closes): the at-diagnosis key-metric snapshot, so the panel
  // persists the value the diagnosed problem started at and can later show the outcome.
  snapshot: DiagnosisSnapshot | null
): () => Promise<AiResponse<unknown>> {
  return async () => {
    const res = await gen();
    return {
      ...res,
      meta: {
        ...res.meta,
        sampleGrounded: sample,
        inputDigest: digest,
        ...(snapshot ? { snapshot } : {}),
      },
    };
  };
}

/** The shared shape of a diagnosis mode's prepare(): validate → server-rebuild →
 *  compute digest (before refine) → attach refine → cache by effective grounding. */
function prepareDiagnosis<T extends { refine?: string }>(
  resolved: ResolvedDiagnosis<T>,
  refine: string | undefined,
  gen: (request: T) => Promise<AiResponse<unknown>>,
  // Direction 1: extract the at-diagnosis key-metric snapshot from the SERVER-rebuilt
  // request (never the wire) — computed on the pure data, before refine is folded in.
  extractSnapshot: (request: T) => DiagnosisSnapshot | null
): Prepared {
  const request = resolved.request;
  // The digest is of the DATA the diagnosis rests on — computed before the transient
  // refine note is folded in, so a re-run steer never reads as a data change.
  const digest = inputDigest(request);
  const snapshot = extractSnapshot(request);
  // Direction 2 (sample hedges the prompt): SERVER-inject the honest provenance flag
  // into the request so the user prompt can hedge on illustrative economics. Injected
  // AFTER the digest (like refine) so it never shifts the stale-badge comparison; the
  // local request already carries its own per-signal live flags, so this is a no-op for
  // its prompt (which ignores `sample`). Never read from the wire.
  (request as { sample?: boolean }).sample = resolved.sample;
  if (refine) request.refine = refine;
  return {
    // Cache keyed by the effective project (keyId) + the rebuilt request, so an
    // unowned id can never serve another tenant's cached diagnosis.
    cacheValue: { request, keyId: resolved.keyId },
    gen: withDiagnosisMeta(() => gen(request), resolved.sample, digest, snapshot),
  };
}

/** The 422 a diagnosis mode returns when no project resolves for the caller (an
 *  unowned / unknown id) — there is genuinely nothing to diagnose. */
function noDiagnosisData(ctx: DispatchCtx): Response {
  return bad(
    ctx.locale === "en"
      ? "No data to diagnose for this project."
      : "Pro tento projekt nejsou data k diagnostice."
  );
}

// ─── the table ──────────────────────────────────────────────────────────────────

export function createModeTable(deps: ModeDeps): Record<string, ErasedMode> {
  const table: Record<string, ErasedMode> = {
    // ── plain tools: cacheValue == validated value; one generator, no grounding ──
    "local-review-reply": defineMode<LocalReviewReplyRequest>({
      validate: validateLocalReviewReplyRequest,
      prepare: (value, ctx) => ({
        cacheValue: value,
        gen: () => deps.gen.localReviewReply(value, ctx.locale, ctx.signal),
      }),
    }),
    // ── diagnosis tools: the request is RE-DERIVED server-side from the project
    //    (Direction 1), never the client body — so a tampered payload cannot alter a
    //    diagnosed number. The wire body is a tamper-proof intent (projectId [+ the
    //    picked source]); numbers, provenance and digest are all server-authoritative. ──
    "cohort-diagnosis": defineMode<CohortDiagnosisIntent>({
      validate: validateCohortDiagnosisIntent,
      prepare: async (intent, ctx) => {
        const resolved = await deps.resolveCohortDiagnosis(intent.projectId, ctx.userId);
        if (!resolved) return noDiagnosisData(ctx);
        return prepareDiagnosis(
          resolved,
          intent.refine,
          (req) => deps.gen.cohortDiagnosis(req, ctx.locale, ctx.signal),
          extractCohortSnapshot
        );
      },
    }),
    "keyword-clusters": defineMode<KeywordClustersRequest>({
      validate: validateKeywordClustersRequest,
      prepare: (value, ctx) => ({
        cacheValue: value,
        gen: () => deps.gen.keywordClusters(value, ctx.locale, ctx.signal),
      }),
    }),
    "comparison-outline": defineMode<ComparisonOutlineRequest>({
      validate: validateComparisonOutlineRequest,
      prepare: (value, ctx) => ({
        cacheValue: value,
        gen: () => deps.gen.comparisonOutline(value, ctx.locale, ctx.signal),
      }),
    }),
    "lead-source-diagnosis": defineMode<LeadSourceDiagnosisIntent>({
      validate: validateLeadSourceDiagnosisIntent,
      prepare: async (intent, ctx) => {
        const resolved = await deps.resolveLeadSourceDiagnosis(intent.projectId, ctx.userId, intent.source);
        if (!resolved) return noDiagnosisData(ctx);
        return prepareDiagnosis(
          resolved,
          intent.refine,
          (req) => deps.gen.leadSourceDiagnosis(req, ctx.locale, ctx.signal),
          extractLeadSourceSnapshot
        );
      },
    }),
    "local-diagnosis": defineMode<LocalDiagnosisIntent>({
      validate: validateLocalDiagnosisIntent,
      prepare: async (intent, ctx) => {
        const resolved = await deps.resolveLocalDiagnosis(intent.projectId, ctx.userId);
        if (!resolved) return noDiagnosisData(ctx);
        return prepareDiagnosis(
          resolved,
          intent.refine,
          (req) => deps.gen.localDiagnosis(req, ctx.locale, ctx.signal),
          extractLocalSnapshot
        );
      },
    }),
    "channel-research": defineMode<ChannelResearchRequest>({
      validate: validateChannelResearchRequest,
      prepare: (value, ctx) => ({
        cacheValue: value,
        gen: () => deps.gen.channelResearch(value, ctx.locale, ctx.signal),
      }),
    }),

    // ── ads: RAG pattern grounding AND brand grounding injected into the value ONLY
    //    when non-empty, so the demo / no-library / no-catalogue path keeps its exact
    //    request shape → cache key. Brand mirrors the brief row (resolveBrandContext →
    //    value.brand, USER-prompt only so the golden holds) but follows THIS row's
    //    conditional-injection idiom (like patterns) rather than always setting "",
    //    which is the ads analogue of brief's byte-identical guarantee. Both resolve
    //    off `projectIdStr` — the payload-level project id the ads tool already uses. ──
    ads: defineMode<AdRequest>({
      validate: validateAdRequest,
      prepare: async (value, ctx) => {
        const [patterns, brand] = await Promise.all([
          deps.resolveAdPatterns(ctx.projectIdStr, ctx.userId, value),
          deps.resolveBrandContext(ctx.projectIdStr, ctx.userId, ctx.locale),
        ]);
        if (patterns.length > 0) value.patterns = patterns;
        if (brand) value.brand = brand;
        return { cacheValue: value, gen: () => deps.gen.ads(value, ctx.locale, ctx.signal) };
      },
    }),

    // ── brand-grounded content tools: brand enters value (→ cache key + prompt);
    //    "" for public/demo-less calls so the shape stays byte-identical. ──
    brief: defineMode<BriefRequest>({
      validate: validateBriefRequest,
      prepare: async (value, ctx) => {
        value.brand = await deps.resolveBrandContext(value.projectId, ctx.userId, ctx.locale);
        return { cacheValue: value, gen: () => deps.gen.brief(value, ctx.locale, ctx.signal) };
      },
    }),
    "article-draft": defineMode<ArticleDraftRequest>({
      validate: validateArticleDraftRequest,
      prepare: async (value, ctx) => {
        value.brand = await deps.resolveBrandContext(value.projectId, ctx.userId, ctx.locale);
        return { cacheValue: value, gen: () => deps.gen.articleDraft(value, ctx.locale, ctx.signal) };
      },
    }),

    // ── twin tools: brand grounding UPGRADES the client-sent name (falls back to
    //    it); USER-prompt only, so the golden holds. cacheValue == mutated value. ──
    "twin-reply": defineMode<TwinReplyRequest>({
      validate: validateTwinReplyRequest,
      prepare: async (value, ctx) => {
        // Drafting gate ("review means review"): sprava-kanalu's promise that a
        // disabled or human-only channel gets NO twin drafts is enforced here, the
        // same server tier as the auto-approval gate (twin POST) and the send gate
        // (send route) — not just a disabled button. The channel is the same
        // TwinChannel vocabulary the outbox/leads inbox submit and sprava-kanalu
        // configures; the validator already guarantees it, the guard re-checks so a
        // prepare called directly (tests) skips cleanly on a non-twin value.
        if (isTwinChannel(value.channel)) {
          const gate = deps.resolveTwinDraftGate ?? (await import("@/lib/twin/load")).resolveTwinDraftGate;
          const verdict = await gate(value.projectId, ctx.userId, value.channel);
          if (!verdict.allowed) {
            // Honest, localized refusal — the 422 "invalid" envelope every mode's
            // semantic refusal uses (see noDiagnosisData), so clients need no new code.
            const msg =
              verdict.reason === "review"
                ? ctx.locale === "en"
                  ? "This channel is set to human-only — the twin does not draft here. Change its autonomy in Channel management."
                  : "Kanál je v režimu „jen člověk“ — twin na něm nenavrhuje odpovědi. Změňte samostatnost ve Správě kanálů."
                : ctx.locale === "en"
                  ? "This channel is switched off — the twin does not write here. Turn it on in Channel management."
                  : "Tento kanál je vypnutý — twin na něm nepíše. Zapněte ho ve Správě kanálů.";
            return bad(msg);
          }
        }
        value.brand = (await deps.resolveBrandContext(value.projectId, ctx.userId, ctx.locale)) || value.brand;
        return { cacheValue: value, gen: () => deps.gen.twinReply(value, ctx.locale, ctx.signal) };
      },
    }),
    "twin-style": defineMode<TwinStyleRequest>({
      validate: validateTwinStyleRequest,
      prepare: async (value, ctx) => {
        value.brand = (await deps.resolveBrandContext(value.projectId, ctx.userId, ctx.locale)) || value.brand;
        return { cacheValue: value, gen: () => deps.gen.twinStyle(value, ctx.locale, ctx.signal) };
      },
    }),

    // ── repurpose: the twin's trained voice enters value; the scope follows the
    //    channel (Newsletter → email, else social). Retraining busts the cache. ──
    repurpose: defineMode<RepurposeRequest>({
      validate: validateRepurposeRequest,
      prepare: async (value, ctx) => {
        const scope: ToneScope = value.channels.includes("Newsletter") ? "email" : "social";
        value.voice = await deps.resolveTwinVoice(value.projectId, ctx.userId, scope);
        return { cacheValue: value, gen: () => deps.gen.repurpose(value, ctx.locale, ctx.signal) };
      },
    }),

    // ── social: server-resolved perf/brand/competitor grounding + the trained twin
    //    voice enter the SocialSkillInput (→ cache key + prompt). The brand grounds the
    //    SYSTEM persona (input-aware skill), so it must be resolved before generation.
    //    cacheValue == the fully-grounded input, so a data/brand change busts the cache. ──
    social: defineMode<SocialDraftRequest>({
      validate: validateSocialRequest,
      prepare: async (value, ctx) => {
        const { grounding, brand } = await deps.resolveSocialContext(
          value.projectId,
          ctx.userId,
          ctx.locale,
          value.brand
        );
        const voice = await deps.resolveTwinVoice(value.projectId, ctx.userId, "social");
        const input: SocialSkillInput = {
          topic: value.topic,
          tone: value.tone,
          platforms: value.platforms,
          ...(grounding ? { grounding } : {}),
          ...(brand ? { brand } : {}),
          ...(voice ? { voice } : {}),
          ...(value.refine ? { refine: value.refine } : {}),
        };
        return { cacheValue: input, gen: () => deps.gen.social(input, ctx.locale, ctx.signal) };
      },
    }),

    // ── dataset-grounded tools: resolveGrounding returns { data, keyId, … }. The
    //    cacheValue rewrites projectId → the EFFECTIVE keyId so an unowned id
    //    degrades to base; the GENERATOR still gets the ORIGINAL value + data. ──
    analysis: defineMode<AnalysisRequest>({
      validate: validateAnalysisRequest,
      prepare: async (value, ctx) => {
        const { data, keyId } = await deps.resolveGrounding(ctx.projectIdStr, ctx.userId, ctx.locale);
        const cacheValue = data ? { ...value, projectId: keyId } : value;
        return { cacheValue, gen: () => deps.gen.analysis(value, ctx.locale, ctx.signal, data) };
      },
    }),
    chat: defineMode<ChatRequest>({
      validate: validateChatRequest,
      prepare: async (value, ctx) => {
        const { data, keyId } = await deps.resolveGrounding(value.projectId, ctx.userId, ctx.locale);
        const cacheValue: ChatRequest = { ...value, projectId: keyId };
        return { cacheValue, gen: () => deps.gen.chat(value, ctx.locale, ctx.signal, data) };
      },
    }),

    // ── monthly-recap: dataset grounding + a persistence hook that writes a stored
    //    recap for a REAL, owned project (never demo/unowned) after a non-demo
    //    generation. Best-effort — a store hiccup must not fail the paid call. ──
    "monthly-recap": defineMode<MonthlyRecapRequest>({
      validate: validateMonthlyRecapRequest,
      prepare: async (value, ctx) => {
        const { data, keyId, businessType, projectType, groundingContext } = await deps.resolveGrounding(
          value.projectId,
          ctx.userId,
          ctx.locale,
          value.period
        );
        const cacheValue: MonthlyRecapRequest = { ...value, projectId: keyId };
        const projectId = value.projectId;
        const isDemo = projectId ? isDemoProjectId(projectId) : false;
        const persistTarget = data && projectId && !isDemo ? projectId : null;
        return {
          cacheValue,
          gen: async () => {
            const res = await deps.gen.monthlyRecap(
              value,
              ctx.locale,
              ctx.signal,
              data,
              businessType,
              groundingContext,
              projectType
            );
            if (persistTarget && !res.meta?.demo) {
              const inputHash = deps.recap.inputHash(ctx.locale, value.period, projectType, data);
              await deps.recap
                .record(
                  persistTarget,
                  deps.recap.build(
                    { period: value.period, result: res.result, inputHash, locale: ctx.locale },
                    deps.recap.uuid
                  )
                )
                .catch(() => {});
            }
            return res;
          },
        };
      },
    }),

    // ── lp-variant-ideas: lead-quality grounding; cacheValue rewrites projectId →
    //    the effective project, the generator gets the original value + text. ──
    "lp-variant-ideas": defineMode<LpVariantIdeasRequest>({
      validate: validateLpVariantIdeasRequest,
      prepare: async (value, ctx) => {
        const { text, keyId } = await deps.resolveLeadGrounding(value.projectId, ctx.userId);
        const cacheValue: LpVariantIdeasRequest = { ...value, projectId: keyId };
        return { cacheValue, gen: () => deps.gen.lpVariantIdeas(value, ctx.locale, ctx.signal, text) };
      },
    }),

    // ── onboarding-scan: sign-in gate (guard, BEFORE validate — an anon caller must
    //    not proxy an outbound fetch), then a server-side SSRF-guarded fetch of the
    //    caller's URL. cacheValue is the RAW client value (url/type/brand), NOT the
    //    fetched text; the generator gets the full request with pageText. ──
    "onboarding-scan": defineMode<OnboardingScanRequest>({
      validate: validateOnboardingScanRequest,
      guard: (ctx) =>
        ctx.userId ? null : Response.json({ error: "Pro sken webu se přihlaste.", code: "auth" }, { status: 401 }),
      prepare: async (value, ctx) => {
        let site: { title: string; description: string; text: string };
        try {
          site = await deps.fetchSiteText(value.url);
        } catch (err) {
          return deps.onFetchError(err);
        }
        if (site.text.length < 40) {
          return bad("Na webu jsem nenašel dost textu ke skenu. Zkuste jinou stránku (např. hlavní).");
        }
        const full: OnboardingScanRequest = {
          ...value,
          pageText: site.text,
          ...(site.title ? { siteTitle: site.title } : {}),
          ...(site.description ? { siteDescription: site.description } : {}),
        };
        return { cacheValue: value, gen: () => deps.gen.onboardingScan(full, ctx.locale, ctx.signal) };
      },
    }),
  };

  return table;
}

// ─── the generic dispatch loop (replaces the 18-arm switch) ─────────────────────

/** Resolve one tool call to a `Prepared` (the cacheValue + metered generation) or a
 *  short-circuit `Response` (unknown mode → 400, guard block, validation 422, or a
 *  prepare() early-out). The metering step is deliberately NOT here: both the /api/ai
 *  dispatch (dispatchMode) and the two delegate routes (social/draft, campaigns/
 *  analyze) share this, then feed the result into the metering core their own way. */
export async function resolvePrepared(
  table: Record<string, ErasedMode>,
  mode: string,
  ctx: DispatchCtx
): Promise<Prepared | Response> {
  const desc = table[mode];
  if (!desc) return Response.json({ error: "Neznámý režim nástroje.", code: "invalid" }, { status: 400 });
  if (desc.guard) {
    const g = desc.guard(ctx);
    if (g) return g;
  }
  const v = desc.validate(ctx.body, ctx.locale);
  if (!v.valid) return bad(v.error);
  return desc.prepare(v.value, ctx);
}

/** Run one tool call through its descriptor: guard → validate → prepare →
 *  cachedRespond. `cachedRespond` stays in route.ts (quota/refund semantics
 *  untouched) and is injected so this loop owns none of the metering. An unknown
 *  mode is the historical 400; a validation failure the historical 422. */
export async function dispatchMode(
  table: Record<string, ErasedMode>,
  mode: string,
  ctx: DispatchCtx,
  cachedRespond: (
    mode: string,
    value: unknown,
    locale: SupportedLocale,
    userId: string | null,
    gen: () => Promise<AiResponse<unknown>>
  ) => Promise<Response>
): Promise<Response> {
  const prepared = await resolvePrepared(table, mode, ctx);
  if (prepared instanceof Response) return prepared;
  return cachedRespond(mode, prepared.cacheValue, ctx.locale, ctx.userId, prepared.gen);
}
