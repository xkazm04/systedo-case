/** Social posts: list, create (schedule for later or publish now), delete.
 *  Per-tenant; anonymous visitors use the shared sample tenant so the flow demos
 *  without sign-in. Publishing is simulated in demo mode (see lib/social/publish). */
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/campaigns/connector";
import { createPost, deletePost, listPosts, updatePost } from "@/lib/social/store";
import { publishPost } from "@/lib/social/publish";
import { PLATFORM_LIMITS, isSocialPlatform } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

async function tenantOf(projectId?: string | null): Promise<string> {
  const uid = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
  return resolveTenant(uid, projectId);
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
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

  const tenant = await tenantOf(str(body.projectId) || null);
  const scheduledAt = str(body.scheduledAt);
  const future = scheduledAt && new Date(scheduledAt).getTime() > Date.now();

  // Schedule for later → the cron publishes it when due.
  if (future) {
    const post = await createPost(tenant, { platform, content, status: "scheduled", scheduledAt });
    return Response.json({ post });
  }

  // Publish now (simulated in demo mode).
  const post = await createPost(tenant, { platform, content, status: "draft" });
  const result = await publishPost(platform, content, post.id);
  const patch = result.ok
    ? { status: "published" as const, publishedAt: new Date().toISOString(), externalUrl: result.externalUrl }
    : { status: "failed" as const, error: result.error ?? "Publikování se nezdařilo." };
  await updatePost(tenant, post.id, patch);
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
  const ok = await deletePost(await tenantOf(projectId), id);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
