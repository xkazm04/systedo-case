/** The pure spec of the ads provider-registry precedence + the scheduled sync's
 *  fan-out union. Framework-free (no Firestore, no env, no async) so the ordering
 *  rules are unit-testable in isolation — the async resolvers in connector.ts
 *  (resolveGoogle → resolveSklik, first-non-null wins) implement exactly the
 *  {@link chooseAdsSource} table below, and the cron's user set is exactly
 *  {@link unionConnectedUserIds}. Keep this the single source of truth for both. */

export type AdsSourceChoice = "google-ads" | "sklik" | "sample";

/** Which live source a request resolves to, given the credential signals.
 *
 *  ADR-0010 note: this is the PRIMARY — the one source a single-provider request
 *  (and every pre-ADR-0010 caller) resolves to. The full set a project reads and
 *  syncs is {@link chooseAdsSources}; use that whenever the question is "which
 *  tenants does this project cover", and this one only when a single answer is what
 *  the caller actually wants. The two agree except in one case, spelled out there.
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

/** ADR-0010 — the SET of live sources a project covers, in blend/precedence order.
 *
 *  This is the single source of truth the two halves of the ADR must agree on: the
 *  sync fan-out (planSyncTargets + the provider registry) and the union read
 *  (resolveProjectTenants + listCampaignsForProject). A change here that is not
 *  mirrored in both is the drift the ADR exists to prevent.
 *
 *  Rules:
 *    - Google Ads joins the set on exactly {@link chooseAdsSource}'s condition.
 *    - Sklik joins the set whenever a Sklik token is available — it no longer YIELDS
 *      to a Google connection. That is the whole change: the key was always
 *      per-account (`…_sklik` vs `…_{customerId}`), only the resolvers collapsed it
 *      to one. A project reading both networks is the union of its own tenants.
 *    - Neither → `["sample"]`, so the set is never empty and a caller can iterate it
 *      without a special case.
 *
 *  Single-source users are unchanged: the union of one tenant is that tenant.
 *  `chooseAdsSources(f)[0]` is the primary for every input EXCEPT one — a user with a
 *  Google connection whose token/dev-token is missing AND a Sklik token: the legacy
 *  {@link chooseAdsSource} answers "sample" (Google present but unusable, and Sklik
 *  refused to override it), while the set answers `["sklik"]`. Serving that user
 *  their real Sklik data instead of demo numbers is the intended correction. */
export function chooseAdsSources(f: {
  hasGoogleConnection: boolean;
  googleConfigured: boolean;
  hasGoogleToken: boolean;
  hasSklikToken: boolean;
}): AdsSourceChoice[] {
  const sources: AdsSourceChoice[] = [];
  if (f.hasGoogleConnection && f.googleConfigured && f.hasGoogleToken) sources.push("google-ads");
  if (f.hasSklikToken) sources.push("sklik");
  return sources.length > 0 ? sources : ["sample"];
}

/** The scheduled sync's user set: Google-connected users unioned with per-user
 *  Sklik-connected users, deduped and order-stable (Google ids first, then any
 *  Sklik-only ids). A Sklik-only user (invisible to the Google-only listing before)
 *  is now included exactly once; a user in both appears once. */
export function unionConnectedUserIds(googleUserIds: string[], sklikUserIds: string[]): string[] {
  return [...new Set([...googleUserIds, ...sklikUserIds])];
}
