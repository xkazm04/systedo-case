/** Per-user Google OAuth access tokens for server-side Google API calls.
 *
 *  Auth.js's Firestore adapter persists the signed-in user's Google account
 *  (incl. access_token / refresh_token / expires_at) in the `accounts` collection.
 *  This reads it, transparently refreshes an expired access token via Google's
 *  token endpoint, writes the new token back, and returns a usable bearer token.
 *  Server-only. */
import { firestore } from "@/lib/firebase";

interface AccountTokens {
  access_token?: string;
  refresh_token?: string;
  /** epoch seconds */
  expires_at?: number;
  scope?: string;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

async function loadGoogleAccount(userId: string) {
  // The adapter stores one accounts doc per (provider, providerAccountId), with a
  // userId field linking to the user. Find this user's Google account.
  const snap = await firestore
    .collection("accounts")
    .where("userId", "==", userId)
    .where("provider", "==", "google")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  return { ref: doc.ref, data: doc.data() as AccountTokens };
}

async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_at: number } | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    console.error("[google] token refresh failed:", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  return { access_token: json.access_token, expires_at: nowSec() + (json.expires_in ?? 3600) };
}

/** A valid Google access token for the user, refreshing if needed. null when the
 *  user has no connected Google account. */
export async function getUserAccessToken(userId: string): Promise<string | null> {
  const account = await loadGoogleAccount(userId);
  if (!account) return null;
  const { ref, data } = account;

  // Still valid (with a 60s safety margin)?
  if (data.access_token && data.expires_at && data.expires_at - 60 > nowSec()) {
    return data.access_token;
  }
  if (!data.refresh_token) return data.access_token ?? null;

  const refreshed = await refreshAccessToken(data.refresh_token);
  if (!refreshed) return data.access_token ?? null;

  await ref.update({ access_token: refreshed.access_token, expires_at: refreshed.expires_at });
  return refreshed.access_token;
}

/** Whether the user has a connected Google account with the adwords scope. */
export async function hasAdsScope(userId: string): Promise<boolean> {
  const account = await loadGoogleAccount(userId);
  return Boolean(account?.data.scope?.includes("adwords"));
}
