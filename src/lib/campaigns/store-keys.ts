/** Pure key + attribution helpers for the per-period campaign store. The store
 *  used to hold exactly one period at a time (every sync wiped the previous
 *  one), so flipping 7d → 30d → 7d cost three connector round-trips and three
 *  units of the daily sync quota. State is now keyed by period; these helpers
 *  centralise the doc-id scheme and the backward-compat rule for docs written
 *  before keying existed. Framework-free so the rules are unit-testable. */
import type { CampaignPeriod } from "./types";

/** Sanitize one tenant-key component so a "/" (or any other reserved char) can't
 *  break out of the Firestore document path into a nested sub-collection. Shared
 *  by every key builder so the read, sync and audit paths sanitise identically. */
export function safeKeyComponent(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** The per-tenant key: per-user, optionally per-project, optionally per-account.
 *  Single source of truth for the read path (resolveTenant), the sync path
 *  (resolveCampaignContext) and the mutation audit, so no two of them can ever
 *  compute a different key for the same request. Pure (framework-free) so the
 *  keying rules are unit-testable without touching Firestore. */
export function buildTenantKey(
  userId: string,
  projectId?: string | null,
  customerId?: string | null
): string {
  const base = projectId
    ? `u_${safeKeyComponent(userId)}_proj_${safeKeyComponent(projectId)}`
    : `u_${safeKeyComponent(userId)}`;
  return customerId ? `${base}_${safeKeyComponent(customerId)}` : base;
}

/** The LEGACY tenant a per-mutation audit doc was written under before the audit
 *  was co-located with the campaigns it acts on: `u_{userId}_{customerId}`, with
 *  NO project scope (mutations.ts hardcoded this). Kept so a reader can dual-read
 *  old audit history — history is never rewritten, only unioned on read. */
export function legacyMutationAuditTenant(userId: string, customerId: string): string {
  return `u_${safeKeyComponent(userId)}_${safeKeyComponent(customerId)}`;
}

/** Distinct tenant keys a mutation-audit reader should union to surface the full
 *  history: the current (project-scoped) tenant the audit now writes to, plus the
 *  legacy project-agnostic one. Deduped, so a tenant with no legacy divergence
 *  (project-less, or no connected account) reads exactly once. */
export function mutationAuditReadTenants(
  tenant: string,
  userId: string,
  customerId: string | null | undefined
): string[] {
  if (!customerId) return [tenant];
  const legacy = legacyMutationAuditTenant(userId, customerId);
  return legacy === tenant ? [tenant] : [tenant, legacy];
}

/** Campaign doc id: period-prefixed so two periods of one campaign coexist.
 *  Legacy docs are keyed by the bare campaign id (and carry no `period` field). */
export function campaignDocId(period: CampaignPeriod, campaignId: string): string {
  return `${period}_${campaignId}`;
}

/** Portfolio-series doc id (legacy single doc was `latest`). */
export function seriesDocId(period: CampaignPeriod): string {
  return period;
}

/** Per-campaign-series doc id (legacy single doc was `campaigns`). */
export function campaignSeriesDocId(period: CampaignPeriod): string {
  return `campaigns_${period}`;
}

/**
 * Does a stored doc belong to the requested period?
 *
 * Docs written before per-period keying carry no `period` field. They are the
 * data of the tenant's *active* (root-meta) period — the single-period store
 * only ever held the last-synced period — so they match the request exactly
 * when the request targets that active period, and never leak into another
 * period's view.
 */
export function belongsToPeriod(
  docPeriod: string | null | undefined,
  activePeriod: string | null | undefined,
  requested: string
): boolean {
  return docPeriod === requested || (docPeriod == null && activePeriod === requested);
}
