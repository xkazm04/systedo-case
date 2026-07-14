/** Scheduled social publishing: publish posts whose scheduled time has arrived,
 *  for every user with a connected account. Guarded by CRON_SECRET; schedule in
 *  vercel.json. Publishing is simulated in demo mode (see lib/social/publish). */
import { getAccount, getAccountToken, listConnectedSocialUserIds } from "@/lib/social/connection";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listProjects } from "@/lib/projects/store";
import { claimScheduledPost, listDueScheduled, updatePost } from "@/lib/social/store";
import { publishPost, type PublishContext } from "@/lib/social/publish";
import { cronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron/run";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const startedAt = new Date();
  const nowIso = new Date().toISOString();
  const userIds = await listConnectedSocialUserIds();
  let published = 0;
  let failed = 0;

  for (const userId of userIds) {
    const projects = await listProjects(userId);
    const targets = projects.length ? projects : [null];
    for (const project of targets) {
      try {
        // Social posts are account-agnostic — read them under the same customerId-free
        // key the social/posts route writes them to (accountScoped:false).
        const tenant = await resolveTenant(userId, project?.id, { accountScoped: false });
        const due = await listDueScheduled(tenant, nowIso);
        for (const post of due) {
          // Per-POST try/catch: one post throwing (a claim/publish/status-write error)
          // must not abort the project's remaining due posts — each is published
          // independently, so a single bad post is isolated to itself.
          try {
            // Claim before publishing so overlapping cron runs (or a run that started
            // while a prior one is still inside maxDuration) can't both publish the same
            // post to the live platform. Only the caller that wins scheduled→publishing
            // proceeds; the rest skip. Also closes the "publish succeeded but the status
            // write failed → next run republishes" window: a claimed post is no longer
            // `scheduled`, so it isn't re-listed.
            if (!(await claimScheduledPost(tenant, post.id))) continue;
            // Resolve the account + (real-only) token so the cron flows through the SAME
            // simulated-vs-real seam as the manual publish route.
            const account = await getAccount(userId, post.platform);
            const token = account && !account.demo ? await getAccountToken(userId, post.platform) : null;
            const ctx: PublishContext = { account, token };
            const result = await publishPost(post.platform, post.content, post.id, ctx);
            if (result.ok) {
              await updatePost(tenant, post.id, {
                status: "published",
                publishedAt: new Date().toISOString(),
                externalUrl: result.externalUrl,
                simulated: result.simulated,
              });
              published++;
            } else {
              await updatePost(tenant, post.id, { status: "failed", error: result.error, simulated: result.simulated });
              failed++;
            }
          } catch (postErr) {
            console.error(`[cron] social publish failed for post ${post.id} (${userId}/${project?.id}):`, postErr);
            failed++;
          }
        }
      } catch (err) {
        console.error(`[cron] social publish failed for ${userId}/${project?.id}:`, err);
      }
    }
  }

  await recordCronRun("social", startedAt, {
    ok: failed === 0,
    counts: { users: userIds.length, published, failed },
  });

  return Response.json({ users: userIds.length, published, failed });
}
