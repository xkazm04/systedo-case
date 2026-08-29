/** The cadence cap, made real. Pure — no store, no clock of its own.
 *
 *  `ChannelTrack.maxPerWeek` has been written by the kanály setup wizard and shown
 *  in the playbook since the module shipped, and enforced by NOTHING: the wizard
 *  promises "víc jich modul nenavrhne" while every scheduler posted straight past
 *  it. These three functions are the enforcement, and they live here (framework-
 *  free) so the same arithmetic runs in the write chokepoint and in the calendar
 *  the operator reads.
 *
 *  WEEKS ARE LOCAL AND ISO (Monday-start). The cap is a human promise about a
 *  human week — "max 3× týdně" means Monday to Sunday where the operator lives,
 *  not a UTC seven-day bucket that splits a Sunday-evening post off from the week
 *  it visibly belongs to. Same reason WeekPlanner groups by a LOCAL date. */
import { channelKeyFromLabel, channelKeyFromOrganicId, CHANNEL_KEYS, type ChannelKey } from "./channel-key";
import type { CadenceCheck, CadenceRule, PublishingItem, PublishingStatus } from "./types";
import type { ChannelTrack, OrganicChannel } from "@/lib/organic-channels/types";

/** Statuses that OCCUPY a slot in the week. A `planned` item is an internal note
 *  that nothing has acted on yet, so it must not consume the cap — capping plans
 *  would refuse a real post because someone sketched four ideas. `failed` freed
 *  its slot by definition. */
const COUNTED: readonly PublishingStatus[] = ["scheduled", "published", "sent"];

export function countsTowardCadence(status: PublishingStatus): boolean {
  return COUNTED.includes(status);
}

/** YYYY-MM-DD in LOCAL time (the WeekPlanner rule — `toISOString()` would shift
 *  the date across the UTC boundary near midnight). */
function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday 00:00 LOCAL of the week containing `at`, as YYYY-MM-DD. An unparseable
 *  instant yields "" — a bucket nothing else lands in, so a malformed row can
 *  neither be counted nor cause a refusal (the write route rejects an unparseable
 *  `scheduledAt` with a 422 long before this). */
export function weekStartIso(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday. Monday-start ⇒ Sunday steps back 6 days, not 0.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localIso(d);
}

/** The caps in force for a project, derived from its tracked channels.
 *
 *  Two rules earn their keep here:
 *   • An id that carries no channel information ("kanal-3" — the fallback
 *     `sanitizeChannel` mints for a PINNED AI plan) is retried through the
 *     channel's NAME, which is the only place the channel survives in that case.
 *   • A cap that still resolves to "other" is DROPPED. "other" is the bucket for
 *     Heureka, Firmy.cz, Reddit and every channel this app cannot post to; keeping
 *     it would let a cap on a directory listing refuse a LinkedIn post.
 *  When two tracked channels map to the same key (an AI plan listing "Instagram"
 *  next to the seeded "instagram-organic"), the STRICTEST cap wins — the operator
 *  asked for at most n, twice. */
export function cadenceRules(
  tracks: Record<string, ChannelTrack>,
  channels: OrganicChannel[]
): CadenceRule[] {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const strictest = new Map<ChannelKey, CadenceRule>();
  for (const [organicId, track] of Object.entries(tracks ?? {})) {
    const cap = track?.maxPerWeek;
    if (typeof cap !== "number" || !Number.isFinite(cap) || cap < 1) continue;
    let channel = channelKeyFromOrganicId(organicId);
    if (channel === "other") {
      const named = byId.get(organicId);
      if (named) channel = channelKeyFromLabel(named.name);
    }
    if (channel === "other") continue;
    const rule: CadenceRule = {
      channel,
      maxPerWeek: Math.floor(cap),
      organicId,
      ...(track.twinScope ? { twinScope: track.twinScope } : {}),
    };
    const prev = strictest.get(channel);
    if (!prev || rule.maxPerWeek < prev.maxPerWeek) strictest.set(channel, rule);
  }
  return [...strictest.values()].sort(
    (a, b) => CHANNEL_KEYS.indexOf(a.channel) - CHANNEL_KEYS.indexOf(b.channel)
  );
}

/** The cap in force for one channel, or null when none is. */
export function capFor(rules: CadenceRule[], channel: ChannelKey): number | null {
  let cap: number | null = null;
  for (const r of rules) {
    if (r.channel !== channel) continue;
    cap = cap === null ? r.maxPerWeek : Math.min(cap, r.maxPerWeek);
  }
  return cap;
}

/** May one more item go out on `channel` in the week containing `at`?
 *
 *  `count` is what is ALREADY there, so `exceeded` is `count >= cap`: with a cap
 *  of 3 and three items placed, the fourth is the one that breaks the promise. */
export function checkCadence(
  items: PublishingItem[],
  channel: ChannelKey,
  at: string,
  rules: CadenceRule[]
): CadenceCheck {
  const weekStart = weekStartIso(at);
  const cap = capFor(rules, channel);
  const count =
    weekStart === ""
      ? 0
      : items.filter(
          (i) =>
            i.channel === channel &&
            countsTowardCadence(i.status) &&
            weekStartIso(i.at) === weekStart
        ).length;
  return {
    channel,
    weekStart,
    count,
    cap,
    // No cap ⇒ never exceeded. An unreadable date ⇒ never exceeded either: this
    // function refuses writes, so it fails OPEN on data it cannot judge.
    exceeded: cap !== null && weekStart !== "" && count >= cap,
  };
}

/** Every channel with a cap, checked against the week containing `at` — the
 *  calendar's meter row and the insights producer read this. */
export function weekCadence(items: PublishingItem[], at: string, rules: CadenceRule[]): CadenceCheck[] {
  return rules.map((r) => checkCadence(items, r.channel, at, rules));
}
