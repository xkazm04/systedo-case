/** Scheduled social publishing: publish posts whose scheduled time has arrived,
 *  for every user with a connected account. Guarded by CRON_SECRET; schedule in
 *  vercel.json. Publishing is simulated in demo mode (see lib/social/publish). */
import { listConnectedSocialUserIds } from "@/lib/social/connection";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listDueScheduled, updatePost } from "@/lib/social/store";
import { publishPost } from "@/lib/social/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const nowIso = new Date().toISOString();
  const userIds = await listConnectedSocialUserIds();
  let published = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const tenant = await resolveTenant(userId);
      const due = await listDueScheduled(tenant, nowIso);
      for (const post of due) {
        const result = await publishPost(post.platform, post.content, post.id);
        if (result.ok) {
          await updatePost(tenant, post.id, {
            status: "published",
            publishedAt: new Date().toISOString(),
            externalUrl: result.externalUrl,
          });
          published++;
        } else {
          await updatePost(tenant, post.id, { status: "failed", error: result.error });
          failed++;
        }
      }
    } catch (err) {
      console.error(`[cron] social publish failed for ${userId}:`, err);
    }
  }

  return Response.json({ users: userIds.length, published, failed });
}
