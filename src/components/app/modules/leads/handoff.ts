"use client";

/** Leady → Schránka zpráv hand-off. This module deliberately grows NO reply box:
 *  every outbound message the twin writes must pass one voice, one autonomy gate
 *  and one approve/reject record, so "Odpovědět dvojníkem" seeds the existing
 *  `replySeedKey` bridge (the same one the Socials inbox uses) and routes to
 *  `schranka`, carrying `?from=leady` so the destination offers the way back. */
import { replySeedKey, type ReplySeed } from "@/lib/twin/reply-seed";
import { isTwinChannel } from "@/lib/twin/types";
import type { Contact } from "@/lib/leads/types";

/** The twin channel to answer a contact on: their preferred one when known, else
 *  the absorbed speed-to-lead inbox — which is exactly what an unanswered enquiry
 *  is. Never guessed from the attribution source (an ad click is not a channel we
 *  can reply on). */
function channelFor(c: Contact) {
  return isTwinChannel(c.preferredChannel) ? c.preferredChannel : ("leads" as const);
}

/** What the twin should answer: the contact's own words when we kept them, else an
 *  honest one-line brief. Never a fabricated quote. */
export function inboundTextFor(c: Contact, fallback: string): string {
  const note = c.notes?.trim();
  return note && note.length > 0 ? note : fallback;
}

export function schrankaHref(projectId: string): string {
  return `/app/${projectId}/schranka?from=leady`;
}

/** Write the seed. Returns false when storage is unavailable — the caller still
 *  navigates (an unseeded outbox is a smaller failure than a dead button). */
export function seedTwinReply(projectId: string, contact: Contact, fallbackText: string): boolean {
  try {
    const seed: ReplySeed = {
      channel: channelFor(contact),
      contact: contact.name ?? contact.email ?? contact.phone ?? "",
      inbound: inboundTextFor(contact, fallbackText),
    };
    window.sessionStorage.setItem(replySeedKey(projectId), JSON.stringify(seed));
    return true;
  } catch {
    return false;
  }
}
