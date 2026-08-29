/** The ORGANIC OUTCOME LEDGER — pure model + rollup (WP W2-A).
 *
 *  The free-channel plan has always ranked channels by a CURATED `fit`: a number the
 *  sample or the `channel-research` model produced from the business context. It is a
 *  prediction, and nothing in the product ever checked it against what actually
 *  happened. This module is the other half: a minted `/go/{id}` link is a channel
 *  action the tenant can put into the world, the public redirect bumps a daily
 *  counter, and the rollup below folds those counters into per-channel OUTCOMES.
 *
 *  THE HONESTY RULE THAT SHAPES THE TYPES. `fit` is never overwritten. A measured
 *  channel gets a SEPARATE signal (`clicks7d` / `clicks30d`) rendered beside the
 *  curated score, never blended into it — a blend would let one week of clicks
 *  silently rewrite advice the tenant reads as strategic, and neither number could
 *  then be trusted. `measuredBadge` returns null the moment there is nothing
 *  measured, so a channel with no clicks shows exactly what it showed before.
 *
 *  PRIVACY IS THE SCHEMA (the `src/lib/analytics/store.ts` posture, copied
 *  deliberately): a click is a `(link id, UTC day, count)` row and nothing else. No
 *  IP, no user agent, no referrer, no cookie, no session, no per-visitor row. What
 *  cannot be stored cannot leak, and cannot later be repurposed into tracking.
 *
 *  Pure and framework-free (no I/O, no React, no store) so the cron step, the two
 *  routes and the UI all derive the same numbers from the same function. */

/** One minted short link. `id` is the whole public address space, so it is random
 *  rather than derived — a guessable id would let anyone enumerate a tenant's
 *  campaign targets. */
export interface GoLink {
  /** 10-char base36 random — the `/go/{id}` path segment */
  id: string;
  userId: string;
  projectId: string;
  /** where the redirect ultimately sends the visitor (http/https, validated at mint) */
  url: string;
  /** the Distribuce / Kanály channel label this link belongs to */
  channel: string;
  /** the utm_campaign slug the redirect stamps */
  campaign: string;
  createdAt: string;
}

/** One aggregated counter: how many times `linkId` was followed on `day` (UTC). */
export interface GoClickDay {
  linkId: string;
  /** UTC calendar day, "YYYY-MM-DD" */
  day: string;
  count: number;
}

/** What one channel actually produced, rolled up over the counter rows. */
export interface ChannelOutcome {
  channel: string;
  /** how many links the tenant minted for this channel */
  links: number;
  clicks7d: number;
  clicks30d: number;
  /** UTC day of the newest counted click, absent when nothing was ever counted */
  lastClickAt?: string;
}

/** The persisted rollup blob (`project_state` key "organicOutcomes"). */
export interface OrganicOutcomes {
  channels: ChannelOutcome[];
  updatedAt: string;
}

/** Links per project. A short-link space is public and unauthenticated by
 *  construction, so it is capped rather than unbounded: past this the mint route
 *  refuses (409) instead of letting one project mint a million public addresses. */
export const GO_LINK_CAP = 200;

/** How long a daily counter row is kept. Ninety days is a full quarter — longer
 *  than every window the product reads (7d / 30d) with room for a late rollup —
 *  and short enough that the ledger cannot grow without bound. */
export const GO_CLICK_RETENTION_DAYS = 90;

/** The rolling windows, in days, INCLUSIVE of today. */
export const CLICK_WINDOW_7 = 7;
export const CLICK_WINDOW_30 = 30;

/** UTC calendar day of an instant, "YYYY-MM-DD" — the counter's key half. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The UTC day `days` days before `at`. Used for both window edges and the
 *  retention cut, so "30 days" means the same thing in all three places. */
export function dayBefore(at: Date, days: number): string {
  return utcDay(new Date(at.getTime() - days * 86_400_000));
}

/** The oldest day a rolling window of `days` (inclusive of today) covers. */
export function windowStart(at: Date, days: number): string {
  return dayBefore(at, Math.max(0, days - 1));
}

/** The day BEFORE which counter rows may be dropped (see GO_CLICK_RETENTION_DAYS). */
export function retentionCutoff(at: Date): string {
  return dayBefore(at, GO_CLICK_RETENTION_DAYS);
}

