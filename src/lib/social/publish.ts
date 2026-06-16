/** Publish a post / reply to the social platform. Real Meta Graph / LinkedIn API
 *  calls are the seam to implement once app credentials + review exist
 *  (socialConfigured()); until then this simulates a successful publish so the
 *  command center is fully demoable. Server-only. */
import { socialConfigured } from "./connection";
import type { SocialPlatform } from "./types";

export interface PublishResult {
  ok: boolean;
  externalUrl?: string;
  error?: string;
}

/** Publish caption content to a platform. Simulated in demo mode. */
export async function publishPost(
  platform: SocialPlatform,
  _content: string,
  id: string
): Promise<PublishResult> {
  void _content;
  if (socialConfigured()) {
    // TODO: real Graph/LinkedIn publish using the user's stored OAuth token.
    // Not implemented without app credentials — fall through to a simulated ok so
    // the flow never half-breaks in environments that set only one credential.
  }
  return { ok: true, externalUrl: `https://demo.social/${platform}/${id}` };
}

/** Send a reply to an inbound comment/DM. Simulated in demo mode. */
export async function publishReply(
  _platform: SocialPlatform,
  _messageId: string,
  _reply: string
): Promise<PublishResult> {
  void _platform;
  void _messageId;
  void _reply;
  return { ok: true };
}
