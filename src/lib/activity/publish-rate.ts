/** The AI-content publish rate — "of the assets the model generated, how many
 *  actually left the app?" — computed from RECORDED EVENTS ONLY.
 *
 *  Both halves of the loop were already being written and neither was ever read:
 *  generation lands in `llmTelemetry` (one entry per `generateStructured` call,
 *  keyed by toolId + projectId), and publication lands in the tenant activity feed
 *  (the `{kind, via}` taxonomy in ./publish). The KPI that consumes them was still
 *  declared `measure_kind: "manual"` against PostHog events this codebase has never
 *  emitted. This module is the missing reader.
 *
 *  Pure and framework-free on purpose — no Firestore, no clock of its own — so the
 *  arithmetic is unit-testable and the server reader (./publish-rate-live) stays a
 *  thin fetch. It NEVER synthesizes, estimates or backfills a number: an empty
 *  window returns a "no events yet" status, not a 0 %.
 */
import type { PublishAssetKind } from "./publish";

// ---------------------------------------------------------------------------
// Buckets — the join between "which tool generated it" and "what left the app".
// ---------------------------------------------------------------------------

/** One reportable asset family: the LLM tools that PRODUCE it and the publish
 *  kinds that COUNT as it leaving. Two separate vocabularies had to be joined —
 *  telemetry knows only a toolId, the activity feed knows only a PublishAssetKind
 *  — and this table is the single, explicit place they meet.
 *
 *  `channel_variant` deliberately spans `social_post` + `newsletter`: one
 *  `repurpose` call produces the variant for whichever channel the user asked
 *  for, and the Newsletter channel publishes as `newsletter` (see
 *  distribution/publish.ts). Splitting them would leave every newsletter publish
 *  permanently denominator-less. */
export interface PublishBucket {
  id: string;
  /** `// llm-tool:` ids whose successful call IS one generated asset of this family. */
  tools: readonly string[];
  /** publish kinds that count as an asset of this family leaving the app. */
  kinds: readonly PublishAssetKind[];
}

/** Every asset family the rate is broken out by, in display order.
 *
 *  Tools absent from this table are excluded from the DENOMINATOR on purpose:
 *  `chat`, `refine`, `voice`, `twin-style`, `twin-reply`, `local-review-reply`,
 *  `lp-variant-ideas` and `onboarding-scan` either iterate on an existing asset
 *  (counting them would inflate the denominator with re-rolls of one asset) or
 *  produce something that never leaves the app as a file/clipboard/channel push.
 *  Adding a tool here is a deliberate act, not a default. */
export const PUBLISH_BUCKETS: readonly PublishBucket[] = [
  {
    id: "channel_variant",
    tools: ["repurpose", "social"],
    kinds: ["social_post", "newsletter"],
  },
  { id: "ad_copy", tools: ["ads"], kinds: ["ad_copy"] },
  { id: "article", tools: ["article-draft", "comparison-outline"], kinds: ["article"] },
  { id: "content_brief", tools: ["brief"], kinds: ["content_brief"] },
  { id: "keyword_list", tools: ["keyword-clusters"], kinds: ["keyword_list"] },
  {
    id: "analysis",
    tools: [
      "analysis",
      "campaign-eval",
      "monthly-recap",
      "cohort-diagnosis",
      "lead-source-diagnosis",
      "local-diagnosis",
      "channel-research",
    ],
    kinds: ["analysis"],
  },
] as const;

export type PublishBucketId = (typeof PUBLISH_BUCKETS)[number]["id"];

/** The bucket an LLM tool's output belongs to, or null when the tool produces no
 *  shippable asset (→ excluded from the denominator). */
export function bucketForTool(toolId: string): string | null {
  return PUBLISH_BUCKETS.find((b) => b.tools.includes(toolId))?.id ?? null;
}

/** The bucket a publish event belongs to. Every kind in the taxonomy maps to
 *  exactly one bucket (enforced by test), so a publish is never dropped silently. */
export function bucketForKind(kind: PublishAssetKind): string | null {
  return PUBLISH_BUCKETS.find((b) => b.kinds.includes(kind))?.id ?? null;
}

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

/** One recorded generation — the shape `llmTelemetry` already stores. */
export interface GenerationEvent {
  toolId: string;
  /** ISO timestamp */
  at: string;
}

/** One recorded publish — the shape the activity feed already stores. */
export interface PublishEvent {
  kind: PublishAssetKind;
  /** ISO timestamp */
  at: string;
}

export interface BucketRollup {
  bucket: string;
  /** generations of this family recorded inside the window */
  generated: number;
  /** publish events of this family recorded inside the window */
  publishEvents: number;
  /** generations that a publish event claimed (≤ generated, ≤ publishEvents) */
  published: number;
  /** publish events with no generation left to claim — content that left the app
   *  without a recorded AI generation behind it (a deterministic variant, a
   *  hand-written post, or a re-copy of an already-counted asset). Reported, never
   *  folded into the rate. */
  unmatchedPublishes: number;
  /** published ÷ generated, or null when there is nothing to divide by. */
  rate: number | null;
}

