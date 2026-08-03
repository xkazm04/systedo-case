/** Maps a Distribuce channel label → the social platform it can be handed off to.
 *  Channels the social center can't post (Newsletter, X/Twitter) map to null, so
 *  the UI hides the "Naplánovat" action for them while keeping copy + edit.
 *
 *  The only caller is DistributionModule, and it only ever passes a channel from
 *  CHANNEL_LIMITS (generate.ts) — so the domain of this function is exactly
 *  REPURPOSE_CHANNELS. A "Facebook" case used to sit here for a channel no
 *  producer emits; it was removed rather than faked into reachability, because
 *  adding a Facebook variant is a content decision for repurpose(), not a
 *  side effect of tidying this map. Add the case back the day generate.ts emits
 *  the variant. */
import type { SocialPlatform } from "@/lib/social/types";

export function channelToPlatform(channel: string): SocialPlatform | null {
  switch (channel) {
    case "LinkedIn":
      return "linkedin";
    case "Instagram":
      return "instagram";
    default:
      // Newsletter, X / Twitter — no social-center publishing surface.
      return null;
  }
}
