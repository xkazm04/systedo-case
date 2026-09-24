/** The lead funnel's provenance rule, decided ONCE (pure, no store reads, no clock).
 *
 *  Kvalita leadů, the lead-source diagnosis click path, the weekly digest cron and the
 *  recap grounding all need the same two answers: which tier feeds the funnel, and
 *  which conversion-ledger counts belong to which row. Before this module each built
 *  them itself, and they drifted (the cron seeded without the ledger join, so every
 *  digest-origin diagnosis was badged stale on the page). Now `resolve.ts` does the
 *  reads and everything else goes through these four functions:
 *
 *    pickFunnelTier         CRM contacts → the stored CSV/URL import → the sample
 *    conversionsByLabelFrom the ledger's per-label 30-day counts (the W3-C join)
 *    funnelSeeds            the ONE diagnosis seed builder (it feeds `inputDigest`)
 *    funnelVersion          the recap cache version for the active tier
 *
 *  The contacts tier goes through `contactsToLeadSources`, which groups by
 *  `sourceLabel` — the same function that stamps a ledger row's label — so the join
 *  matches by construction. Tombstoned contacts are counted (its default), so a
 *  GDPR erase never moves the funnel. A CRM carries no ad spend, so spend is 0 and
 *  CPL/CPQL show "—", exactly as on the import tier. */
import type { LeadSource } from "./sample";
import type { ImportedLead } from "./types";
import { aggregateLeads } from "./import";
import { withMetrics } from "./compute";
import { contactsToLeadSources } from "@/lib/leads/aggregate";
import type { Contact } from "@/lib/leads/types";
import type { ConversionSummary } from "@/lib/leads/conversion-events";
import {
  buildLeadSourceSeeds,
  type ConversionsByLabel,
  type LeadSourceSeed,
} from "@/lib/diagnoses/lead-source-request";
import { inputDigest } from "@/lib/diagnoses/types";

/** Where the active funnel came from. */
export type FunnelSource = "contacts" | "import" | "url" | "sample";

/** The chosen tier: the funnel rows plus the provenance the surfaces disclose. */
export interface FunnelTier {
  sources: LeadSource[];
  /** real data (contacts or an import) rather than the illustrative sample */
  live: boolean;
  source: FunnelSource;
  /** import tier: ISO timestamp of the import */
  syncedAt?: string;
  /** url tier: the hosted CSV the rows were fetched from */
  sourceUrl?: string;
  /** contacts tier: how many contacts the project holds */
  contactCount?: number;
  /** contacts tier, only when the bounded scan read fewer than `contactCount`: how
   *  many (the most recently updated) the funnel actually counts */
  contactsScanned?: number;
  /** contacts tier: rows of a stored import that the contacts shadow (disclosed) */
  shadowedImportRows?: number;
  /** recap cache version of the active tier (undefined on the sample) */
  version?: string;
}

/** The tier plus the conversion-ledger join, as `resolveLeadFunnel` returns it. */
export interface LeadFunnel extends FunnelTier {
  /** the rolled-up ledger summary, or null (never rolled up / no owner to read as) */
  conversions: ConversionSummary | null;
  conversionsByLabel?: ConversionsByLabel;
}

export interface FunnelTierInput {
  /** the project's contacts, tombstones included (one bounded scan) */
  contacts: readonly Contact[];
  /** what the store counts, when the scan may have been capped */
  contactTotal?: number;
  /** the stored import, or null */
  imports: {
    items: readonly ImportedLead[];
    source?: "import" | "url";
    syncedAt?: string;
    sourceUrl?: string;
  } | null;
  /** the per-project illustrative sample */
  sample: LeadSource[];
}

/** Pick the active tier: contacts, then the import, then the sample. */
export function pickFunnelTier(input: FunnelTierInput): FunnelTier {
  const { contacts, imports, sample } = input;
  const importRows = imports?.items.length ?? 0;
  if (contacts.length > 0) {
    const total = Math.max(input.contactTotal ?? contacts.length, contacts.length);
    const tier: FunnelTier = {
      sources: contactsToLeadSources(contacts),
      live: true,
      source: "contacts",
      contactCount: total,
      version: funnelVersion({ source: "contacts", contacts, contactTotal: total }),
    };
    if (total > contacts.length) tier.contactsScanned = contacts.length;
    if (importRows > 0) tier.shadowedImportRows = importRows;
    return tier;
  }
  if (imports && importRows > 0) {
    const tier: FunnelTier = {
      sources: aggregateLeads([...imports.items]),
      live: true,
      source: imports.source ?? "import",
    };
    if (imports.syncedAt) tier.syncedAt = imports.syncedAt;
    if (imports.sourceUrl) tier.sourceUrl = imports.sourceUrl;
    tier.version = funnelVersion({ source: tier.source, syncedAt: tier.syncedAt });
    return tier;
  }
  return { sources: sample, live: false, source: "sample" };
}

/** The ledger's per-label 30-day counts, keyed by the display label the funnel
 *  groups by; undefined when the rollup has never run. */
export function conversionsByLabelFrom(
  summary: Pick<ConversionSummary, "bySource"> | null | undefined
): ConversionsByLabel | undefined {
  if (!summary) return undefined;
  return Object.fromEntries(
    summary.bySource.map((c) => [
      c.sourceLabel,
      { qualified30d: c.qualified30d, won30d: c.won30d, gclidPct: c.gclidPct },
    ])
  );
}

/** The diagnosis seeds for a funnel. The page, the click path and the digest cron all
 *  call THIS, because the seed feeds `inputDigest`: two builders that disagree badge
 *  every stored diagnosis stale. */
export function funnelSeeds(funnel: {
  sources: readonly LeadSource[];
  conversionsByLabel?: ConversionsByLabel;
}): LeadSourceSeed[] {
  const rows = funnel.sources.map(withMetrics).sort((a, b) => b.qualityScore - a.qualityScore);
  return buildLeadSourceSeeds(rows, funnel.conversionsByLabel);
}

/** The recap cache version of a tier. Contacts: a digest of every contact's
 *  (id, stage, updatedAt), order-free, so any edit re-grounds the recap. Import:
 *  the import's timestamp (what the recap keyed on before). Sample: none. */
export function funnelVersion(input: {
  source: FunnelSource;
  syncedAt?: string;
  contacts?: readonly Contact[];
  contactTotal?: number;
}): string | undefined {
  if (input.source === "sample") return undefined;
  if (input.source !== "contacts") return input.syncedAt;
  const marks = (input.contacts ?? []).map((c) => `${c.id}|${c.stage}|${c.updatedAt}`).sort();
  const total = input.contactTotal ?? marks.length;
  return `contacts:${total}:${inputDigest(marks)}`;
}
