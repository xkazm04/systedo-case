/** Shared per-tenant helpers used across the campaign store's four concerns
 *  (campaigns, series, reports, snapshots). The raw document access dispatches
 *  through {@link tenantStore} (Firestore in prod, node:sqlite under LOCAL_DB);
 *  this file owns the shared root read + the period-attribution helpers over it.
 *  Server-only. */
import "server-only";
import { tenantStore } from "./backend";
import type { CampaignPeriod } from "../types";

/** One read of the tenant root doc, shared across a request. The root carries the
 *  sync metadata AND the active-period pointer, which the campaign/series/snapshot
 *  reads each need — reading it once here (see loadState) and passing it down lets
 *  a whole page load resolve the root a single time instead of 5+ times. */
export interface TenantRoot {
  /** raw root data, or undefined before the first sync */
  data: FirebaseFirestore.DocumentData | undefined;
  /** the active period (root meta), or null before the first sync */
  activePeriod: CampaignPeriod | null;
  /** the period un-keyed LEGACY docs are attributed to — PINNED once (see
   *  {@link legacyPeriod}); null before the first sync. */
  legacyPeriod: CampaignPeriod | null;
}

/** Read the tenant root doc once and parse the active-period pointer off it. */
export async function readTenantRoot(tenant: string): Promise<TenantRoot> {
  const data = await (await tenantStore()).getRoot(tenant);
  return {
    data,
    activePeriod: (data?.period as CampaignPeriod | undefined) ?? null,
    // Pinned attribution anchor for legacy (pre-keying) docs. Falls back to the
    // active period for tenants synced before it was recorded — so the value is
    // unchanged until a later active-period switch, which is exactly the bug it fixes.
    legacyPeriod:
      (data?.legacyPeriod as CampaignPeriod | undefined) ??
      (data?.period as CampaignPeriod | undefined) ??
      null,
  };
}

/** The tenant's active period (root meta), or null before the first sync. Pass a
 *  pre-read `root` to reuse the shared root read instead of issuing another. */
export async function activePeriod(
  tenant: string,
  root?: TenantRoot
): Promise<CampaignPeriod | null> {
  if (root) return root.activePeriod;
  return (await readTenantRoot(tenant)).activePeriod;
}

/**
 * The period that un-keyed LEGACY docs (written before per-period keying, so they
 * carry no `period` field) belong to — the attribution anchor `belongsToPeriod`
 * takes as its second argument.
 *
 * This used to be the LIVE active period, which meant switching the active period
 * (7d → 30d) silently re-attributed the old period's legacy docs to the NEW one,
 * polluting its timeline. It is now PINNED: `upsertCampaigns` records `legacyPeriod`
 * once (the active period observed at that first keyed sync) and never moves it, so
 * legacy docs stay bound to the period they were actually captured under regardless
 * of later active-period switches. Falls back to the active period when unrecorded,
 * so already-migrated tenants are unaffected until the moment the bug would trigger.
 */
export async function legacyPeriod(
  tenant: string,
  root?: TenantRoot
): Promise<CampaignPeriod | null> {
  if (root) return root.legacyPeriod;
  return (await readTenantRoot(tenant)).legacyPeriod;
}
