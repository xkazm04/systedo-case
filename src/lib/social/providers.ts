/** Social publishing provider registry: the Meta (Facebook / Instagram) and LinkedIn
 *  adapters that turn a caption + an OAuth token into a real published post. Each
 *  adapter is pure over an INJECTABLE {@link SocialTransport}, so the whole wire
 *  mapping is exercised by a fixture with NO network (the Sklik-adapter posture) — the
 *  only part that touches the internet is httpSocialTransport. Env-gated: an adapter
 *  reports `configured()` true only when its app credentials are present, so a repo
 *  with no credentials degrades cleanly to simulated publishing (see publish.ts).
 *  Server-only. */
import "server-only";
import type { SocialPlatform } from "./types";

/** What an adapter needs to publish, and what it returns after mapping the wire response. */
export interface SocialPublishInput {
  /** the connected account's (decrypted) OAuth access token */
  token: string;
  content: string;
}
/** What an adapter needs to REPLY to an inbound comment/DM — the same token/content
 *  plus the provider-side id of the message being answered. A reply is a distinct
 *  operation from a post: it must be delivered to `messageId`, never published as a
 *  standalone post. No adapter implements it yet (see {@link SocialProvider.reply}). */
export interface SocialReplyInput {
  token: string;
  /** the provider-side id of the inbound message being answered */
  messageId: string;
  content: string;
}
export interface SocialPublishResult {
  /** the platform's id for the created post */
  externalId: string;
  /** a public permalink to the post */
  url: string;
}

/** The single network seam every adapter shares — POST a JSON body to a provider URL
 *  with a bearer token, or GET one, resolving the decoded JSON. INJECTABLE so a fixture
 *  swaps in with no network; the real implementation is {@link httpSocialTransport}.
 *  Implementations MUST throw on a non-2xx / transport failure so the caller degrades
 *  honestly.
 *
 *  `get` is OPTIONAL because it arrived after `post` (WP W3-D's read-back) and a
 *  publish-only fixture must keep compiling. An adapter that needs it says so with a
 *  throw rather than silently returning zeros — a read that did not happen must never
 *  become a metric row (see readback-step.ts's failed ≠ zero rule). */
export interface SocialTransport {
  post(url: string, init: { token: string; body: unknown }): Promise<Record<string, unknown>>;
  get?(url: string, init: { token: string }): Promise<Record<string, unknown>>;
}

/** The real HTTP transport: bearer-authed JSON, surfacing a non-2xx as a throw so
 *  publish.ts records a failed (not fake-published) post and the read-back step counts a
 *  failure instead of writing a zero row. */
