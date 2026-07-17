/** Per-user social-account connections — which platforms the user has linked.
 *  Stored in Firestore `socialConnections/{userId}` = { accounts: StoredSocialAccount[] }.
 *
 *  Real OAuth (Meta Graph / LinkedIn) is a seam gated behind env credentials; until
 *  those exist, `connectAccount` links a DEMO account so the whole compose → schedule →
 *  publish → inbox flow works. When a token IS supplied (and crypto + app credentials
 *  are configured), the connection becomes REAL: the OAuth token is encrypted at rest
 *  (reusing the warehouse token-crypto, v2 per-token salts) and NEVER returned to the
 *  client — listAccounts strips it, publish.ts reads it through getAccountToken only.
 *  A demo connection stays a demo connection. Server-only. */
import "server-only";
import { firestore } from "@/lib/firebase";
import { hasTokenCrypto } from "@/lib/inventory/token-crypto";
import { socialProvider } from "./providers";
import type { SocialAccount, SocialPlatform } from "./types";
import {
  buildSocialAccount,
  readAccountToken,
  stripToken,
  type StoredSocialAccount,
} from "./account";

// The account-crypto glue (pure, firebase-free) lives in ./account so it is unit-testable
// offline; re-exported here so existing importers keep their single import site.
export { buildSocialAccount, readAccountToken, stripToken };
export type { StoredSocialAccount };

const COLLECTION = "socialConnections";

interface Doc {
  accounts?: StoredSocialAccount[];
}

function ref(userId: string) {
  return firestore.collection(COLLECTION).doc(userId);
}

/** Whether real publishing is configured for ANY platform (Meta / LinkedIn app
 *  credentials) — a coarse banner hint for the UI. NOT the per-account real-vs-demo
 *  decision: that must be per-platform (see {@link providerConfigured}), because an
 *  OR across all platforms would mark, say, a LinkedIn connection "real" when only
 *  Meta credentials exist. */
export function socialConfigured(): boolean {
  return Boolean(process.env.META_APP_ID || process.env.LINKEDIN_CLIENT_ID);
}

/** Whether the real adapter for THIS platform is configured — mirrors publish.ts's
 *  `socialProvider(platform)?.configured()`, so connecting a platform is judged real
 *  only when its OWN credentials are present. */
export function providerConfigured(platform: SocialPlatform): boolean {
  return Boolean(socialProvider(platform)?.configured());
}

// ── store ─────────────────────────────────────────────────────────────────────

/** Raw stored accounts (WITH token blobs) — server-only; never serialise directly. */
async function listStored(userId: string): Promise<StoredSocialAccount[]> {
  const doc = await ref(userId).get();
  return (doc.data() as Doc | undefined)?.accounts ?? [];
}

/** Public accounts (token stripped) — safe to return to the client. */
export async function listAccounts(userId: string): Promise<SocialAccount[]> {
  return (await listStored(userId)).map(stripToken);
}

/** User ids with at least one connected account — the set the publish cron walks. */
export async function listConnectedSocialUserIds(): Promise<string[]> {
  const snap = await firestore.collection(COLLECTION).get();
  return snap.docs.filter((d) => ((d.data() as Doc).accounts?.length ?? 0) > 0).map((d) => d.id);
}

/** Link a platform (idempotent per platform). With no token → a demo connection (records
 *  a sample handle). With a token + configured credentials → a real connection whose
 *  token is encrypted at rest. */
export async function connectAccount(
  userId: string,
  platform: SocialPlatform,
  opts: { token?: string } = {}
): Promise<void> {
  const stored = await listStored(userId);
  const existing = stored.find((a) => a.platform === platform);
  // A token-less reconnect over an existing REAL connection would silently drop the
  // stored token and downgrade it to demo. Treat it as a no-op — a real connection is
  // only removed by an explicit disconnect, never quietly discarded.
  if (!opts.token?.trim() && existing && !existing.demo) return;
  const accounts = stored.filter((a) => a.platform !== platform);
  accounts.push(
    buildSocialAccount(platform, {
      token: opts.token,
      // Per-platform (not the global socialConfigured()): only THIS platform's
      // credentials make its connection real.
      realConfigured: providerConfigured(platform) && hasTokenCrypto(),
    })
  );
  await ref(userId).set({ accounts }, { merge: true });
}

export async function disconnectAccount(userId: string, platform: SocialPlatform): Promise<void> {
  const accounts = (await listStored(userId)).filter((a) => a.platform !== platform);
  await ref(userId).set({ accounts }, { merge: true });
}

/** Public account for a platform (token stripped) — used for the demo-vs-real check. */
export async function getAccount(userId: string, platform: SocialPlatform): Promise<SocialAccount | null> {
  return (await listAccounts(userId)).find((a) => a.platform === platform) ?? null;
}

/** The decrypted OAuth token for a connected account, or null (demo / none / undecryptable).
 *  Server-only — the token is never returned to a client. */
export async function getAccountToken(userId: string, platform: SocialPlatform): Promise<string | null> {
  const a = (await listStored(userId)).find((x) => x.platform === platform);
  return readAccountToken(a);
}
