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

/** The stable synthetic "account" component a per-user Sklik connection keys its
 *  tenant under — the Sklik counterpart of a Google customerId. Because Sklik data
 *  is keyed with THIS fixed suffix (never the volatile Google customerId), a Sklik
 *  user who LATER connects Google does not orphan their Sklik-synced history: Google
 *  data lands under its own `_{customerId}` tenant, Sklik history stays addressable
 *  under `_sklik`, and disconnecting Google restores the Sklik view. The read path
 *  (resolveTenant) and the sync path (resolveCampaignContext) both apply it whenever
 *  the user has a per-user Sklik connection and no active Google account, so the two
 *  never disagree. NB: the legacy env-only global token keeps the base key (no
 *  per-user connection → no suffix), so pre-existing env-token data is untouched. */
export const SKLIK_TENANT_SUFFIX = "sklik";

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

/** Separator between a snapshot id's parts. Kept out of `campaignDocId`'s single
 *  `_` so a snapshot id is unambiguously distinguishable from a legacy bare-ISO one
 *  (ISO timestamps never contain `__`). */
export const SNAPSHOT_ID_SEP = "__";

/** Snapshot doc id — period-prefixed so a period's snapshots form a contiguous,
 *  document-id-ordered range (see {@link snapshotIdRange}): reads fetch exactly the
 *  window they need with a single-field id-range query, no over-fetch, no composite
 *  index. `syncedAt` is a fixed-width ISO string, so lexicographic id order within a
 *  period equals chronological order. Legacy snapshots keep their bare-ISO id (no
 *  `__`) — {@link isLegacySnapshotId} tells them apart.
 *
 *  `suffix` is an optional per-sync uniqueness tiebreak: the id used to be the bare
 *  `syncedAt`, so two syncs in the same millisecond collided and one overwrote the
 *  other. A short random suffix (appended AFTER syncedAt) makes both persist while
 *  preserving chronological order — syncedAt still dominates the sort, the suffix only
 *  breaks a same-millisecond tie. */
export function snapshotDocId(period: CampaignPeriod, syncedAt: string, suffix?: string): string {
  const base = `${period}${SNAPSHOT_ID_SEP}${syncedAt}`;
  return suffix ? `${base}${SNAPSHOT_ID_SEP}${suffix}` : base;
}

/** Upper sentinel appended to a period prefix to bound its snapshot id-range.
 *  `\uF8FF` is a Private-Use-Area code point that sorts lexicographically after
 *  every character a realistic snapshot id can contain (period names, digits, the
 *  `__` separator and ISO timestamps are all ASCII), so `[prefix, prefix +
 *  AFTER_ANY_ID)` is exactly this period's id range and never spills into another
 *  period's ids. Written as an explicit `\uF8FF` escape — NOT a literal invisible
 *  character — so an editor's "strip non-printable characters", a linter autofix,
 *  or a copy-paste refactor cannot silently delete the bound and collapse the range
 *  to empty. The `snapshotIdRange` unit test asserts `lt` sorts strictly above a
 *  real snapshot id, so a lost sentinel fails loudly. */
export const AFTER_ANY_ID = "\uF8FF";

/** The half-open document-id range `[gte, lt)` covering exactly one period's
 *  snapshots. Used with `orderBy(documentId, "desc").limit(n)` to read the n
 *  newest snapshots of a period directly — a single-field (`__name__`) query that
 *  needs no composite index. */
export function snapshotIdRange(period: CampaignPeriod): { gte: string; lt: string } {
  const prefix = `${period}${SNAPSHOT_ID_SEP}`;
  return { gte: prefix, lt: prefix + AFTER_ANY_ID };
}
/** Is this a legacy, pre-keying snapshot id? Legacy snapshots were keyed by the
 *  bare `syncedAt` ISO string, which never contains the `__` separator a keyed id
 *  always carries. Lets the reader tell an un-keyed legacy snapshot apart from a
 *  period-keyed one without a `period` field. */
export function isLegacySnapshotId(id: string): boolean {
  return !id.includes(SNAPSHOT_ID_SEP);
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