/** Automated traffic that must not be counted as a human following a link.
 *
 *  Deliberately a coarse UA substring test, and deliberately the ONLY thing the
 *  redirect looks at in the request: the alternative — a fingerprint, a cookie, a
 *  rate-limit bucket per visitor — is exactly the per-visitor state this ledger
 *  exists without. A crawler that lies about its UA is counted; that is the honest
 *  cost of not tracking people, and it is disclosed as "clicks", never as "visitors".
 *  `preview` catches the link-unfurlers (Slack, Discord, Facebook) that fetch a URL
 *  the instant it is pasted, which is the single largest source of phantom clicks. */
export const BOT_UA = /bot|crawl|spider|preview|slurp|fetch|monitor|headless|externalhit/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  return !!ua && BOT_UA.test(ua);
}

/** Fold minted links + daily counters into one outcome row per CHANNEL.
 *
 *  Channel, not link: the plan the tenant reads is a list of channels, so a channel
 *  with five links spread across five articles must read as one measured signal.
 *  Rows whose `linkId` matches no supplied link are ignored (a link deleted while a
 *  counter row survived), and days outside the 30-day window are ignored entirely —
 *  so a stale counter can never inflate the headline number.
 *
 *  Ordering is deterministic: most-clicked first, ties broken by channel name, so a
 *  rendered table and a pinned test agree run after run. */
export function rollupChannelOutcomes(
  links: readonly GoLink[],
  dayRows: readonly GoClickDay[],
  now: Date
): ChannelOutcome[] {
  const from7 = windowStart(now, CLICK_WINDOW_7);
  const from30 = windowStart(now, CLICK_WINDOW_30);

  const channelOfLink = new Map<string, string>();
  const byChannel = new Map<string, ChannelOutcome>();
  for (const link of links) {
    const channel = link.channel.trim();
    if (!channel) continue;
    channelOfLink.set(link.id, channel);
    const row = byChannel.get(channel);
    if (row) row.links++;
    else byChannel.set(channel, { channel, links: 1, clicks7d: 0, clicks30d: 0 });
  }

  for (const row of dayRows) {
    const channel = channelOfLink.get(row.linkId);
    if (!channel) continue;
    const outcome = byChannel.get(channel);
    if (!outcome) continue;
    const count = Number.isFinite(row.count) ? Math.max(0, Math.trunc(row.count)) : 0;
    if (count === 0 || row.day < from30) continue;
    outcome.clicks30d += count;
    if (row.day >= from7) outcome.clicks7d += count;
    if (!outcome.lastClickAt || row.day > outcome.lastClickAt) outcome.lastClickAt = row.day;
  }

  return [...byChannel.values()].sort(
    (a, b) => b.clicks30d - a.clicks30d || a.channel.localeCompare(b.channel, "cs")
  );
}

/** What the UI may claim about one channel — null when NOTHING was measured.
 *
 *  The null is the point. A minted link with no clicks yet is not a measurement, and
 *  a "0 kliknutí" badge beside a curated fit reads as a verdict on the channel
 *  rather than as an absence of data. No clicks → no badge → the row is exactly what
 *  it was before this ledger existed. */
export function measuredBadge(
  outcome: ChannelOutcome | null | undefined
): { clicks30d: number; clicks7d: number; lastClickAt?: string } | null {
  if (!outcome || outcome.clicks30d <= 0) return null;
  return {
    clicks30d: outcome.clicks30d,
    clicks7d: outcome.clicks7d,
    ...(outcome.lastClickAt ? { lastClickAt: outcome.lastClickAt } : {}),
  };
}

/** Case/whitespace-tolerant lookup of a channel's outcome. The plan's channel names
 *  come from a model ("LinkedIn", "Linkedin") while a minted link carries whatever
 *  label the Distribuce card used, so an exact-string join would silently show
 *  nothing for the very channels that ARE measured. */
export function outcomeFor(
  outcomes: readonly ChannelOutcome[] | undefined,
  channel: string
): ChannelOutcome | null {
  if (!outcomes || outcomes.length === 0) return null;
  const key = channel.trim().toLowerCase();
  return outcomes.find((o) => o.channel.trim().toLowerCase() === key) ?? null;
}

/** The `measured` grounding rows handed to the `channel-research` prompt — the
 *  most-clicked channels first, capped, and ONLY the ones with real clicks (a
 *  zero would be a fact the model would reason about, and "not measured" is not
 *  "measured as zero"). */
export const MEASURED_GROUNDING_CAP = 12;

export function measuredGrounding(
  outcomes: readonly ChannelOutcome[] | undefined
): Array<{ channel: string; clicks30d: number; links: number }> {
  return (outcomes ?? [])
    .filter((o) => o.clicks30d > 0)
    .slice(0, MEASURED_GROUNDING_CAP)
    .map((o) => ({ channel: o.channel, clicks30d: o.clicks30d, links: o.links }));
}
