/** The read-side publishing model: one item shape every scheduler's plan collapses
 *  into, and the cadence vocabulary the kanály cap is enforced through.
 *
 *  NOTHING HERE IS PERSISTED. There is no publishing store and no migration: a
 *  `PublishingItem` is derived on every read from what the four existing stores
 *  already hold (social posts, the content-plan board, the twin outbox, the
 *  distribution variants), so the calendar can never disagree with the module it
 *  came from — and deleting this whole feature leaves the data untouched.
 *  Framework-free. */
import type { ChannelKey } from "./channel-key";

/** Which scheduler an item came from. The chip colour + the deep link follow it,
 *  so an operator always knows which module owns the thing they are looking at. */
export type PublishingSource = "social" | "content-plan" | "twin" | "distribution";

export const PUBLISHING_SOURCES: readonly PublishingSource[] = [
  "social",
  "content-plan",
  "twin",
  "distribution",
] as const;

/** The lifecycle, flattened across four vocabularies. The split that matters is
 *  the honesty one this repo already draws elsewhere:
 *    planned    — placed on a day, purely internal; nothing has left the app
 *    scheduled  — a real channel has been told to send it
 *    published  — the CHANNEL confirmed it went out (only a channel may assert it)
 *    sent       — it left the app on the operator's own action (a twin draft the
 *                 human sent, a variant handed off, a board slot marked done) —
 *                 real delivery, but never a channel-confirmed publish
 *    failed     — the channel reported it did not go out */
export type PublishingStatus = "planned" | "scheduled" | "published" | "sent" | "failed";

export interface PublishingItem {
  /** `${source}:${sourceId}` — stable across reads, unique across sources */
  id: string;
  source: PublishingSource;
  channel: ChannelKey;
  /** ISO instant this item occupies on the calendar */
  at: string;
  title: string;
  status: PublishingStatus;
  /** `/app/{projectId}/{module}` — where the owning module can be opened */
  href?: string;
}

/** One enforced cap, derived from a `ChannelTrack.maxPerWeek` the kanály wizard
 *  wrote. `organicId` is kept so the UI can point back at the channel that set it. */
export interface CadenceRule {
  channel: ChannelKey;
  maxPerWeek: number;
  organicId: string;
  /** the twin voice scope that speaks on this channel (`ChannelTrack.twinScope`),
   *  when the operator set the channel to twin mode. The ONLY link between a
   *  `TwinChannel` and a capped channel, so the outbox can show the right meter. */
  twinScope?: string;
}

/** The answer to "may one more item go out on this channel in this week?".
 *  `cap === null` means no rule applies, and then `exceeded` is always false —
 *  an unconfigured channel is never refused. */
export interface CadenceCheck {
  channel: ChannelKey;
  /** Monday of the item's LOCAL week, YYYY-MM-DD */
  weekStart: string;
  /** items already occupying that channel-week */
  count: number;
  cap: number | null;
  exceeded: boolean;
}

/** Per-source read health. `error` must be RENDERED, never collapsed into an empty
 *  week: "we could not read your twin outbox" and "your twin outbox is empty" are
 *  different sentences, and only one of them is safe to act on. */
export type SourceHealth = "ok" | "empty" | "error";

export interface PublishingCalendar {
  items: PublishingItem[];
  rules: CadenceRule[];
  sources: Record<PublishingSource, SourceHealth>;
}
