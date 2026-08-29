/** "What actually worked" — the ONE server-side resolver that turns a project's stored
 *  read-back rows into the grounding sentence the social drafting prompt quotes (WP W3-D).
 *
 *  It exists so the join lives on THIS side of the seam: `src/app/api/ai/grounding.ts`
 *  gets one import and one array element, not a tenant resolution, a posts page, a metric
 *  window and an error posture inlined into a function that already does three other
 *  things.
 *
 *  HONEST BY DEFAULT, in both directions:
 *   • No rows → `""`. The caller `.filter(Boolean)`s the pieces, so the line simply is
 *     not there. A prompt that said "your best post reached 0 people" would be a
 *     confident claim about a number nobody ever measured.
 *   • A FAILED read → `""` as well, never a zeroed line. If the store is unreachable we
 *     know less than we did a moment ago, and the correct expression of knowing less is
 *     silence — the same rule the read-back step follows when a post's insights call
 *     throws (it writes no row rather than a row of zeros).
 *
 *  Server-only. */
import "server-only";
import { resolveTenant } from "@/lib/campaigns/connector";
import type { SupportedLocale } from "@/lib/format";
import { listPosts } from "./store";
import { listPostMetricDays } from "./metrics-store";
import { SOCIAL_PERFORMANCE_WINDOW_DAYS, metricDayBefore, socialPerformanceLines } from "./metrics";

/** Newest posts considered. The read-back step reads back at most this many per tenant,
 *  so asking for more could only add posts that provably have no rows. */
const POST_SCAN = 50;

/** The performance grounding line for a project, or "" when there is nothing REAL to
 *  say. `userId` null (an anonymous visitor on a demo project) resolves to the shared
 *  `sample` tenant, which holds no read-back rows — so a demo user gets "", never
 *  somebody else's numbers. */
export async function socialPerformanceGrounding(
  userId: string | null,
  projectId: string | undefined,
  locale: SupportedLocale,
  now: Date = new Date()
): Promise<string> {
  if (!userId) return "";
  try {
    // Social posts are account-agnostic — the SAME customerId-free key the posts route,
    // the publish cron and the read-back step all write under.
    const tenant = await resolveTenant(userId, projectId, { accountScoped: false });
    const posts = await listPosts(tenant, POST_SCAN);
    const measurable = posts.filter((p) => p.status === "published");
    if (measurable.length === 0) return "";
    const rows = await listPostMetricDays(
      measurable.map((p) => p.id),
      metricDayBefore(now, SOCIAL_PERFORMANCE_WINDOW_DAYS)
    );
    return socialPerformanceLines(measurable, rows, locale);
  } catch (err) {
    console.error("[social] performance grounding unavailable:", err instanceof Error ? err.message : err);
    return "";
  }
}
