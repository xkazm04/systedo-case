/** Data-source seam for the lead-quality funnel — the single place the funnel flips
 *  sample→real. `resolveLeadFunnel` does the reads (one bounded contacts scan, the
 *  stored import, and the rolled-up conversion ledger when an owner is given) and
 *  hands them to the pure rule in ./funnel-tier: CRM contacts → the import → the
 *  seeded sample. Kvalita leadů, the diagnosis click path, the digest cron and the
 *  recap grounding all call it, so they cannot disagree about the funnel or its
 *  ledger join. Mirrors lp-exp/resolve + local-signals/resolve. Server-only. The
 *  funnel/velocity/alert math is untouched; this only chooses which source set feeds
 *  it, and labels the provenance. */
import "server-only";
import { getLeadImports } from "./store";
import { sourcesForProject, type LeadSource } from "./sample";
import { conversionsByLabelFrom, pickFunnelTier, type FunnelSource, type LeadFunnel } from "./funnel-tier";
import { countContacts, listContacts, LIST_SCAN_CAP } from "@/lib/leads/store";
import { getConversionSummary } from "@/lib/leads/conversion-state";
import type { Contact } from "@/lib/leads/types";
import type { Project } from "@/lib/projects/types";

export type { LeadFunnel } from "./funnel-tier";

export interface ResolvedLeadSources {
  /** the active set: contacts, else the aggregated import, else the sample */
  sources: LeadSource[];
  /** whether the active set is live (contacts / imported) rather than the sample */
  live: boolean;
  /** provenance of the active set */
  source: FunnelSource;
  /** ISO timestamp of the import, when on the import tier */
  syncedAt?: string;
  /** for source "url": the hosted CSV the leads were fetched from */
  sourceUrl?: string;
}

/** The project's contacts (tombstones included — they still count) in one bounded
 *  scan, plus the store's count when the scan may have hit its cap. A store hiccup
 *  reads as "no contacts", never as a broken funnel. */
async function readContacts(projectId: string): Promise<{ contacts: Contact[]; total?: number }> {
  let contacts: Contact[] = [];
  try {
    contacts = await listContacts(projectId, { limit: LIST_SCAN_CAP, includeErased: true });
  } catch {
    return { contacts: [] };
  }
  if (contacts.length < LIST_SCAN_CAP) return { contacts };
  const total = await countContacts(projectId).catch(() => contacts.length);
  return { contacts, total };
}

async function tierFor(projectId: string, sample: LeadSource[]) {
  const [{ contacts, total }, imports] = await Promise.all([
    readContacts(projectId),
    getLeadImports(projectId).catch(() => null), // store hiccup → next tier
  ]);
  return pickFunnelTier({ contacts, contactTotal: total, imports, sample });
}

/** The project's lead funnel: the active tier, its rows, its cache version and — when
 *  `userId` is given — the conversion-ledger join. Never throws: every read degrades
 *  to the next tier (or to no join), so the module never breaks on a store hiccup. */
export async function resolveLeadFunnel(
  project: Project,
  userId: string | null = null
): Promise<LeadFunnel> {
  const [tier, conversions] = await Promise.all([
    tierFor(project.id, sourcesForProject(project)),
    userId ? getConversionSummary(userId, project.id).catch(() => null) : Promise.resolve(null),
  ]);
  const conversionsByLabel = conversionsByLabelFrom(conversions);
  return { ...tier, conversions, ...(conversionsByLabel ? { conversionsByLabel } : {}) };
}

/** The active source set alone, for a caller holding a project id and its sample.
 *  A thin alias over the same tier rule as {@link resolveLeadFunnel}. */
export async function resolveLeadSources(
  projectId: string,
  sample: LeadSource[]
): Promise<ResolvedLeadSources> {
  const tier = await tierFor(projectId, sample);
  const out: ResolvedLeadSources = { sources: tier.sources, live: tier.live, source: tier.source };
  if (tier.syncedAt) out.syncedAt = tier.syncedAt;
  if (tier.sourceUrl) out.sourceUrl = tier.sourceUrl;
  return out;
}
