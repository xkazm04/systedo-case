/** Shared per-tenant Firestore helpers used across the campaign store's four
 *  concerns (campaigns, series, reports, snapshots). Server-only. */
import "server-only";
import { firestore } from "@/lib/firebase";
import type { CampaignPeriod } from "../types";

export function tenantDoc(tenant: string) {
  return firestore.collection("tenants").doc(tenant);
}

/** One read of the tenant root doc, shared across a request. The root carries the
 *  sync metadata AND the active-period pointer, which the campaign/series/snapshot
 *  reads each need — reading it once here (see loadState) and passing it down lets
 *  a whole page load resolve the root a single time instead of 5+ times. */
export interface TenantRoot {
  /** raw root data, or undefined before the first sync */
  data: FirebaseFirestore.DocumentData | undefined;
  /** the active period (root meta), or null before the first sync */
  activePeriod: CampaignPeriod | null;
}

/** Read the tenant root doc once and parse the active-period pointer off it. */
export async function readTenantRoot(tenant: string): Promise<TenantRoot> {
  const doc = await tenantDoc(tenant).get();
  const data = doc.data();
  return { data, activePeriod: (data?.period as CampaignPeriod | undefined) ?? null };
}

/** The tenant's active period (root meta), or null before the first sync — the
 *  attribution anchor for docs written before per-period keying. Pass a
 *  pre-read `root` to reuse the shared root read instead of issuing another. */
export async function activePeriod(
  tenant: string,
  root?: TenantRoot
): Promise<CampaignPeriod | null> {
  if (root) return root.activePeriod;
  return (await readTenantRoot(tenant)).activePeriod;
}
