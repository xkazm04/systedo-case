/** Content-schedule rollups + calendar layout. Pure (framework-free), tested. */
import type { ContentPost, PostStatus } from "./sample";
import { POST_STATUSES, WINDOW_DAYS } from "./sample";

export type StatusCounts = Record<PostStatus, number>;

export function statusCounts(posts: ContentPost[]): StatusCounts {
  const c = Object.fromEntries(POST_STATUSES.map((s) => [s, 0])) as StatusCounts;
  for (const p of posts) if (p.status in c) c[p.status]++;
  return c;
}

/** Posts still unscheduled (the idea queue), in input order. */
export function ideas(posts: ContentPost[]): ContentPost[] {
  return posts.filter((p) => p.status === "idea");
}

/** The working list: everything the maker can still act on — ideas plus slots
 *  placed on a day but not yet handed to a channel or finished. Ordered ideas-last
 *  is deliberately NOT done: input order keeps the board stable while editing. */
export function workingList(posts: ContentPost[]): ContentPost[] {
  return posts.filter((p) => p.status === "idea" || p.status === "scheduled");
}

/** The channel's own view of a handed-over post — the subset of SocialPost the
 *  board needs. Kept structural so this module stays free of the social store. */
export interface ChannelPostState {
  id: string;
  status: string;
}

/** Derive each slot's status from the CHANNEL rather than from what the board
 *  claimed. This is the whole point of the direction: the board may promise, only
 *  the channel may confirm.
 *
 *   • a slot linked to a channel post follows that post: published → `published`,
 *     failed → back to `scheduled` + `channelFailed` (a failure is not a publish),
 *     anything in flight → `queued`;
 *   • a link whose channel post is GONE (deleted in the social centre) drops back
 *     to `scheduled` with its channel fields cleared — never a stale claim;
 *   • a slot claiming `published`/`queued` with NO link is a legacy board written
 *     by the old local-flip button. It is downgraded to `done` ("marked finished"),
 *     because nothing ever left the app for it.
 *  Pure; never mutates. */
export function reconcileWithChannel(
  posts: ContentPost[],
  channelPosts: ChannelPostState[]
): ContentPost[] {
  const byId = new Map(channelPosts.map((p) => [p.id, p.status]));
  return posts.map((p) => {
    if (!p.channelPostId) {
      return p.status === "published" || p.status === "queued"
        ? { ...p, status: "done" as PostStatus }
        : p;
    }
    const channel = byId.get(p.channelPostId);
    if (channel === undefined) {
      // Withdrawn in the social centre: the slot keeps its plan but loses the claim.
      const next: ContentPost = { ...p, status: "scheduled", channelFailed: false };
      delete next.channelPostId;
      delete next.channelPlatform;
      delete next.channelSendAt;
      return next;
    }
    if (channel === "published") return { ...p, status: "published" as PostStatus, channelFailed: false };
    if (channel === "failed") return { ...p, status: "scheduled" as PostStatus, channelFailed: true };
    return { ...p, status: "queued" as PostStatus, channelFailed: false };
  });
}

/** Lay dated posts into a 28-cell calendar (index = day). Ideas (day === null)
 *  are excluded. Cell order preserves input order. */
export function calendarGrid(posts: ContentPost[]): ContentPost[][] {
  const cells: ContentPost[][] = Array.from({ length: WINDOW_DAYS }, () => []);
  for (const p of posts) {
    if (p.day !== null && p.day >= 0 && p.day < WINDOW_DAYS) cells[p.day].push(p);
  }
  return cells;
}

/** First day (0–27) holding fewer than `capacity` posts — where the next idea
 *  drops when scheduled. Returns `null` when every day is already at capacity, so
 *  callers must handle "the window is full" instead of overbooking the last day. */
export function nextFreeDay(posts: ContentPost[], capacity = 2): number | null {
  const grid = calendarGrid(posts);
  for (let d = 0; d < WINDOW_DAYS; d++) {
    if (grid[d].length < capacity) return d;
  }
  return null;
}
