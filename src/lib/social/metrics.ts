/** SOCIAL READ-BACK — the pure model (WP W3-D).
 *
 *  The row shape, the retention window, the day keys, and the ONE grounding line that
 *  quotes real engagement back into the social drafting prompt. Framework-free (no I/O,
 *  no firebase, no server-only) so every number and every byte of the sentence carries a
 *  fixture; the store lives in ./metrics-store, the cron work in ./readback-step.
 *
 *  THE SNAPSHOT RULE. A metric row is a SNAPSHOT of a post's lifetime counters as of a
 *  UTC day, not an increment — the same reasoning that makes go-rollup recompute rather
 *  than accumulate (organic-channels/rollup-step.ts:12-17). A platform reports "this
 *  post has 1 240 impressions", and reading it twice on the same day must leave 1 240,
 *  not 2 480. That is why the store upserts by OVERWRITE on (post, day), and why the
 *  reader below takes each post's NEWEST day rather than summing its days.
 *
 *  THE HONESTY RULE. `socialPerformanceLines` returns "" when there are no rows. Absence
 *  of data is not zero performance, and a prompt that says "your best post reached 0
 *  people" would be the model confidently inventing a failure that never happened. The
 *  read-back step upholds the other half: a post whose insights call FAILED gets no row
 *  at all, so a failed read can never be quoted as a zero. */
import { SOCIAL_PLATFORM_LABELS, type SocialPost } from "./types";
import type { SupportedLocale } from "@/lib/format";

/** One (post, UTC day) counter snapshot. `tenant` rides ON the row so the delete
 *  cascade can scrub a project's rows without joining back to the posts store — the
 *  microsite/`clearMicrositeForTenant` shape. */
export interface SocialMetricDay {
  postId: string;
  /** `YYYY-MM-DD`, UTC. ISO day keys sort lexicographically, which is what lets the
   *  prune be a range delete and the "newest day" pick be a string compare. */
  day: string;
  tenant: string;
  reach: number;
  likes: number;
  comments: number;
}

/** How long read-back rows are kept. Six months is long enough for a season-over-season
 *  read and short enough that the table stays small on a busy account. */
export const SOCIAL_METRIC_RETENTION_DAYS = 180;

/** How far back the grounding looks. A caption that worked eight months ago is not
 *  evidence about what works now. */
export const SOCIAL_PERFORMANCE_WINDOW_DAYS = 90;

/** How many posts the grounding line quotes. */
export const SOCIAL_PERFORMANCE_TOP_N = 3;

/** Longest caption fragment quoted per post. */
const SNIPPET_MAX = 60;

/** The UTC day key for an instant. */
export function metricDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The day key `days` before `at` — the inclusive lower bound of a read window and the
 *  exclusive upper bound of a prune. */
export function metricDayBefore(at: Date, days: number): string {
  return metricDay(new Date(at.getTime() - days * 86_400_000));
}

/** Each post's CURRENT counters: the newest day's snapshot per post. Rows for posts the
 *  caller did not ask about are ignored, so a caller may hand in a whole page of rows. */
export function latestMetricByPost(rows: readonly SocialMetricDay[]): Map<string, SocialMetricDay> {
  const out = new Map<string, SocialMetricDay>();
  for (const r of rows) {
    const prev = out.get(r.postId);
    if (!prev || r.day > prev.day) out.set(r.postId, r);
  }
  return out;
}

const LINES = {
  cs: {
    lead: "Nejlepší nedávné posty (reálná čísla)",
    reach: "dosah",
    likes: "reakce",
    comments: "komentáře",
    // Czech typography opens a quote low („) and closes it high (") — the same pair
    // the prompt builders already use (ai/tools/social.ts).
    open: "„",
    close: "“",
  },
  en: {
    lead: "Best recent posts (real numbers)",
    reach: "reach",
    likes: "likes",
    comments: "comments",
    open: "“",
    close: "”",
  },
} as const;

/** A one-line caption fragment: whitespace collapsed, clamped, ellipsised. */
function snippet(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX).trimEnd()}…` : flat;
}

/** The grounding sentence: the top posts by REAL reach, with their real likes and
 *  comments and enough of the caption to recognise them.
 *
 *  Reach is the ranking key because it is the one number every platform reports for a
 *  post and the one an operator can act on ("this angle travelled"); likes and comments
 *  ride along as the engagement quality behind it.
 *
 *  Returns "" — never a placeholder sentence — when no post in `posts` has a metric row.
 *  Callers concatenate it into a grounding string, so "" simply disappears. */
export function socialPerformanceLines(
  posts: readonly SocialPost[],
  rows: readonly SocialMetricDay[],
  locale: SupportedLocale
): string {
  const latest = latestMetricByPost(rows);
  const scored = posts
    .map((p) => ({ post: p, m: latest.get(p.id) }))
    .filter((x): x is { post: SocialPost; m: SocialMetricDay } => x.m !== undefined)
    .sort((a, b) => b.m.reach - a.m.reach || a.post.id.localeCompare(b.post.id))
    .slice(0, SOCIAL_PERFORMANCE_TOP_N);
  if (scored.length === 0) return "";

  const t = locale === "en" ? LINES.en : LINES.cs;
  const items = scored.map(
    ({ post, m }) =>
      `${SOCIAL_PLATFORM_LABELS[post.platform]} ${t.open}${snippet(post.content)}${t.close} — ${t.reach} ${m.reach}, ${t.likes} ${m.likes}, ${t.comments} ${m.comments}`
  );
  return `${t.lead}: ${items.join("; ")}.`;
}
