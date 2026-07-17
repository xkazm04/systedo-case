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

/** A *usable* Google access token for the user, refreshing if needed. Returns null
 *  when the user has no connected Google account OR when the cached token is expired
 *  and no fresh one can be minted (no refresh token / refresh failed). The contract
 *  is strict: a non-null return is a token the caller may treat as live; null means
 *  "go sample / prompt re-consent". It never hands back a token it KNOWS is expired,
 *  which previously made `resolveGoogle` build a live provider that 401s on every
 *  fetch and degrades to sample every single sync.
 *
 *  `forceRefresh` skips the not-yet-expired short-circuit and mints a new token from
 *  the refresh token — the single-retry path a live 401 takes: the cached token was
 *  accepted as unexpired but the API rejected it (revoked / clock skew), so the retry
 *  must resolve a genuinely fresh one rather than replay the same rejected token. */
export async function getUserAccessToken(
  userId: string,
  opts: { forceRefresh?: boolean } = {}
): Promise<string | null> {
  const account = await loadGoogleAccount(userId);
  if (!account) return null;
  const { ref, data } = account;

  // Still valid (with a 60s safety margin)?
  const stillValid = Boolean(data.access_token && data.expires_at && data.expires_at - 60 > nowSec());
  // Short-circuit an unexpired token unless a live 401 forced a refresh.
  if (!opts.forceRefresh && stillValid) return data.access_token!;

  if (data.refresh_token) {
    const refreshed = await refreshAccessToken(data.refresh_token);
    if (refreshed) {
      await ref.update({ access_token: refreshed.access_token, expires_at: refreshed.expires_at });
      return refreshed.access_token;
    }
  }

  // No refresh token, or the refresh call failed. Only hand back the cached token if
  // it is genuinely still valid (the forceRefresh-after-401 race may still hold a good
  // token worth one replay); NEVER return a token we know is expired — signal failure
  // with null so the caller skips the live provider and prompts re-consent.
  return stillValid ? data.access_token! : null;
}

/** Whether the user has a connected Google account with the adwords scope. */
export async function hasAdsScope(userId: string): Promise<boolean> {
  const account = await loadGoogleAccount(userId);
  return Boolean(account?.data.scope?.includes("adwords"));
}