export type PublishRateStatus = "no-generations" | "insufficient" | "ok";

export interface PublishRateRollup {
  windowDays: number;
  /** inclusive lower bound of the window, ISO */
  sinceIso: string;
  generated: number;
  publishEvents: number;
  published: number;
  unmatchedPublishes: number;
  /** published ÷ generated across all buckets — null unless `status === "ok"`, so
   *  a thin window can never render as a confident 0 %. */
  rate: number | null;
  status: PublishRateStatus;
  /** how many generations the window still needs before a rate is shown */
  minGenerations: number;
  buckets: BucketRollup[];
}

/** Below this many recorded generations in the window the rate is withheld: two
 *  generations and one copy is not "50 % publish rate", it is noise. The counts are
 *  still shown, so the state reads "not enough events yet", never a fake number. */
export const MIN_GENERATIONS_FOR_RATE = 5;

export const DEFAULT_PUBLISH_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/** Pair publishes to generations inside one bucket.
 *
 *  Greedy and deterministic: both lists are ordered oldest-first, and each publish
 *  claims the earliest not-yet-claimed generation that happened at or before it.
 *  This is what makes the measure exact rather than a ratio of two independent
 *  counters — copying the same variant four times cannot push the family past
 *  100 %, and a publish that precedes every generation (or exceeds their number)
 *  is reported as unmatched instead of inventing a denominator for itself.
 *
 *  Returns the number of generations claimed. */
function pairPublishes(generatedAt: number[], publishedAt: number[]): number {
  const gens = [...generatedAt].sort((a, b) => a - b);
  const pubs = [...publishedAt].sort((a, b) => a - b);
  let g = 0;
  let claimed = 0;
  for (const p of pubs) {
    // Advance past generations that already have a claim; the earliest unclaimed
    // generation at or before this publish is the one it belongs to.
    if (g < gens.length && gens[g]! <= p) {
      g++;
      claimed++;
    }
  }
  return claimed;
}

/** The publish rate over `windowDays`, computed from recorded events only.
 *
 *  Events outside the window are ignored on both sides, so the numerator can never
 *  be grounded on a publish whose generation fell out of the window (which is
 *  exactly how a naive ratio drifts above 100 %). */
export function publishRateRollup(
  generations: readonly GenerationEvent[],
  publishes: readonly PublishEvent[],
  opts: {
    windowDays?: number;
    now?: Date;
    minGenerations?: number;
  } = {}
): PublishRateRollup {
  const windowDays = opts.windowDays ?? DEFAULT_PUBLISH_WINDOW_DAYS;
  const nowMs = (opts.now ?? new Date()).getTime();
  const minGenerations = opts.minGenerations ?? MIN_GENERATIONS_FOR_RATE;
  const sinceMs = nowMs - windowDays * DAY_MS;
  const sinceIso = new Date(sinceMs).toISOString();

  const inWindow = (at: string): number | null => {
    const ms = Date.parse(at);
    if (Number.isNaN(ms) || ms < sinceMs || ms > nowMs) return null;
    return ms;
  };

  const gensByBucket = new Map<string, number[]>();
  const pubsByBucket = new Map<string, number[]>();
  for (const b of PUBLISH_BUCKETS) {
    gensByBucket.set(b.id, []);
    pubsByBucket.set(b.id, []);
  }

  for (const g of generations) {
    const bucket = bucketForTool(g.toolId);
    if (!bucket) continue;
    const ms = inWindow(g.at);
    if (ms === null) continue;
    gensByBucket.get(bucket)!.push(ms);
  }
  for (const p of publishes) {
    const bucket = bucketForKind(p.kind);
    if (!bucket) continue;
    const ms = inWindow(p.at);
    if (ms === null) continue;
    pubsByBucket.get(bucket)!.push(ms);
  }

  const buckets: BucketRollup[] = PUBLISH_BUCKETS.map((b) => {
    const gens = gensByBucket.get(b.id)!;
    const pubs = pubsByBucket.get(b.id)!;
    const published = pairPublishes(gens, pubs);
    return {
      bucket: b.id,
      generated: gens.length,
      publishEvents: pubs.length,
      published,
      unmatchedPublishes: pubs.length - published,
      rate: gens.length > 0 ? published / gens.length : null,
    };
  });

  const generated = buckets.reduce((s, b) => s + b.generated, 0);
  const published = buckets.reduce((s, b) => s + b.published, 0);
  const publishEvents = buckets.reduce((s, b) => s + b.publishEvents, 0);
  const unmatchedPublishes = buckets.reduce((s, b) => s + b.unmatchedPublishes, 0);

  const status: PublishRateStatus =
    generated === 0 ? "no-generations" : generated < minGenerations ? "insufficient" : "ok";

  return {
    windowDays,
    sinceIso,
    generated,
    publishEvents,
    published,
    unmatchedPublishes,
    rate: status === "ok" ? published / generated : null,
    status,
    minGenerations,
    buckets,
  };
}
