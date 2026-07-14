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
export interface SocialPublishResult {
  /** the platform's id for the created post */
  externalId: string;
  /** a public permalink to the post */
  url: string;
}

/** The single network seam every adapter shares — POST a JSON body to a provider URL
 *  with a bearer token, resolve the decoded JSON. INJECTABLE so a fixture swaps in with
 *  no network; the real implementation is {@link httpSocialTransport}. Implementations
 *  MUST throw on a non-2xx / transport failure so the caller degrades honestly. */
export interface SocialTransport {
  post(url: string, init: { token: string; body: unknown }): Promise<Record<string, unknown>>;
}

/** The real HTTP transport: bearer-authed JSON POST, surfacing a non-2xx as a throw so
 *  publish.ts records a failed (not fake-published) post. */
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
  };
}

/** A publishing provider for one or more platforms. */
export interface SocialProvider {
  readonly id: string;
  readonly platforms: readonly SocialPlatform[];
  /** whether this provider's app credentials are configured (env-gated). */
  configured(): boolean;
  /** publish `content`, mapping the provider's wire response to {@link SocialPublishResult}. */
  publish(input: SocialPublishInput, transport: SocialTransport): Promise<SocialPublishResult>;
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
};

const PROVIDERS: SocialProvider[] = [metaProvider, linkedinProvider];

/** The provider that owns a platform, or null when none is implemented (TikTok has no
 *  publishing adapter this cycle — its posts always simulate). */
export function socialProvider(platform: SocialPlatform): SocialProvider | null {
  return PROVIDERS.find((p) => p.platforms.includes(platform)) ?? null;
}
