/** Shared per-tenant Firestore helpers used across the campaign store's four
 *  concerns (campaigns, series, reports, snapshots). Server-only. */
import "server-only";
import { firestore } from "@/lib/firebase";
import type { CampaignPeriod } from "../types";

export function tenantDoc(tenant: string) {
  return firestore.collection("tenants").doc(tenant);
}

/** The tenant's active period (root meta), or null before the first sync —
 *  the attribution anchor for docs written before per-period keying. */
export async function activePeriod(tenant: string): Promise<CampaignPeriod | null> {
  const doc = await tenantDoc(tenant).get();
  return (doc.data()?.period as CampaignPeriod | undefined) ?? null;
}
