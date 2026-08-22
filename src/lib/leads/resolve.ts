/** The sample↔live seam for the lead entity layer — the single place the module
 *  flips from illustration to real data. Mirrors `lead-quality/resolve.ts` +
 *  `lp-exp/resolve` + `local-signals/resolve`:
 *
 *    live contacts (the project has any) → else the seeded per-type sample
 *
 *  NEVER THROWS. A store hiccup degrades to the sample rather than breaking the
 *  module, exactly as `resolveLeadSources` does — and `live: false` is what makes
 *  the shell render its "sample data" note, so degrading is visible, not silent.
 *  Server-only (it reads the store). */
import "server-only";
import type { Project } from "@/lib/projects/types";
import { countContacts, listContacts, type ContactQuery } from "./store";
import { sampleContactsForProject } from "./sample";
import type { Contact } from "./types";

export interface ResolvedContacts {
  /** the active set: the project's stored contacts when it has any, else sample */
  contacts: Contact[];
  /** whether the active set is real rather than the illustrative sample */
  live: boolean;
  source: "contacts" | "sample";
  /** how many contacts the project actually holds (0 when on the sample) */
  total: number;
}

/** The active contact set for a project. `query` is applied to the LIVE set only —
 *  filtering a sample would produce an empty screen that looks like a bug. */
export async function resolveContacts(
  project: Project,
  query: ContactQuery = {},
  now: Date = new Date()
): Promise<ResolvedContacts> {
  try {
    // Liveness is probed by a real read, not by the counter: the counter is an
    // optimisation (one doc read instead of an aggregate) and a project whose
    // counter is missing or stale must NOT silently fall back to sample data.
    const probe = await listContacts(project.id, { limit: 1, includeErased: true });
    if (probe.length > 0) {
      const contacts = await listContacts(project.id, query);
      let total = 0;
      try {
        total = await countContacts(project.id);
      } catch {
        total = contacts.length;
      }
      return { contacts, live: true, source: "contacts", total: Math.max(total, contacts.length) };
    }
  } catch {
    // store hiccup → sample, never break the module
  }
  return {
    contacts: sampleContactsForProject(project, now),
    live: false,
    source: "sample",
    total: 0,
  };
}
