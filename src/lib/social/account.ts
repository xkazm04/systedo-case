/** Social-account domain logic — the token-crypto glue with NO firebase / I/O, so the
 *  encrypt-at-rest / strip-for-client / decrypt-for-publish trio is unit-testable
 *  offline (the connection store in connection.ts wraps these with Firestore reads).
 *  Server-only (uses token-crypto). */
import "server-only";
import { decryptToken, encryptToken } from "@/lib/inventory/token-crypto";
import { SOCIAL_PLATFORM_LABELS, type SocialAccount, type SocialPlatform } from "./types";

/** The STORED shape — a public {@link SocialAccount} plus the encrypted OAuth token
 *  blob. `tokenEnc` never leaves the server (stripped by {@link stripToken}). */
export interface StoredSocialAccount extends SocialAccount {
  /** AES-GCM token blob from token-crypto (present only on a real connection). */
  tokenEnc?: string;
}

/** The public projection of a stored account: everything EXCEPT the token blob. */
export function stripToken(a: StoredSocialAccount): SocialAccount {
  return {
    platform: a.platform,
    handle: a.handle,
    connectedAt: a.connectedAt,
    demo: a.demo,
  };
}

/** Decrypt a stored account's token, or null when it carries none (a demo connection)
 *  or the blob fails to open. */
export function readAccountToken(a: StoredSocialAccount | null | undefined): string | null {
  if (!a?.tokenEnc) return null;
  return decryptToken(a.tokenEnc);
}

/** The demo-connection handle. Carries the TENANT'S OWN brand label when the caller
 *  supplies one (the project's brand/name), and stays brand-NEUTRAL otherwise — a
 *  minted account must never claim to be a placeholder company ("Mionelo" was
 *  hardcoded here for every tenant). Exported for the connect caller + tests. */
export function demoAccountHandle(platform: SocialPlatform, brandLabel?: string): string {
  const label = SOCIAL_PLATFORM_LABELS[platform];
  const brand = brandLabel?.trim();
  return brand ? `${brand} (${label}, demo)` : `${label} (demo)`;
}

/** Build a stored account for a (re)connect. A connection is REAL only when real
 *  publishing is configured AND a token is supplied AND crypto can encrypt it — else it
 *  stays a demo connection (no token, demo handle, demo:true). `realConfigured` is
 *  injected so this stays pure/testable; callers pass `socialConfigured() &&
 *  hasTokenCrypto()`. `brandLabel` (the tenant's own brand / project name) labels the
 *  demo handle; absent, the handle stays brand-neutral. */
export function buildSocialAccount(
  platform: SocialPlatform,
  opts: { token?: string; realConfigured?: boolean; now?: string; brandLabel?: string } = {}
): StoredSocialAccount {
  const token = opts.token?.trim();
  const real = Boolean(opts.realConfigured && token);
  return {
    platform,
    handle: real ? SOCIAL_PLATFORM_LABELS[platform] : demoAccountHandle(platform, opts.brandLabel),
    connectedAt: opts.now ?? new Date().toISOString(),
    demo: !real,
    ...(real && token ? { tokenEnc: encryptToken(token) } : {}),
  };
}
