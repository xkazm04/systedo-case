/** The one publishing calendar: a RESOLVER over the four schedulers, not a fifth
 *  store. Server-only.
 *
 *  Every read below goes through the dispatcher that domain already owns, with the
 *  key it already uses (ADR-0001/0002): social by tenant, the content-plan board
 *  and the distribution variants by (uid, projectId) through project_state, the
 *  twin outbox and the kanály tracks by projectId. Nothing new is persisted, so
 *  this file can be deleted without a migration.
 *
 *  EVERY SOURCE FAILS INDEPENDENTLY AND SAYS SO. One store hiccup must not blank
 *  the whole week — a calendar that silently drops the twin outbox is worse than
 *  no calendar, because the operator reads the gap as "nothing planned" and posts
 *  over it. So each read is caught on its own and reported in `sources`; the UI
 *  renders the failure instead of an empty column.
 *
 *  Deduped per request with React `cache()` on (uid, projectId), so the page, the
 *  calendar route and the social write chokepoint can all ask for it in one pass
 *  without four extra store round-trips. The from/to window is applied OUTSIDE the
 *  cached read (an options object would key by identity and defeat it). */
import "server-only";
import { cache } from "react";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listPosts } from "@/lib/social/store";
import { getProjectState } from "@/lib/project-state/store";
import { getTwin } from "@/lib/twin/store";
import { getVariants } from "@/lib/distribution/variants-store";
import { getOrganicChannels } from "@/lib/organic-channels/store";
import { sanitizeChannelState } from "@/lib/organic-channels/types";
import { channelSendAt, type ContentPost } from "@/lib/content-schedule/sample";
import { cadenceRules } from "./cadence";
import {
  channelKeyFromContentChannel,
  channelKeyFromPlatform,
  channelKeyFromRepurpose,
  type ChannelKey,
} from "./channel-key";
import type {
  CadenceRule,
  PublishingCalendar,
  PublishingItem,
  PublishingSource,
  PublishingStatus,
  SourceHealth,
} from "./types";

/** How many social posts the calendar reads. The social store's own default is 50
 *  (one screen of PostsList); a calendar spanning weeks needs the tail too, and the
 *  posts collection is per-tenant and small. */
const SOCIAL_LIMIT = 200;

/** Titles are chips in a day cell — the full caption belongs to the module. */
const TITLE_MAX = 120;

const title = (s: string, fallback: string): string => {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, TITLE_MAX) : fallback;
};

/** Run one source's read, returning its items and its honest health. A thrown read
 *  is `error` (we cannot see what is there); a clean read with nothing in it is
 *  `empty` (there genuinely is nothing). */
async function readSource(
  read: () => Promise<PublishingItem[]>
): Promise<{ items: PublishingItem[]; health: SourceHealth }> {
  try {
    const items = await read();
    return { items, health: items.length > 0 ? "ok" : "empty" };
  } catch (err) {
    console.error("[publishing] source read failed (degraded, not empty):", err);
    return { items: [], health: "error" };
  }
}

/** Social posts. A `draft` has no date and no promise attached, so it is not a
 *  calendar item; `publishing` is a transient claim on a scheduled post and shows
 *  as scheduled until it settles. */
async function socialItems(uid: string, projectId: string): Promise<PublishingItem[]> {
  const tenant = await resolveTenant(uid, projectId, { accountScoped: false });
  const posts = await listPosts(tenant, SOCIAL_LIMIT);
  const out: PublishingItem[] = [];
  for (const p of posts) {
    if (p.status === "draft") continue;
    const status: PublishingStatus =
      p.status === "published" ? "published" : p.status === "failed" ? "failed" : "scheduled";
    const at = p.scheduledAt ?? p.publishedAt ?? p.createdAt;
    if (!at) continue;
    out.push({
      id: `social:${p.id}`,
      source: "social",
      channel: channelKeyFromPlatform(p.platform),
      at,
      title: title(p.content, p.platform),
      status,
      href: `/app/${projectId}/socialni`,
    });
  }
  return out;
}

/** The content-plan board. Its slots carry a DAY INDEX, not an instant — the model
 *  this feature deliberately does not touch — so the instant is the one the board
 *  itself computes (`channelSendAt`), or the instant the channel was actually told
 *  when the slot was handed over. */
async function contentPlanItems(
  uid: string,
  projectId: string,
  now: number
): Promise<PublishingItem[]> {
  const board = await getProjectState<ContentPost[]>(uid, projectId, "content-schedule");
  if (!Array.isArray(board)) return [];
  const out: PublishingItem[] = [];
  for (const post of board) {
    if (post.day === null || post.day === undefined) continue;
    const at = post.channelSendAt ?? channelSendAt(post.day, now);
    // A withdrawn or failed handover fell back to a plan — it is not in a channel.
    const status: PublishingStatus = post.channelFailed
      ? "failed"
      : post.status === "queued"
        ? "scheduled"
        : post.status === "published"
          ? "published"
          : post.status === "done"
            ? "sent"
            : "planned";
    out.push({
      id: `content-plan:${post.id}`,
      source: "content-plan",
      channel: channelKeyFromContentChannel(post.channelPlatform),
      at,
      title: title(post.title, post.service),
      status,
      href: `/app/${projectId}/obsah-plan`,
    });
  }
  return out;
}

