/** Social posts: list, create (schedule for later or publish now), delete.
 *  Per-tenant; anonymous visitors use the shared sample tenant so the flow demos
 *  without sign-in. Publishing is simulated in demo mode (see lib/social/publish). */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import { rejectUnknownProject } from "@/lib/projects/api-guard";
import { recordActivity } from "@/lib/campaigns/activity";
import { createPost, deletePost, listPosts, updatePost } from "@/lib/social/store";
import { publishPost, type PublishContext } from "@/lib/social/publish";
import { getAccount, getAccountToken } from "@/lib/social/connection";
import { PLATFORM_LIMITS, isSocialPlatform, type SocialPlatform } from "@/lib/social/types";


const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Tolerance for a scheduled time landing in the past (clock skew / submit latency).
 *  Beyond it, a "scheduled" post is treated as a mistake and rejected rather than
 *  published immediately. */
const PAST_SCHEDULE_SKEW_MS = 2 * 60 * 1000;

async function tenantOf(projectId?: string | null): Promise<string> {
  const uid = await currentUserId();
  // Social content is account-agnostic — key it without the Ads customerId so a
  // later account connect/switch can't orphan a user's scheduled posts + inbox.
  return resolveTenant(uid, projectId, { accountScoped: false });
}

/** Resolve the publish context for the signed-in user + platform: the connected account
 *  and — only for a real (non-demo) connection — its decrypted token, so publishPost can
 *  choose the real adapter over an honest simulation. */
async function publishContextFor(platform: SocialPlatform): Promise<PublishContext> {
  const uid = await currentUserId();
  if (!uid) return {};
  const account = await getAccount(uid, platform);
  const token = account && !account.demo ? await getAccountToken(uid, platform) : null;
  return { account, token };
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  const unknown = await rejectUnknownProject(await currentUserId(), projectId);
  if (unknown) return unknown;
  return Response.json({ posts: await listPosts(await tenantOf(projectId)) });
}

export async function POST(request: Request) {
  let body: { platform?: unknown; content?: unknown; scheduledAt?: unknown; projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const platform = body.platform;
  if (!isSocialPlatform(platform)) return Response.json({ error: "Neplatná platforma." }, { status: 422 });
  const content = str(body.content);
  if (content.length < 2) return Response.json({ error: "Příspěvek je prázdný." }, { status: 422 });
  if (content.length > PLATFORM_LIMITS[platform]) {
    return Response.json(
      { error: `Příspěvek překračuje limit ${PLATFORM_LIMITS[platform]} znaků.` },
      { status: 422 }
    );
  }

  const projectId = str(body.projectId) || null;
  const unknown = await rejectUnknownProject(await currentUserId(), projectId);
  if (unknown) return unknown;
  const tenant = await tenantOf(projectId);
  const rawScheduledAt = str(body.scheduledAt);
  // Parse to an instant and store the CANONICAL UTC ISO, so the cron's UTC "due"
  // comparison is always against a UTC value. Reject a non-empty but unparseable
  // value instead of silently falling through to publish-now (NaN > now is false).
  const scheduledMs = rawScheduledAt ? Date.parse(rawScheduledAt) : NaN;
  if (rawScheduledAt && Number.isNaN(scheduledMs)) {
    return Response.json({ error: "Neplatné datum plánování." }, { status: 422 });
  }
  const scheduledAt = Number.isNaN(scheduledMs) ? "" : new Date(scheduledMs).toISOString();
  // "Schedule for a past time" and "publish now" are different user intents. A supplied
  // timestamp more than a small skew window in the past (a year typo, a stale form value,
  // a timezone misread) must NOT silently fall through to the publish-now branch and go
  // out live on a connected account — the most irreversible action here. Reject it; only
  // an OMITTED scheduledAt means publish now.
  if (scheduledAt !== "" && scheduledMs < Date.now() - PAST_SCHEDULE_SKEW_MS) {
    return Response.json({ error: "Naplánovaný čas je v minulosti." }, { status: 422 });
  }
  const future = scheduledAt !== "" && scheduledMs > Date.now();

  // Schedule for later → the cron publishes it when due.
  if (future) {
    const post = await createPost(tenant, { platform, content, status: "scheduled", scheduledAt });
    await recordActivity(tenant, {
      kind: "update", module: "socialni", severity: "info",
      title: "Příspěvek naplánován", detail: platform, actor: "Vy",
    });
    return Response.json({ post });
  }

  // Publish now — real when a provider is configured + the account is connected with a
  // token, an honest simulation otherwise (marked simulated on the record).
  const post = await createPost(tenant, { platform, content, status: "draft" });
  const result = await publishPost(platform, content, post.id, await publishContextFor(platform));
  const patch = result.ok
    ? { status: "published" as const, publishedAt: new Date().toISOString(), externalUrl: result.externalUrl, simulated: result.simulated }
    : { status: "failed" as const, error: result.error ?? "Publikování se nezdařilo.", simulated: result.simulated };
  await updatePost(tenant, post.id, patch);
  await recordActivity(tenant, {
    kind: "update", module: "socialni", severity: result.ok ? "success" : "warning",
    title: result.ok ? "Příspěvek publikován" : "Publikování příspěvku selhalo",
    detail: platform, actor: "Vy",
  });
  return Response.json({ post: { ...post, ...patch } });
}

export async function DELETE(request: Request) {
  let id = "";
  let projectId: string | null = null;
  try {
    const body = (await request.json()) as { id?: unknown; projectId?: unknown };
    id = str(body.id);
    projectId = str(body.projectId) || null;
  } catch {
    /* fall through */
  }
  if (!id) return Response.json({ error: "Chybí ID." }, { status: 422 });
  const unknown = await rejectUnknownProject(await currentUserId(), projectId);
  if (unknown) return unknown;
  const ok = await deletePost(await tenantOf(projectId), id);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
