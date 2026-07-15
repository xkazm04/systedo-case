/** The pure spec of the ads provider-registry precedence + the scheduled sync's
 *  fan-out union. Framework-free (no Firestore, no env, no async) so the ordering
 *  rules are unit-testable in isolation — the async resolvers in connector.ts
 *  (resolveGoogle → resolveSklik, first-non-null wins) implement exactly the
 *  {@link chooseAdsSource} table below, and the cron's user set is exactly
 *  {@link unionConnectedUserIds}. Keep this the single source of truth for both. */

export type AdsSourceChoice = "google-ads" | "sklik" | "sample";

/** Which live source a request resolves to, given the credential signals.
 *
 *  Precedence (mirrors LIVE_PROVIDERS = [resolveGoogle, resolveSklik]):
 *    1. Google Ads — the user has a connected Google account AND the developer token
 *       is configured AND a live OAuth token exists. Google always wins when present.
 *    2. Sklik — NO Google account is connected AND a Sklik token is available (the
 *       caller's per-user token OR the env dev/deploy fallback).
 *    3. Sample — neither live source resolves.
 *
 *  So Sklik never overrides a Google connection, and adding Sklik credentials to a
 *  Google user changes nothing (Google-first). */
export function chooseAdsSource(f: {
  /** the user has a connected/active Google Ads account */
  hasGoogleConnection: boolean;
  /** the deployment has a Google Ads developer token (adsConfigured) */
  googleConfigured: boolean;
  /** a live Google OAuth access token resolved for the user */
  hasGoogleToken: boolean;
  /** a Sklik token is available — per-user encrypted token OR the env fallback */
  hasSklikToken: boolean;
}): AdsSourceChoice {
  if (f.hasGoogleConnection && f.googleConfigured && f.hasGoogleToken) return "google-ads";
  if (!f.hasGoogleConnection && f.hasSklikToken) return "sklik";
  return "sample";
}

/** The scheduled sync's user set: Google-connected users unioned with per-user
 *  Sklik-connected users, deduped and order-stable (Google ids first, then any
 *  Sklik-only ids). A Sklik-only user (invisible to the Google-only listing before)
 *  is now included exactly once; a user in both appears once. */
export function unionConnectedUserIds(googleUserIds: string[], sklikUserIds: string[]): string[] {
  return [...new Set([...googleUserIds, ...sklikUserIds])];
}
