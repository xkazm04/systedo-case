/** Scheduled social publishing: publish posts whose scheduled time has arrived,
 *  for every user with a connected account. Guarded by CRON_SECRET; schedule in
 *  vercel.json. Publishing is simulated in demo mode (see lib/social/publish). */
import { listConnectedSocialUserIds } from "@/lib/social/connection";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listProjects } from "@/lib/projects/store";
import { claimScheduledPost, listDueScheduled, updatePost } from "@/lib/social/store";
import { publishPost } from "@/lib/social/publish";
import { cronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const nowIso = new Date().toISOString();
  const userIds = await listConnectedSocialUserIds();
  let published = 0;
  let failed = 0;

  for (const userId of userIds) {
    const projects = await listProjects(userId);
    const targets = projects.length ? projects : [null];
    for (const project of targets) {
      try {
        const tenant = await resolveTenant(userId, project?.id);
        const due = await listDueScheduled(tenant, nowIso);
        for (const post of due) {
          // Claim before publishing so overlapping cron runs (or a run that started
          // while a prior one is still inside maxDuration) can't both publish the same
          // post to the live platform. Only the caller that wins scheduled→publishing
          // proceeds; the rest skip. Also closes the "publish succeeded but the status
          // write failed → next run republishes" window: a claimed post is no longer
          // `scheduled`, so it isn't re-listed.
          if (!(await claimScheduledPost(tenant, post.id))) continue;
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
        console.error(`[cron] social publish failed for ${userId}/${project?.id}:`, err);
      }
    }
  }

  return Response.json({ users: userIds.length, published, failed });
}
