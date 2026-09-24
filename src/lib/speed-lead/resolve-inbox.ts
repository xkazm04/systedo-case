/** The sample↔live seam for Schránka's speed-to-lead inbox:
 *
 *    the project has CRM contacts → its urgent queue (inbox-source.ts)
 *    else                          → the per-type sample constant
 *
 *  Liveness is probed by a real read (the `leads/resolve.ts` rule: a missing or stale
 *  counter must never silently flip a live project back to the sample). NEVER
 *  THROWS — a store hiccup degrades to the sample, and `live: false` is what keeps
 *  the page's sample note up, so degrading is visible. Server-only (reads the store). */
import "server-only";
import { listContacts, LIST_SCAN_CAP } from "@/lib/leads/store";
import type { ProjectType } from "@/lib/projects/types";
import { inboxLeadsFromContacts } from "./inbox-source";
import { LOCAL_SAMPLE_LEADS, SAMPLE_LEADS, type InboundLead } from "./sample";

export interface ResolvedInbox {
  /** true ⇒ every row is a real contact (each carries a `contactId`) */
  live: boolean;
  leads: InboundLead[];
}

export async function resolveInboxLeads(
  project: { id: string; type: ProjectType },
  now: Date = new Date()
): Promise<ResolvedInbox> {
  try {
    const probe = await listContacts(project.id, { limit: 1, includeErased: true });
    if (probe.length > 0) {
      const contacts = await listContacts(project.id, { limit: LIST_SCAN_CAP });
      return { live: true, leads: inboxLeadsFromContacts(contacts, now.getTime()) };
    }
  } catch {
    // store hiccup → the sample, never a broken inbox
  }
  // D2: a `local` provider sees booking-style enquiries, not B2B service leads.
  return { live: false, leads: project.type === "local" ? LOCAL_SAMPLE_LEADS : SAMPLE_LEADS };
}
