/** The `social-readback` ledger step (WP W3-D): ask each platform what a published post
 *  ACTUALLY did, and store it as a per-(post, UTC day) snapshot. Registered in
 *  src/lib/cron/ledgers.ts — that one line in LEDGER_STEPS is the whole registration
 *  ceremony (no new route, no new `vercel.json` entry, no new guard; see WP F4).
 *
 *  WHY IT NEEDS NO SENT-GUARD CLAIM. The write is an upsert-OVERWRITE on (post, day), so
 *  running it twice in a day leaves the same three integers — idempotent by construction,
 *  the go-rollup step's reasoning. There is nothing here a double-run could double.
 *
 *  WHY IT SENDS NOTHING. This step READS. It never publishes, never replies, never marks
 *  a draft sent, and imports no send path. A read-back that could write to a platform
 *  would be an outbound job wearing an analytics name.
 *
 *  THE TWO HONESTY RULES IT ENFORCES:
 *   • A post whose insights call FAILED gets NO ROW. A failed read is not a zero — a row
 *     of zeros would enter the grounding as "this post reached nobody", which is a
 *     confident lie about a number we never learned. Failures are counted instead.
 *   • With no provider `configured()`, the step does NO WORK AT ALL and says so
 *     (`accounts: 0, posts: 0`) rather than walking every tenant to produce nothing.
 *     There is no demo/simulated read-back: a simulated publish has no `externalId`, so
 *     it is unaddressable by construction and can never acquire numbers.
 *
 *  Bounded per tick so one tenant cannot consume the whole invocation — the shared 300 s
 *  budget belongs to every step. Server-only. */
import "server-only";
import type { LedgerStep, LedgerStepResult } from "@/lib/cron/ledgers";
import { getAccountToken, listAccounts, listConnectedSocialUserIds } from "./connection";
import { listPosts } from "./store";
import { httpSocialTransport, socialProvider } from "./providers";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listProjects } from "@/lib/projects/store";
import { metricDay, metricDayBefore, SOCIAL_METRIC_RETENTION_DAYS } from "./metrics";
import { pruneSocialMetrics, upsertSocialMetricDay } from "./metrics-store";

/** The step id — also the run record's key and the namespace its counts report under. */
export const SOCIAL_READBACK_STEP_ID = "social-readback";

/** At most once every six hours. Platform insight numbers settle over hours, not
 *  minutes, and every read costs a rate-limited API call per post — four reads a day is
 *  freshness the operator can feel without spending the quota on noise. */
export const SOCIAL_READBACK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Newest published posts read back per tenant. Older posts have stopped moving; the
 *  grounding window is 90 days and the cap keeps one busy account from eating the tick. */
export const SOCIAL_READBACK_POST_SCAN = 50;

export const socialReadbackStep: LedgerStep = {
  id: SOCIAL_READBACK_STEP_ID,
  due: (now, lastRunAt) => {
    if (!lastRunAt) return true;
    const at = Date.parse(lastRunAt);
    if (!Number.isFinite(at)) return true; // an unreadable stamp must not wedge the step
    return now.getTime() - at >= SOCIAL_READBACK_INTERVAL_MS;
  },
  run: (ctx) => runSocialReadback(ctx.now),
};

/** Whether ANY provider can read insights at all in this deployment. */
function anyInsightsConfigured(): boolean {
  return (["facebook", "instagram", "linkedin", "tiktok"] as const).some((p) => {
    const provider = socialProvider(p);
    return Boolean(provider?.insights && provider.configured());
  });
}

/** One tick's work. Never throws — the ledger runner isolates a throw anyway, but a step
 *  that reports `{ ok: false, error }` gives the run record something readable instead of
 *  a stack-trace message. */
export async function runSocialReadback(now: Date): Promise<LedgerStepResult> {
  const counts = { accounts: 0, posts: 0, updated: 0, failed: 0, pruned: 0 };

  // Honest zero-work: with no credentials there is nothing to read, and walking every
  // tenant's posts to discover that would spend the budget to learn nothing.
  if (!anyInsightsConfigured()) return { ok: true, counts };

  const day = metricDay(now);
  let userIds: string[];
  try {
    userIds = await listConnectedSocialUserIds();
  } catch (err) {
    return { ok: false, counts, error: err instanceof Error ? err.message : String(err) };
  }

  for (const userId of userIds) {
    let accounts;
    let projects;
    try {
      [accounts, projects] = await Promise.all([listAccounts(userId), listProjects(userId)]);
    } catch (err) {
      counts.failed++;
      console.error(`[social] read-back could not resolve user ${userId}:`, err);
      continue;
    }
    // A DEMO connection has no platform-side object to read; skip it rather than
    // producing rows nothing on a platform corresponds to.
    const real = accounts.filter((a) => !a.demo);
    if (real.length === 0) continue;
    counts.accounts += real.length;

    const tokens = new Map<string, string | null>();
    for (const account of real) {
      try {
        tokens.set(account.platform, await getAccountToken(userId, account.platform));
      } catch {
        tokens.set(account.platform, null);
      }
    }

    for (const project of projects.length ? projects : [null]) {
      // Social posts are account-agnostic — the SAME customerId-free key the posts
      // route and the publish cron write them under.
      let tenant: string;
      let posts;
      try {
        tenant = await resolveTenant(userId, project?.id, { accountScoped: false });
        posts = await listPosts(tenant, SOCIAL_READBACK_POST_SCAN);
      } catch (err) {
        counts.failed++;
        console.error(`[social] read-back could not list posts for ${userId}/${project?.id}:`, err);
        continue;
      }

      for (const post of posts) {
        // Addressable = published, real (not simulated), and carrying the platform's
        // own id. Anything else is not a post a platform can report on.
        if (post.status !== "published" || post.simulated === true || !post.externalId) continue;
        const provider = socialProvider(post.platform);
        const token = tokens.get(post.platform) ?? null;
        if (!provider?.insights || !provider.configured() || !token) continue;
        counts.posts++;
        try {
          const insights = await provider.insights(
            { externalId: post.externalId },
            { token, transport: httpSocialTransport() }
          );
          await upsertSocialMetricDay({
            postId: post.id,
            day,
            tenant,
            reach: insights.reach,
            likes: insights.likes,
            comments: insights.comments,
          });
          counts.updated++;
        } catch (err) {
          // FAILED ≠ ZERO: no row is written, so the grounding stays silent about this
          // post rather than claiming it reached nobody. The platform id is not logged
          // with the error — it identifies a tenant's content.
          counts.failed++;
          console.error(`[social] insights read failed (${post.platform}):`, err instanceof Error ? err.message : err);
        }
      }
    }
  }

  // Retention last: a prune that ran BEFORE the read would narrow the very window the
  // grounding is about to read.
  try {
    counts.pruned = await pruneSocialMetrics(metricDayBefore(now, SOCIAL_METRIC_RETENTION_DAYS));
  } catch (err) {
    console.error("[social] read-back prune failed:", err);
  }

  return { ok: counts.failed === 0, counts };
}
