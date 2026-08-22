"use client";

/** "Odpovědět dvojníkem" from a canvas dot.
 *
 *  A dot carries only what the canvas needs to draw it, so the hand-off fetches the
 *  real `Contact` first — the twin's seed wants the person's own words and their
 *  preferred channel, and answering from a five-field projection would put a
 *  fabricated brief in the outbox. When the contact cannot be fetched (the sample
 *  set is not in the store), it degrades to a MINIMAL, honest seed rather than
 *  inventing content: the name we already showed, and no quoted text.
 *
 *  Reuses the module's existing bridge (`../handoff`) — this view grows no reply
 *  box of its own, so every outbound message still passes one voice, one autonomy
 *  gate and one approve/reject record. */
import { seedTwinReply } from "../handoff";
import type { Contact } from "@/lib/leads/types";
import type { LandscapePoint } from "@/lib/leads/landscape";

async function fetchContact(projectId: string, contactId: string): Promise<Contact | null> {
  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/crm/contacts/${encodeURIComponent(contactId)}`
    );
    const json = (await res.json()) as { ok?: boolean; contact?: Contact };
    return json?.ok && json.contact ? json.contact : null;
  } catch {
    return null;
  }
}

/** The skeleton a seed needs when the store cannot answer. Carries the name and
 *  nothing else — no notes, no channel guess. */
function minimalContact(projectId: string, p: LandscapePoint): Contact {
  const now = new Date().toISOString();
  return {
    id: p.id,
    projectId,
    name: p.name || undefined,
    stage: p.stage,
    stageEnteredAt: now,
    attribution: { source: "unknown" },
    consent: [],
    tags: [],
    firstSeenAt: now,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Seed the twin's outbox for this dot. Returns the contact used, so the caller can
 *  navigate straight after. */
export async function seedReplyForPoint(
  projectId: string,
  point: LandscapePoint,
  fallbackText: string
): Promise<void> {
  const contact = (await fetchContact(projectId, point.id)) ?? minimalContact(projectId, point);
  seedTwinReply(projectId, contact, contact.notes ?? fallbackText);
}
