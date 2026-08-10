/** Illustrative post board for a local-SEO project — a baseline content schedule:
 *  post ideas drawn from the service catalog × the project's localities, some
 *  already placed across a 4-week window. Seeded off the project id so it stays
 *  stable and varies per project. Framework-free.
 *
 *  STATUS HONESTY (the reason this union has five members instead of three): the
 *  board used to flip a slot straight to "published", which asserted that the post
 *  had gone out to Google Business Profile — while nothing ever left the app (the
 *  GBP posting API is not built and is not being built here). So the union now
 *  separates what the app KNOWS:
 *    idea      — in the queue, no date
 *    scheduled — placed on a day of the plan; still purely internal
 *    queued    — handed to a REAL connected channel as a real scheduled social post
 *                (see /api/social/posts); `channelPostId` is that post
 *    published — the channel confirmed it went out (derived from the linked post,
 *                never asserted locally)
 *    done      — the maker marked the slot finished by hand. Nothing left the app;
 *                this is a private checkmark, not a publish.
 *  Only `published` may ever read as "it went out", and only the channel can put a
 *  slot there. */
import type { Project } from "@/lib/projects/types";
import type { Locality, ServiceOffering } from "@/lib/catalog/offering";
import type { SocialPlatform } from "@/lib/social/types";
import { seed01 } from "@/lib/project-data/seed";

export type PostStatus = "idea" | "scheduled" | "queued" | "published" | "done";

/** Every status, in board order — the single source the rollup and the UI both
 *  iterate, so a new member cannot be added to one and forgotten in the other. */
export const POST_STATUSES: readonly PostStatus[] = [
  "idea",
  "scheduled",
  "queued",
  "published",
  "done",
] as const;

export interface ContentPost {
  id: string;
  title: string;
  service: string;
  area: string;
  status: PostStatus;
  /** day index 0–27 in the 4-week window (day 0 = the window start), counting
   *  forward; null while still an idea. Finished posts sit in the past half of the
   *  window, scheduled posts ahead of them — so the board reads chronologically. */
  day: number | null;
  /** AI-drafted post copy (grounded on the service via the social tool). Absent
   *  until the maker drafts it; persisted with the board so it survives a reload. */
  body?: string;
  /** id of the REAL social post this slot was handed to, on the channel pipeline
   *  (`/api/social/posts`). Set only for `queued`/`published`; it is what lets the
   *  slot's status be DERIVED from the channel instead of claimed locally. */
  channelPostId?: string;
  /** which connected platform the slot was handed to */
  channelPlatform?: SocialPlatform;
  /** ISO instant the channel was told to send it — what the maker was shown */
  channelSendAt?: string;
  /** the channel reported the send failed; the slot falls back to `scheduled` so
   *  the board never shows a failure as a publish */
  channelFailed?: boolean;
  /** The post this slot was handed to is GONE from the channel — deleted in the
   *  social centre after the handover. The slot falls back to `scheduled` like a
   *  failure does, but it is NOT a failure (nothing went wrong on the channel's
   *  side, someone withdrew it), so it carries its own flag and its own notice.
   *
   *  Derived by `reconcileWithChannel` from "linked post no longer exists", then
   *  PERSISTED by the board (see `clearWithdrawnLinks`) so the withdrawal survives
   *  the dead link being cleaned up instead of silently reverting every load. */
  channelWithdrawn?: boolean;
  /** ISO instant a generation was launched FROM this slot (the calendar seeded the
   *  content engine). Marks the slot as work-in-progress rather than untouched. */
  briefStartedAt?: string;
  /** id of the saved-library entry produced from this slot — the link back from the
   *  asset to the plan slot it came from. The asset itself lives in the project's
   *  content library (lib/content-library), which is where generated briefs and
   *  drafts already belong; the slot stores only the pointer. */
  libraryEntryId?: string;
}

/** GBP-post idea templates ({service}/{area} are filled from the catalog). */
const IDEA_TEMPLATES = [
  "Nabídka: {service} v {area}",
  "Tip: jak vybrat {service}",
  "Novinka v {area}: {service}",
  "Spokojený zákazník — {service}",
  "Akce tento týden: {service}",
  "Časté dotazy: {service}",
];

/** The window is 4 weeks × 7 days. */
export const WINDOW_DAYS = 28;

/** Local hour of day a slot handed to a channel is sent at. A content post is a
 *  morning post; the exact hour matters less than it being STATED to the maker. */
export const PLAN_SEND_HOUR = 9;

/** Minimum lead time between "hand it over" and the channel sending it. The posts
 *  API rejects a scheduled time in the past, and a slot on today's date whose 9:00
 *  has already gone would otherwise be unsendable — so it lands at the earliest
 *  honest slot instead, and the UI shows the resolved instant. */
export const MIN_SEND_LEAD_MS = 15 * 60 * 1000;

/** The instant a slot on `day` should be sent, as a canonical ISO string: that
 *  day's PLAN_SEND_HOUR local time, never sooner than now + MIN_SEND_LEAD_MS.
 *  `now` is injected so the mapping is deterministic under test. Pure. */
export function channelSendAt(day: number, now: number = Date.now()): string {
  const at = new Date(now);
  at.setHours(PLAN_SEND_HOUR, 0, 0, 0);
  at.setDate(at.getDate() + Math.max(0, day));
  return new Date(Math.max(at.getTime(), now + MIN_SEND_LEAD_MS)).toISOString();
}

/** Build the initial post board from the service catalog × localities. Some posts
 *  are still ideas (unscheduled), others are scheduled/published across the window. */
export function initialPosts(
  project: Project,
  services: ServiceOffering[],
  localities: Locality[],
  limit = 12
): ContentPost[] {
  const byId = new Map(localities.map((l) => [l.id, l]));
  const combos: { service: string; area: string; key: string }[] = [];
  for (const s of services) {
    for (const areaId of s.serviceAreas) {
      const loc = byId.get(areaId);
      if (loc) combos.push({ service: s.name, area: loc.name, key: `${s.name}:${areaId}` });
    }
  }
  return combos.slice(0, limit).map((c, i) => {
    const g = (k: string) => seed01(`${project.id}:post:${c.key}:${k}`);
    const tpl = IDEA_TEMPLATES[Math.floor(g("tpl") * IDEA_TEMPLATES.length)];
    const title = tpl.replace("{service}", c.service).replace("{area}", c.area);
    const roll = g("status");
    // The seed can never produce `published`: a fixture has not been through any
    // channel, and "published" now means a channel confirmed the send. Past slots
    // are seeded `done` — "someone marked this finished" — which is exactly what a
    // fixture can honestly claim.
    const status: PostStatus = roll > 0.6 ? "idea" : roll > 0.3 ? "scheduled" : "done";
    // Anchor day meaning: finished posts land in the first (past) half of the
    // window, scheduled posts in the second (upcoming) half — never a finished
    // item dated after a "scheduled" one, which read as a bug on the demo board.
    const half = Math.floor(WINDOW_DAYS / 2);
    const day =
      status === "idea"
        ? null
        : status === "done"
          ? Math.floor(g("day") * half)
          : half + Math.floor(g("day") * (WINDOW_DAYS - half));
    return { id: `post-${i}`, title, service: c.service, area: c.area, status, day };
  });
}
