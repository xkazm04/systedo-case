/** The organic-visibility (zero ad-spend) channel model. A project's plan is a
 *  ranked list of free channels — directories, marketplaces, communities, owned
 *  content, PR and partnerships — each with a fit score, an effort level, why it
 *  suits THIS business and the concrete first actions to get seen there. The plan
 *  is seeded per project (honest sample) and can be regenerated on the client via
 *  the `channel-research` LLM op; the tracked STATUS of each channel (the
 *  checklist state) persists per project through the store trio. Framework-free. */

export type ChannelCategory =
  | "directory"
  | "marketplace"
  | "community"
  | "content"
  | "social"
  | "pr"
  | "partnership";

export const CHANNEL_CATEGORIES: ChannelCategory[] = [
  "directory",
  "marketplace",
  "community",
  "content",
  "social",
  "pr",
  "partnership",
];

/** How much work it takes to get visible on a channel — drives the effort column
 *  and lets the UI surface the low-effort / high-fit quick wins first. */
export type ChannelEffort = "low" | "medium" | "high";

/** The tracked checklist state of a channel for a project. Absent = not-started. */
export type ChannelStatus = "not-started" | "active" | "done";

export const CHANNEL_STATUSES: ChannelStatus[] = ["not-started", "active", "done"];

/** One organic (zero ad-spend) visibility channel in a project's plan. */
export interface OrganicChannel {
  /** stable slug — keys the persisted status + the React list */
  id: string;
  /** channel name, e.g. "Google Business Profile" */
  name: string;
  category: ChannelCategory;
  /** 0–100: how well this channel suits the project's business (drives the rank) */
  fit: number;
  effort: ChannelEffort;
  /** one line: why this channel fits THIS business (grounded, no invented facts) */
  rationale: string;
  /** short expected payoff, e.g. "Zákazníci hledající službu ve vašem okolí" */
  payoff: string;
  /** 2–4 concrete first actions to get visible here */
  firstActions: string[];
  /** where to register / where the channel lives, when there's a canonical URL */
  url?: string;
  /** a ready content angle to hand off to the content engine ("Vytvořit obsah") */
  contentAngle?: string;
}

/** Persisted per project: the tracked status of each channel, plus optionally an
 *  AI-generated plan the user pinned (replaces the seeded sample as the source of
 *  truth). Mirrors the {meta, data} blobs of the other per-project stores. */
export interface OrganicChannelState {
  /** channelId (slug) -> tracked status; a missing id means "not-started" */
  statuses: Record<string, ChannelStatus>;
  /** the pinned AI plan, when the user saved one; absent → the seeded sample shows */
  plan?: OrganicChannel[];
  /** provenance of `plan` (only "ai" today; the seed is implicit when plan is absent) */
  planSource?: "ai";
  /** ISO timestamp of the last save */
  updatedAt: string;
}

// --------------------------------------------------------------------------
// Request sanitizers — used by the persistence route to coerce arbitrary client
// JSON into a clean, bounded state blob (never trust the wire). Framework-free.
// --------------------------------------------------------------------------

const CATEGORY_SET = new Set<string>(CHANNEL_CATEGORIES);
const EFFORT_SET = new Set<string>(["low", "medium", "high"]);
const STATUS_SET = new Set<string>(CHANNEL_STATUSES);

const s = (v: unknown, max: number): string =>
  (typeof v === "string" ? v.trim() : "").slice(0, max);

export function sanitizeStatus(v: unknown): ChannelStatus {
  return STATUS_SET.has(v as string) ? (v as ChannelStatus) : "not-started";
}

/** Coerce one channel object from the wire into a clean OrganicChannel, or null to
 *  drop it. A channel needs at least an id (or name to derive one) and a name. */
export function sanitizeChannel(raw: unknown, index = 0): OrganicChannel | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = s(o.name, 120);
  if (!name) return null;
  const id = s(o.id, 80) || `kanal-${index + 1}`;
  const category = (CATEGORY_SET.has(o.category as string) ? o.category : "content") as ChannelCategory;
  const effort = (EFFORT_SET.has(o.effort as string) ? o.effort : "medium") as ChannelEffort;
  const fitN = Math.round(Number(o.fit));
  const fit = Number.isFinite(fitN) ? Math.max(0, Math.min(100, fitN)) : 60;
  const firstActions = Array.isArray(o.firstActions)
    ? o.firstActions
        .filter((a): a is string => typeof a === "string")
        .map((a) => a.trim())
        .filter(Boolean)
        .slice(0, 6)
        .map((a) => a.slice(0, 300))
    : [];
  const channel: OrganicChannel = {
    id,
    name,
    category,
    fit,
    effort,
    rationale: s(o.rationale, 400),
    payoff: s(o.payoff, 300),
    firstActions,
  };
  const url = s(o.url, 300);
  if (url) channel.url = url;
  const contentAngle = s(o.contentAngle, 300);
  if (contentAngle) channel.contentAngle = contentAngle;
  return channel;
}

/** Coerce the full request body into a clean state blob (≤64 statuses, ≤24 pinned
 *  channels). Returns the blob without `updatedAt` (the store stamps that). */
export function sanitizeChannelState(raw: unknown): Omit<OrganicChannelState, "updatedAt"> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const statuses: Record<string, ChannelStatus> = {};
  if (o.statuses && typeof o.statuses === "object") {
    let n = 0;
    for (const [k, v] of Object.entries(o.statuses as Record<string, unknown>)) {
      const key = s(k, 80);
      if (!key) continue;
      const status = sanitizeStatus(v);
      // Only track the non-default statuses — keeps the blob small.
      if (status !== "not-started") {
        statuses[key] = status;
        if (++n >= 64) break;
      }
    }
  }
  const out: Omit<OrganicChannelState, "updatedAt"> = { statuses };
  if (Array.isArray(o.plan)) {
    const plan = o.plan
      .slice(0, 24)
      .map((c, i) => sanitizeChannel(c, i))
      .filter((c): c is OrganicChannel => c !== null);
    if (plan.length > 0) {
      out.plan = plan;
      out.planSource = "ai";
    }
  }
  return out;
}
