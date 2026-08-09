/** "Scheduled means it will publish" — the pure rule behind the disconnected-
 *  schedule warning. The cron publishes only for users with at least one connected
 *  account (connection.listConnectedSocialUserIds); a user who schedules posts but
 *  never connected one has posts sitting `scheduled` forever, and nothing said so.
 *
 *  Pure and framework-free: the components feed it the shared accounts store's
 *  state (useSocialAccounts) + their post list, so both surfaces (WeekPlanner,
 *  PostsList) cannot disagree about when to warn. Unit-tested offline. */
import type { SocialPost } from "./types";

/** Whether the signed-in user's scheduling is a dead letter: account state is
 *  KNOWN (never warn off a fetch that hasn't answered — a flash of a false alarm
 *  is worse than a late one) and no account is connected. Callers gate on their
 *  own auth state: an anonymous visitor is in the demo sandbox, where the
 *  AccountsBar's sign-in card already owns the honest framing. */
export function scheduleWillNotPublish(opts: {
  /** the shared accounts store answered (status === "ready") */
  accountsReady: boolean;
  accountCount: number;
}): boolean {
  return opts.accountsReady && opts.accountCount === 0;
}

/** Any post currently waiting on the cron — the state the warning is about. */
export function hasScheduledPosts(posts: readonly Pick<SocialPost, "status">[]): boolean {
  return posts.some((p) => p.status === "scheduled");
}