export function httpSocialTransport(): SocialTransport {
  return {
    async post(url, init) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${init.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(init.body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(`social publish HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
      }
      return json;
    },
    async get(url, init) {
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${init.token}` },
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(`social insights HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
      }
      return json;
    },
  };
}

/** What a read-back learns about ONE published post. Three integers and nothing else:
 *  no demographics, no viewer list, no per-person events — the `go_clicks` privacy
 *  posture applied to the platforms' own reporting. */
export interface PostInsights {
  reach: number;
  likes: number;
  comments: number;
}

/** What an adapter needs to read a post's counters back. */
export interface SocialInsightsContext {
  token: string;
  transport: SocialTransport;
}

/** Coerce a provider's number-ish value (Graph sends integers, LinkedIn sometimes
 *  strings) into a non-negative integer. A value that is not a number at all becomes 0 —
 *  which is only ever written as part of a row the read SUCCEEDED for; a failed read
 *  throws before any row exists. */
function count(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function need(transport: SocialTransport): NonNullable<SocialTransport["get"]> {
  if (!transport.get) throw new Error("social transport has no GET — insights cannot be read");
  return transport.get.bind(transport);
}

/** A publishing provider for one or more platforms. */
export interface SocialProvider {
  readonly id: string;
  readonly platforms: readonly SocialPlatform[];
  /** whether this provider's app credentials are configured (env-gated). */
  configured(): boolean;
  /** publish `content`, mapping the provider's wire response to {@link SocialPublishResult}. */
  publish(input: SocialPublishInput, transport: SocialTransport): Promise<SocialPublishResult>;
  /** Reply to an inbound comment/DM, delivered to `input.messageId`. OPTIONAL and
   *  absent on every adapter this cycle: the exact reply endpoint (a Graph comment
   *  reply vs a private-message send; a LinkedIn conversation event) is another
   *  offline-unverifiable seam. Until an adapter owns it, publish.ts simulates the
   *  reply rather than reusing publish() — which would leak a private reply as a
   *  public post. */
  reply?(input: SocialReplyInput, transport: SocialTransport): Promise<SocialPublishResult>;
  /** Read one published post's counters back (WP W3-D). OPTIONAL: TikTok has no adapter
   *  at all, and a future provider may publish without reporting. Implementations MUST
   *  THROW when the read fails — the read-back step turns a throw into a counted failure
   *  and writes NO row, because a failed read is not a zero. */
  insights?(post: { externalId: string }, ctx: SocialInsightsContext): Promise<PostInsights>;
}

// ── Meta (Facebook / Instagram) ───────────────────────────────────────────────
//
// OFFLINE-UNVERIFIABLE SEAM (the moneyToCzk / SKLIK_KEYWORDS_METHOD precedent): the
// exact Graph publish endpoint and the id / permalink fields it returns differ by
// surface (a Page feed post vs an Instagram media container, which is really a 2-step
// create-then-publish flow) and by API version, and cannot be verified without a live
// reviewed app. They are ISOLATED here as the ONE place to adjust once verified against
// a real account. Until credentials exist, configured() is false and this code never
// runs against the network — the app publishes in honest simulation instead.
export const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";

/** The Graph endpoint a platform's simple text post is sent to. Instagram's real flow is
 *  a 2-step media container (create → publish); this single-call form is the documented-
 *  plausible simplification to revisit alongside the mapping below. */
export function metaPublishEndpoint(platform: SocialPlatform): string {
  return platform === "instagram" ? `${META_GRAPH_BASE}/me/media` : `${META_GRAPH_BASE}/me/feed`;
}

/** Map Meta's wire response → the neutral result. Graph returns `{ id }` (and, for a
 *  Page post, often `permalink_url`); we synthesise a permalink from the id when absent. */
function mapMetaResponse(json: Record<string, unknown>): SocialPublishResult {
  const externalId = typeof json.id === "string" ? json.id : "";
  const permalink = typeof json.permalink_url === "string" ? json.permalink_url : "";
  return { externalId, url: permalink || `https://www.facebook.com/${externalId}` };
}

// OFFLINE-UNVERIFIABLE SEAM (the moneyToCzk / SKLIK_KEYWORDS_METHOD precedent): the
// insights READ has the same problem as the publish above and then some — the metric
// NAMES differ per surface (`post_impressions_unique` on a Page post,
// `impressions`/`reach` on an Instagram media object), the envelope is a
// `data: [{ name, values: [{ value }] }]` list rather than a flat object, and the like /
// comment totals arrive as `summary.total_count` on separate edges. The endpoint, the
// metric list and the field names are ISOLATED here as the ONE place to adjust once
// verified against a real reviewed app. Until credentials exist, configured() is false
// and none of this runs against the network.
export const META_INSIGHTS_METRICS = "post_impressions_unique,post_reactions_by_type_total";

/** The Graph endpoint one post's counters are read from. `fields` pulls the like and
 *  comment summaries in the SAME request as the insights edge, so a read-back is one
 *  round trip per post rather than three. */
export function metaInsightsEndpoint(externalId: string): string {
  return (
    `${META_GRAPH_BASE}/${encodeURIComponent(externalId)}` +
    `?fields=insights.metric(${META_INSIGHTS_METRICS}),likes.summary(true),comments.summary(true)`
  );
}

/** Pull one metric out of Graph's `insights: { data: [{ name, values: [{ value }] }] }`
 *  envelope. Absent → 0; the caller only ever stores this for a read that SUCCEEDED. */
function metaMetric(json: Record<string, unknown>, name: string): number {
  const data = (json.insights as { data?: unknown } | undefined)?.data;
  if (!Array.isArray(data)) return 0;
  for (const entryRaw of data) {
    const entry = entryRaw as { name?: unknown; values?: unknown };
    if (entry?.name !== name) continue;
    const values = Array.isArray(entry.values) ? entry.values : [];
    const last = values[values.length - 1] as { value?: unknown } | undefined;
    return count(last?.value);
  }
  return 0;
}

/** `likes`/`comments` edges requested with `summary(true)` answer as
 *  `{ data: [...], summary: { total_count } }`. */
function metaSummary(json: Record<string, unknown>, edge: string): number {
  const node = json[edge] as { summary?: { total_count?: unknown } } | undefined;
  return count(node?.summary?.total_count);
}

export const metaProvider: SocialProvider = {
  id: "meta",
  platforms: ["facebook", "instagram"],
  configured: () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
  async publish(input, transport) {
    const json = await transport.post(metaPublishEndpoint("facebook"), {
      token: input.token,
      body: { message: input.content },
    });
    return mapMetaResponse(json);
  },
  async insights(post, ctx) {
    const json = await need(ctx.transport)(metaInsightsEndpoint(post.externalId), { token: ctx.token });
    return {
      reach: metaMetric(json, "post_impressions_unique"),
      likes: metaSummary(json, "likes") || metaMetric(json, "post_reactions_by_type_total"),
      comments: metaSummary(json, "comments"),
    };
  },
};

// ── LinkedIn ──────────────────────────────────────────────────────────────────
//
// OFFLINE-UNVERIFIABLE SEAM (same precedent): the LinkedIn posts endpoint, the required
// `author` URN + version header, and the created-post id field are version-specific and
// unverifiable offline. Isolated here; gated OFF until credentials exist.
export const LINKEDIN_API_BASE = "https://api.linkedin.com/rest";
export const LINKEDIN_POSTS_ENDPOINT = `${LINKEDIN_API_BASE}/posts`;

/** Map LinkedIn's wire response → the neutral result. The create returns the new post's
 *  URN (as `id`); the public permalink is derived from it. */
function mapLinkedInResponse(json: Record<string, unknown>): SocialPublishResult {
  const externalId = typeof json.id === "string" ? json.id : "";
  return { externalId, url: `https://www.linkedin.com/feed/update/${externalId}` };
}

// OFFLINE-UNVERIFIABLE SEAM (same precedent): LinkedIn splits a post's numbers across
// two surfaces — `socialActions/{urn}` carries the like and comment totals, while
// impressions live behind the organization share-statistics API with its own permission
// scope and its own URN shape. Both the path and the field names are version-specific
// and unverifiable offline. Isolated here; gated OFF until credentials exist.
export function linkedinInsightsEndpoint(externalId: string): string {
  return `${LINKEDIN_API_BASE}/socialActions/${encodeURIComponent(externalId)}`;
}

export const linkedinProvider: SocialProvider = {
  id: "linkedin",
  platforms: ["linkedin"],
  configured: () => Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
  async publish(input, transport) {
    const json = await transport.post(LINKEDIN_POSTS_ENDPOINT, {
      token: input.token,
      body: { commentary: input.content, visibility: "PUBLIC" },
    });
    return mapLinkedInResponse(json);
  },
  async insights(post, ctx) {
    const json = await need(ctx.transport)(linkedinInsightsEndpoint(post.externalId), { token: ctx.token });
    const likes = (json.likesSummary as { totalLikes?: unknown } | undefined)?.totalLikes;
    const comments = (json.commentsSummary as { totalFirstLevelComments?: unknown } | undefined)
      ?.totalFirstLevelComments;
    // HONEST GAP: socialActions reports no impressions, and the share-statistics API
    // that does needs an organization URN this seam does not hold. Reach therefore
    // reads 0 for LinkedIn rather than being invented from the like count — the
    // grounding ranks by reach, so a fabricated one would reorder real advice.
    return { reach: 0, likes: count(likes), comments: count(comments) };
  },
};

const PROVIDERS: SocialProvider[] = [metaProvider, linkedinProvider];

/** The provider that owns a platform, or null when none is implemented (TikTok has no
 *  publishing adapter this cycle — its posts always simulate). */
export function socialProvider(platform: SocialPlatform): SocialProvider | null {
  return PROVIDERS.find((p) => p.platforms.includes(platform)) ?? null;
}
