/** Per-tenant social store (Firestore): scheduled/published posts + the comms
 *  inbox. Sample inbound messages are seeded on first read so the inbox demos
 *  without real webhooks. Server-only. */
import "server-only";
import { randomBytes } from "node:crypto";
import { firestore } from "@/lib/firebase";
import {
  SOCIAL_PLATFORMS,
  type PostStatus,
  type SocialMessage,
  type SocialPlatform,
  type SocialPost,
} from "./types";

function postsCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("social_posts");
}
function messagesCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("social_messages");
}

// --- posts ------------------------------------------------------------------

export interface CreatePostInput {
  platform: SocialPlatform;
  content: string;
  status: PostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  externalUrl?: string;
}

export async function createPost(tenant: string, input: CreatePostInput): Promise<SocialPost> {
  const id = randomBytes(10).toString("hex");
  const post: Omit<SocialPost, "id"> = {
    platform: input.platform,
    content: input.content,
    status: input.status,
    createdAt: new Date().toISOString(),
    ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    ...(input.externalUrl ? { externalUrl: input.externalUrl } : {}),
  };
  await postsCol(tenant).doc(id).set(post);
  return { id, ...post };
}

export async function listPosts(tenant: string, limit = 50): Promise<SocialPost[]> {
  const snap = await postsCol(tenant).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SocialPost, "id">) }));
}

export async function updatePost(
  tenant: string,
  id: string,
  patch: Partial<SocialPost>
): Promise<void> {
  await postsCol(tenant).doc(id).set(patch, { merge: true });
}

export async function deletePost(tenant: string, id: string): Promise<boolean> {
  const ref = postsCol(tenant).doc(id);
  if (!(await ref.get()).exists) return false;
  await ref.delete();
  return true;
}

/** Scheduled posts whose time has come (for the publish cron). */
export async function listDueScheduled(tenant: string, nowIso: string): Promise<SocialPost[]> {
  const snap = await postsCol(tenant).where("status", "==", "scheduled").get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<SocialPost, "id">) }))
    .filter((p) => (p.scheduledAt ?? "") <= nowIso);
}

// --- inbox ------------------------------------------------------------------

const SAMPLE_MESSAGES: Omit<SocialMessage, "id" | "receivedAt" | "status">[] = [
  { platform: "instagram", author: "Jana N.", kind: "comment", text: "Ahoj, kolik stojí ta směs ořechů z posledního příspěvku? 😍" },
  { platform: "facebook", author: "Petr Svoboda", kind: "comment", text: "Máte chia semínka aktuálně skladem?" },
  { platform: "instagram", author: "Markéta", kind: "dm", text: "Díky moc, kešu od vás jsou nejlepší, doporučuju všem!" },
  { platform: "linkedin", author: "Tomáš Dvořák", kind: "dm", text: "Dobrý den, řešíte i velkoobchodní spolupráci pro firemní balíčky?" },
];

async function seedSampleMessages(tenant: string): Promise<void> {
  const batch = firestore.batch();
  const now = Date.now();
  SAMPLE_MESSAGES.forEach((m, i) => {
    const id = `sample_${i}`;
    batch.set(messagesCol(tenant).doc(id), {
      ...m,
      receivedAt: new Date(now - (i + 1) * 3_600_000).toISOString(),
      status: "open",
    });
  });
  await batch.commit();
}

export async function listMessages(tenant: string): Promise<SocialMessage[]> {
  let snap = await messagesCol(tenant).get();
  if (snap.empty) {
    await seedSampleMessages(tenant);
    snap = await messagesCol(tenant).get();
  }
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<SocialMessage, "id">) }))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function markReplied(tenant: string, id: string, reply: string): Promise<boolean> {
  const ref = messagesCol(tenant).doc(id);
  if (!(await ref.get()).exists) return false;
  await ref.set({ status: "replied", reply }, { merge: true });
  return true;
}

export const SOCIAL_PLATFORM_VALUES = SOCIAL_PLATFORMS;
