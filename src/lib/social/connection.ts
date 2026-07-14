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

/** Whether real publishing is configured (Meta / LinkedIn app credentials). When
 *  false the center runs in demo mode (simulated publishing). */
export function socialConfigured(): boolean {
  return Boolean(process.env.META_APP_ID || process.env.LINKEDIN_CLIENT_ID);
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
  const accounts = (await listStored(userId)).filter((a) => a.platform !== platform);
  accounts.push(
    buildSocialAccount(platform, {
      token: opts.token,
      realConfigured: socialConfigured() && hasTokenCrypto(),
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
