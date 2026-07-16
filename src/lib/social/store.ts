/** Per-tenant social store: scheduled/published posts + the comms inbox. Sample
 *  inbound messages are seeded on first read so the inbox demos without real
 *  webhooks. Server-only.
 *
 *  Offline parity — verdict: REAL user state (authored posts/drafts + the inbox and
 *  its reply status), so it carries a sqlite twin. Raw document access dispatches
 *  through the generic tenant-docs backend (Firestore vs node:sqlite `tenant_docs`,
 *  migration v17), so the whole social surface works offline under LOCAL_DB with a
 *  byte-identical Firestore path — including the atomic scheduled→publishing claim
 *  (compareAndSet → a Firestore transaction) and the inbox seed (batchSet → a
 *  Firestore batch). Domain logic (id minting, the sample messages, due filtering,
 *  receivedAt sort) stays here; only the document access is dispatched. */
import "server-only";
import { randomBytes } from "node:crypto";
import { tenantDocs } from "@/lib/tenant-docs/backend";
import {
  isStalePublishClaim,
  type PostStatus,
  type SocialMessage,
  type SocialPlatform,
  type SocialPost,
} from "./types";

const POSTS = "social_posts";
const MESSAGES = "social_messages";

// --- posts ------------------------------------------------------------------

export interface CreatePostInput {
  platform: SocialPlatform;
  content: string;
  status: PostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  externalUrl?: string;
  simulated?: boolean;
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
    ...(input.simulated !== undefined ? { simulated: input.simulated } : {}),
  };
  await (await tenantDocs()).setDoc(tenant, POSTS, id, post);
  return { id, ...post };
}

export async function listPosts(tenant: string, limit = 50): Promise<SocialPost[]> {
  const rows = await (await tenantDocs()).listDocs(tenant, POSTS, {
    orderBy: { field: "createdAt", dir: "desc" },
    limit,
  });
  return rows.map((r) => ({ id: r.id, ...(r.data as Omit<SocialPost, "id">) }));
}

export async function updatePost(
  tenant: string,
  id: string,
  patch: Partial<SocialPost>
): Promise<void> {
  await (await tenantDocs()).setDoc(tenant, POSTS, id, patch, { merge: true });
}

export async function deletePost(tenant: string, id: string): Promise<boolean> {
  const store = await tenantDocs();
  if (!(await store.getDoc(tenant, POSTS, id))) return false;
  await store.deleteDoc(tenant, POSTS, id);
  return true;
}

/** Scheduled posts whose time has come (for the publish cron). Requires an actual
 *  scheduledAt in the past — a "scheduled" post with no scheduledAt is malformed and
 *  must NOT be treated as due-now (the old `?? "" <= nowIso` published it immediately). */
export async function listDueScheduled(tenant: string, nowIso: string): Promise<SocialPost[]> {
  const rows = await (await tenantDocs()).queryEq(tenant, POSTS, "status", "scheduled");
  return rows
    .map((r) => ({ id: r.id, ...(r.data as Omit<SocialPost, "id">) }))
    .filter((p) => p.scheduledAt != null && p.scheduledAt <= nowIso);
}

/** Atomically claim a due post for publishing: flip scheduled→publishing only if it
 *  is still `scheduled`. Returns true for the caller that wins the claim, false if the
 *  post was already claimed/published (an overlapping cron run) or vanished — so the
 *  provider is called at most once per post even across concurrent runs. The claim is
 *  stamped with `claimedAt` so a crash before the status settles leaves a DATED lease
 *  that {@link reclaimStalePublishing} can recover, not a forever-stuck "publishing". */
export async function claimScheduledPost(tenant: string, id: string): Promise<boolean> {
  try {
    return await (await tenantDocs()).compareAndSet(
      tenant,
      POSTS,
      id,
      { field: "status", equals: "scheduled" },
      { status: "publishing" satisfies PostStatus, claimedAt: new Date().toISOString() }
    );
  } catch (err) {
    console.error(`[social] claim failed for ${id}:`, err);
    return false;
  }
}

/** Settle posts stranded in the transient "publishing" claim past the lease TTL
 *  (the claimer crashed/timed out before the status settled) to a terminal
 *  "failed" the user can see and act on. They are NOT returned to "scheduled":
 *  the crash may have happened AFTER the provider published but before the status
 *  write, and re-scheduling would double-post to the live platform — "failed"
 *  with an explanatory error is the honest, safe terminal. Guarded per post by
 *  compareAndSet on status, so a live run that settles concurrently wins.
 *  Best-effort (returns how many it settled); called by the publish cron before
 *  listing due posts. */
export async function reclaimStalePublishing(tenant: string, now = Date.now()): Promise<number> {
  const store = await tenantDocs();
  const rows = await store.queryEq(tenant, POSTS, "status", "publishing");
  let settled = 0;
  for (const r of rows) {
    const claimedAt = (r.data as Partial<SocialPost>).claimedAt;
    if (!isStalePublishClaim(claimedAt, now)) continue;
    try {
      const won = await store.compareAndSet(
        tenant,
        POSTS,
        r.id,
        { field: "status", equals: "publishing" },
        {
          status: "failed" satisfies PostStatus,
          error: "Zveřejnění se nedokončilo (běh byl přerušen). Naplánujte příspěvek znovu.",
        }
      );
      if (won) settled++;
    } catch (err) {
      console.error(`[social] stale-claim reclaim failed for ${r.id}:`, err);
    }
  }
  return settled;
}

// --- inbox ------------------------------------------------------------------

const SAMPLE_MESSAGES: Omit<SocialMessage, "id" | "receivedAt" | "status">[] = [
  { platform: "instagram", author: "Jana N.", kind: "comment", text: "Ahoj, kolik stojí ta směs ořechů z posledního příspěvku? 😍" },
  { platform: "facebook", author: "Petr Svoboda", kind: "comment", text: "Máte chia semínka aktuálně skladem?" },
  { platform: "instagram", author: "Markéta", kind: "dm", text: "Díky moc, kešu od vás jsou nejlepší, doporučuju všem!" },
  { platform: "linkedin", author: "Tomáš Dvořák", kind: "dm", text: "Dobrý den, řešíte i velkoobchodní spolupráci pro firemní balíčky?" },
];

async function seedSampleMessages(tenant: string): Promise<void> {
  const now = Date.now();
  const docs = SAMPLE_MESSAGES.map((m, i) => ({
    id: `sample_${i}`,
    data: {
      ...m,
      receivedAt: new Date(now - (i + 1) * 3_600_000).toISOString(),
      status: "open" as const,
    },
  }));
  await (await tenantDocs()).batchSet(tenant, MESSAGES, docs);
}

export async function listMessages(tenant: string): Promise<SocialMessage[]> {
  const store = await tenantDocs();
  let rows = await store.listDocs(tenant, MESSAGES);
  if (rows.length === 0) {
    await seedSampleMessages(tenant);
    rows = await store.listDocs(tenant, MESSAGES);
  }
  return rows
    .map((r) => ({ id: r.id, ...(r.data as Omit<SocialMessage, "id">) }))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function markReplied(tenant: string, id: string, reply: string): Promise<boolean> {
  const store = await tenantDocs();
  if (!(await store.getDoc(tenant, MESSAGES, id))) return false;
  await store.setDoc(tenant, MESSAGES, id, { status: "replied", reply }, { merge: true });
  return true;
}
