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

/** The brief seed a plan slot hands to the content engine — structurally a
 *  `BriefSeed` (components/ai/KeywordResearch) plus the slot it came from, kept
 *  here so the seeding contract is pure and testable and so the calendar does not
 *  import a client component to build it.
 *
 *  It carries what the slot ALREADY decided, which is the whole point of the
 *  direction: the topic is the planned title, the primary keyword is the
 *  service × locality the idea was generated from. No keyword grounding — a plan
 *  slot has none, and inventing some would be worse than an honest empty. */
export interface PlanBriefSeed {
  topic: string;
  primaryKeyword: string;
  keywords: never[];
  planSlotId: string;
}

export function planSlotSeed(post: ContentPost): PlanBriefSeed {
  return {
    topic: post.title,
    primaryKeyword: [post.service, post.area].map((s) => s.trim()).filter(Boolean).join(" "),
    keywords: [],
    planSlotId: post.id,
  };
}

/** How far the work on a slot has actually got, as opposed to where the slot sits
 *  on the calendar. This is a REFINEMENT of the status union, not a second
 *  vocabulary: `out` is exactly the statuses the channel (or the maker) has already
 *  taken off the working board, and the other three all live inside idea/scheduled.
 *
 *    planned  — a title on a date, nothing written
 *    drafting — a generation was launched from this slot, nothing saved yet
 *    drafted  — there is copy on the slot, or a saved library entry from it
 *    out      — handed over, published, or marked done: off the working board
 *  Pure. */
export type SlotProgress = "planned" | "drafting" | "drafted" | "out";

export function slotProgress(post: ContentPost): SlotProgress {
  if (post.status === "queued" || post.status === "published" || post.status === "done") return "out";
  if (post.libraryEntryId || (post.body ?? "").trim().length >= 2) return "drafted";
  if (post.briefStartedAt) return "drafting";
  return "planned";
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
 *     to `scheduled` and is FLAGGED `channelWithdrawn` — never a stale claim, and
 *     never a silent revert either: the maker handed a post over and it is no
 *     longer there, which is news they have to be told. The dead link itself is
 *     left in place here (this function is pure and derives on every load); the
 *     board strips and persists it once through {@link clearWithdrawnLinks}, so
 *     the flag outlives the evidence instead of being re-derived forever;
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
      // Withdrawn in the social centre: the slot keeps its plan, loses the claim,
      // and SAYS SO. The link is left for clearWithdrawnLinks to strip + persist.
      return { ...p, status: "scheduled" as PostStatus, channelFailed: false, channelWithdrawn: true };
    }
    if (channel === "published")
      return { ...p, status: "published" as PostStatus, channelFailed: false, channelWithdrawn: false };
    if (channel === "failed")
      return { ...p, status: "scheduled" as PostStatus, channelFailed: true, channelWithdrawn: false };
    return { ...p, status: "queued" as PostStatus, channelFailed: false, channelWithdrawn: false };
  });
}

/** The persisted half of a withdrawal. `reconcileWithChannel` DERIVES the flag on
 *  every load but must stay pure, so the dead `channelPostId`/`channelSendAt` it
 *  flagged would otherwise sit in the stored blob until some unrelated mutation
 *  happened to rewrite it — the exact staleness the reconciliation exists to remove.
 *
 *  This is the one-shot cleanup the board writes back: strip the dead link and the
 *  send time that will never come, KEEP `channelWithdrawn` (the news) and
 *  `channelPlatform` (which channel it was). Returns `null` when there is nothing
 *  to clean — which is what makes it safe to call on every mount: after the first
 *  write the stored board has no dead links left and no further PUT is issued.
 *  Pure; never mutates. */
export function clearWithdrawnLinks(posts: ContentPost[]): ContentPost[] | null {
  if (!posts.some((p) => p.channelWithdrawn && p.channelPostId)) return null;
  return posts.map((p) => {
    if (!p.channelWithdrawn || !p.channelPostId) return p;
    const next: ContentPost = { ...p };
    delete next.channelPostId;
    delete next.channelSendAt;
    return next;
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
