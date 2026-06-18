/** Maps a Distribuce channel label → the social platform it can be handed off to.
 *  Channels the social center can't post (Newsletter, X/Twitter) map to null, so
 *  the UI hides the "Naplánovat" action for them while keeping copy + edit. */
import type { SocialPlatform } from "@/lib/social/types";

export function channelToPlatform(channel: string): SocialPlatform | null {
  switch (channel) {
    case "LinkedIn":
      return "linkedin";
    case "Instagram":
      return "instagram";
    case "Facebook":
      return "facebook";
    default:
      // Newsletter, X / Twitter — no social-center publishing surface.
      return null;
  }
}