/** The twin outbox. `TwinDraft` has NO scheduled date — the twin answers inbound,
 *  it does not plan — so only a draft the human actually sent has a place on a
 *  calendar, at the instant it was sent. Nothing here is invented forward in time.
 *
 *  Its channel is a `TwinChannel`, which no channel vocabulary shares; the ONLY
 *  bridge is the kanály track that says "the twin's `social` voice speaks on this
 *  channel" (`ChannelTrack.twinScope`), which is exactly what the cadence rules
 *  carry. No such track ⇒ "other", and an "other" item never consumes a cap. */
async function twinItems(
  projectId: string,
  rules: CadenceRule[]
): Promise<PublishingItem[]> {
  const twin = await getTwin(projectId);
  if (!twin) return [];
  const byScope = new Map<string, ChannelKey>();
  for (const r of rules) {
    if (r.twinScope && !byScope.has(r.twinScope)) byScope.set(r.twinScope, r.channel);
  }
  const out: PublishingItem[] = [];
  for (const d of twin.drafts ?? []) {
    if (!d.sentAt) continue;
    out.push({
      id: `twin:${d.id}`,
      source: "twin",
      channel: byScope.get(d.channel) ?? "other",
      at: d.sentAt,
      title: title(d.reply, d.contact || d.channel),
      status: "sent",
      href: `/app/${projectId}/schranka`,
    });
  }
  return out;
}

/** Distribution variants. A variant has no date either — only `handed_off` records
 *  that it left the app, at `updatedAt`. Anything earlier in that state machine
 *  (generated / edited) is a working copy, not a publication. */
async function distributionItems(uid: string, projectId: string): Promise<PublishingItem[]> {
  const state = await getVariants(uid, projectId);
  if (!state) return [];
  const out: PublishingItem[] = [];
  for (const article of state.articles ?? []) {
    for (const v of article.variants ?? []) {
      if (v.status !== "handed_off") continue;
      out.push({
        id: `distribution:${article.articleKey}:${v.channel}`,
        source: "distribution",
        channel: channelKeyFromRepurpose(v.channel),
        at: v.updatedAt,
        title: title(article.title, v.channel),
        status: "sent",
        href: `/app/${projectId}/distribuce`,
      });
    }
  }
  return out;
}

/** The caps in force. A failed read here is NOT reported as a source (there are no
 *  cadence ITEMS) — it degrades to "no caps", which is the pre-feature behaviour:
 *  an unreadable kanály store must never refuse a post the operator is allowed to
 *  make. Fail-open is the correct direction for a gate, fail-closed for a claim. */
export const resolveCadenceRules = cache(async function readRules(
  projectId: string
): Promise<CadenceRule[]> {
  try {
    const state = await getOrganicChannels(projectId);
    if (!state) return [];
    const clean = sanitizeChannelState(state);
    return cadenceRules(clean.tracks, clean.plan ?? []);
  } catch (err) {
    console.error("[publishing] cadence rules unavailable — enforcing none:", err);
    return [];
  }
});

const readCalendar = cache(async (uid: string, projectId: string): Promise<PublishingCalendar> => {
  const now = Date.now();
  // Rules first: the twin leg needs them to resolve a TwinChannel onto a channel.
  const rules = await resolveCadenceRules(projectId);
  const [social, contentPlan, twin, distribution] = await Promise.all([
    readSource(() => socialItems(uid, projectId)),
    readSource(() => contentPlanItems(uid, projectId, now)),
    readSource(() => twinItems(projectId, rules)),
    readSource(() => distributionItems(uid, projectId)),
  ]);
  const items = [...social.items, ...contentPlan.items, ...twin.items, ...distribution.items].sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)
  );
  const sources: Record<PublishingSource, SourceHealth> = {
    social: social.health,
    "content-plan": contentPlan.health,
    twin: twin.health,
    distribution: distribution.health,
  };
  return { items, rules, sources };
});

/** Every planned, scheduled and delivered item across the four schedulers, plus
 *  the caps in force. `from`/`to` are ISO instants, inclusive. */
export async function resolvePublishingCalendar(
  uid: string,
  projectId: string,
  opts?: { from?: string; to?: string }
): Promise<PublishingCalendar> {
  const base = await readCalendar(uid, projectId);
  const from = opts?.from;
  const to = opts?.to;
  if (!from && !to) return base;
  return {
    ...base,
    items: base.items.filter((i) => (!from || i.at >= from) && (!to || i.at <= to)),
  };
}
