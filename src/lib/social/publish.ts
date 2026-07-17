/** Publish a post / reply to a social platform — through the provider seam
 *  (src/lib/social/providers.ts). The decision is HONEST:
 *
 *    real   → a provider adapter owns the platform AND its app credentials are
 *             configured AND the account is a real (non-demo) connection carrying a
 *             token → publish through the adapter, return the genuine permalink.
 *    simulated → anything else (no credentials, a demo connection, no token, or a
 *             platform with no adapter) → mark the record `simulated: true` and hand
 *             back a labelled demo.social PREVIEW URL. The UI shows "Simulované
 *             publikování", never a fake URL dressed up as a real post.
 *
 *  Both the manual publish route and the cron publisher flow through here, so the
 *  simulated-vs-real decision lives in exactly one place. Server-only. */
import "server-only";
import { socialProvider, httpSocialTransport, type SocialTransport } from "./providers";
import type { SocialAccount, SocialPlatform } from "./types";

export interface PublishResult {
  ok: boolean;
  /** true when the publish was simulated (no real provider configured/connected). */
  simulated: boolean;
  externalUrl?: string;
  error?: string;
}

/** Per-call publishing context: the connected account + its decrypted token, resolved
 *  by the caller (the token never leaves the server). `transport` is injectable so a
 *  fixture exercises the real branch with no network. */
export interface PublishContext {
  account?: SocialAccount | null;
  token?: string | null;
  transport?: SocialTransport;
}

/** Whether the real adapter path is available for this platform + connection. */
function canPublishReal(platform: SocialPlatform, ctx: PublishContext): boolean {
  const provider = socialProvider(platform);
  return Boolean(provider?.configured() && ctx.account && !ctx.account.demo && ctx.token);
}

/** Publish caption content to a platform. Real when a provider is configured + the
 *  account is connected with a token; a labelled simulation otherwise. */
export async function publishPost(
  platform: SocialPlatform,
  content: string,
  id: string,
  ctx: PublishContext = {}
): Promise<PublishResult> {
  const provider = socialProvider(platform);
  if (provider && canPublishReal(platform, ctx)) {
    try {
      const res = await provider.publish(
        { token: ctx.token as string, content },
        ctx.transport ?? httpSocialTransport()
      );
      return { ok: true, simulated: false, externalUrl: res.url };
    } catch (err) {
      // Raw provider error stays server-side; the record fails honestly (not fake-published).
      console.error(`[social] real publish failed (${platform}):`, err instanceof Error ? err.message : err);
      return { ok: false, simulated: false, error: "Publikování na platformu selhalo." };
    }
  }
  // Honest simulation: a labelled preview URL, flagged so the UI never presents it as real.
  return { ok: true, simulated: true, externalUrl: `https://demo.social/${platform}/${id}` };
}

/** Send a reply to an inbound comment/DM. A reply is a DISTINCT operation from a post:
 *  it must be delivered to `messageId`. It routes through the provider's `reply`
 *  capability ONLY — never through `publish`, which would post the reply as a new
 *  standalone public post (a private DM leaked publicly under the brand's name). No
 *  adapter implements `reply` yet, so today every path is an honest simulation. */
export async function publishReply(
  platform: SocialPlatform,
  messageId: string,
  reply: string,
  ctx: PublishContext = {}
): Promise<PublishResult> {
  const provider = socialProvider(platform);
  if (provider?.reply && canPublishReal(platform, ctx)) {
    try {
      const res = await provider.reply(
        { token: ctx.token as string, messageId, content: reply },
        ctx.transport ?? httpSocialTransport()
      );
      return { ok: true, simulated: false, externalUrl: res.url };
    } catch (err) {
      console.error(`[social] real reply failed (${platform}/${messageId}):`, err instanceof Error ? err.message : err);
      return { ok: false, simulated: false, error: "Odpověď se nepodařilo odeslat." };
    }
  }
  // No reply adapter → simulate. Reusing publish() here would leak the private reply
  // as a public post, so a real-but-unsupported connection simulates instead.
  return { ok: true, simulated: true };
}
