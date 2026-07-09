/** sessionStorage bridge: another module hands an inbound message to the twin's
 *  Schránka zpráv so "Odpovědět" carries the conversation across the route change.
 *
 *  This is what makes the Message box the app's single review surface. The Socials
 *  inbox no longer drafts a reply inline; it seeds this and routes to `schranka`,
 *  where the draft goes through the same voice, the same autonomy gate and the same
 *  approve/reject record as every other channel. Mirrors `briefSeedKey`
 *  (keywords → content brief). Per-project so seeds don't leak between projects in
 *  the same tab. Framework-free. */
import { isTwinChannel, type TwinChannel } from "./types";

export const replySeedKey = (projectId: string) => `app:twin-reply-seed:${projectId}`;

export interface ReplySeed {
  channel: TwinChannel;
  /** who wrote the inbound message */
  contact: string;
  /** the message to answer */
  inbound: string;
}

/** Coerce whatever survived sessionStorage into a usable seed, or null. The value
 *  crosses a storage boundary and a route change, so it is parsed defensively. */
export function parseReplySeed(raw: string | null): ReplySeed | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const inbound = typeof o.inbound === "string" ? o.inbound.trim() : "";
    if (!inbound || !isTwinChannel(o.channel)) return null;
    return {
      channel: o.channel,
      contact: typeof o.contact === "string" ? o.contact.trim().slice(0, 120) : "",
      inbound: inbound.slice(0, 4000),
    };
  } catch {
    return null;
  }
}
