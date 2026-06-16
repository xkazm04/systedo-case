/** Per-user social-account connections — which platforms the user has linked.
 *  Stored in Firestore `socialConnections/{userId}` = { accounts: SocialAccount[] }.
 *
 *  Real OAuth (Meta Graph / LinkedIn) is a seam gated behind env credentials;
 *  until those exist, `connectAccount` links a demo account so the whole compose →
 *  schedule → publish → inbox flow works. Server-only. */
import { firestore } from "@/lib/firebase";
import { SOCIAL_PLATFORM_LABELS, type SocialAccount, type SocialPlatform } from "./types";

const COLLECTION = "socialConnections";

interface Doc {
  accounts?: SocialAccount[];
}

function ref(userId: string) {
  return firestore.collection(COLLECTION).doc(userId);
}

/** Whether real publishing is configured (Meta / LinkedIn app credentials). When
 *  false the center runs in demo mode (simulated publishing). */
export function socialConfigured(): boolean {
  return Boolean(process.env.META_APP_ID || process.env.LINKEDIN_CLIENT_ID);
}

export async function listAccounts(userId: string): Promise<SocialAccount[]> {
  const doc = await ref(userId).get();
  return (doc.data() as Doc | undefined)?.accounts ?? [];
}

/** User ids with at least one connected account — the set the publish cron walks. */
export async function listConnectedSocialUserIds(): Promise<string[]> {
  const snap = await firestore.collection(COLLECTION).get();
  return snap.docs.filter((d) => ((d.data() as Doc).accounts?.length ?? 0) > 0).map((d) => d.id);
}

/** Link a platform (idempotent per platform). In demo mode this records a sample
 *  handle; with real OAuth it would store the page/profile + tokens. */
export async function connectAccount(userId: string, platform: SocialPlatform): Promise<void> {
  const accounts = (await listAccounts(userId)).filter((a) => a.platform !== platform);
  accounts.push({
    platform,
    handle: socialConfigured() ? SOCIAL_PLATFORM_LABELS[platform] : `Mionelo (${SOCIAL_PLATFORM_LABELS[platform]}, demo)`,
    connectedAt: new Date().toISOString(),
    demo: !socialConfigured(),
  });
  await ref(userId).set({ accounts }, { merge: true });
}

export async function disconnectAccount(userId: string, platform: SocialPlatform): Promise<void> {
  const accounts = (await listAccounts(userId)).filter((a) => a.platform !== platform);
  await ref(userId).set({ accounts }, { merge: true });
}

export async function getAccount(userId: string, platform: SocialPlatform): Promise<SocialAccount | null> {
  return (await listAccounts(userId)).find((a) => a.platform === platform) ?? null;
}
