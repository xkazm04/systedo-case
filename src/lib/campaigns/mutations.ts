/** Apply a recommendation back to Google Ads — closing the observe → decide → act
 *  loop. Human-triggered only (never automatic), live-account only, and every
 *  applied change is written to an audit log (`tenants/{tenant}/mutations`).
 *  Server-only. */
import { firestore } from "@/lib/firebase";
import { getAdsConnection } from "./connection";
import { getUserAccessToken } from "@/lib/google/token";
import { adsConfigured, pauseCampaign } from "@/lib/google/ads";

export interface MutationResult {
  ok: boolean;
  error?: string;
}

/** Pause a campaign in the user's active (live) Google Ads account, and audit it.
 *  Requires a connected account + developer token; on sample/anonymous it returns
 *  a clear, non-destructive error. */
export async function applyPause(
  userId: string,
  campaignId: string,
  campaignName: string
): Promise<MutationResult> {
  if (!adsConfigured()) {
    return { ok: false, error: "Živé úpravy vyžadují Google Ads developer token." };
  }
  const connection = await getAdsConnection(userId);
  if (!connection) {
    return { ok: false, error: "Nejdřív připojte živý Google Ads účet." };
  }
  const token = await getUserAccessToken(userId);
  if (!token) {
    return { ok: false, error: "Chybí Google autorizace (přihlaste se znovu)." };
  }

  const tenant = `u_${userId}_${connection.customerId}`;
  try {
    await pauseCampaign(token, connection.customerId, campaignId);
    await firestore.collection("tenants").doc(tenant).collection("mutations").add({
      action: "pause",
      campaignId,
      campaignName,
      customerId: connection.customerId,
      userId,
      at: new Date().toISOString(),
    });
    return { ok: true };
  } catch (err) {
    console.error("[mutations] pause failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Úprava se nezdařila." };
  }
}
