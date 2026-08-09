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

/** The lifecycle a channel moves through once identified. Deliberately small:
 *  stage stores the user's INTENT; readiness gaps (voice untrained, twin channel
 *  disabled, no inbox source) are DERIVED live from the other modules' state by
 *  `deriveChannelNext`, never persisted — so the signpost can't disagree with the
 *  Twin/schranka modules about reality. Absent track = "identified". */
export type ChannelStage = "identified" | "planned" | "live" | "paused" | "done";

export const CHANNEL_STAGES: ChannelStage[] = ["identified", "planned", "live", "paused", "done"];

/** Who speaks on the channel: the operator by hand, or the trained twin. */
export type ChannelMode = "manual" | "twin";

/** How inbound reactions from a conversational channel reach the schranka inbox.
 *  "watch" (public-page polling) is reserved — it ships together with the headless
 *  outreach scraping experiments, not before. */
export type ChannelInboxSource = "manual" | "import";

/** Broad interaction shape of a channel — different kinds have different
 *  lifecycles (a directory listing can be "done"; a community never is). */
export type ChannelKind = "listing" | "conversational" | "content" | "pr";

export function channelKind(category: ChannelCategory): ChannelKind {
  switch (category) {
    case "directory":
    case "marketplace":
      return "listing";
    case "community":
    case "social":
      return "conversational";
    case "pr":
    case "partnership":
      return "pr";
    default:
      return "content";
  }
}

/** Per-channel tracked state: the stage plus the decisions the setup wizard
 *  wrote. Twin scope values mirror `TWIN_CHANNELS` (kept as a plain string here
 *  so this module stays dependency-free; the wizard only ever writes real ones). */
export interface ChannelTrack {
  stage: ChannelStage;
  mode?: ChannelMode;
  /** which twin voice scope speaks here (mode "twin"), e.g. "social" | "email" */
  twinScope?: string;
  /** conversational channels: how reactions reach the schranka inbox */
  inboxSource?: ChannelInboxSource;
  /** anti-spam cadence cap the wizard set (posts per week, 1–14) */
  maxPerWeek?: number;
  /** ISO timestamp the mode decision was made */
  decidedAt?: string;
}

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
  /** channelId (slug) -> tracked lifecycle; a missing id means "identified" */
  tracks: Record<string, ChannelTrack>;
  /** the pinned AI plan, when the user saved one; absent → the seeded sample shows */
  plan?: OrganicChannel[];
  /** provenance of `plan` (only "ai" today; the seed is implicit when plan is absent) */
  planSource?: "ai";
  /** ISO timestamp of the last save */
  updatedAt: string;
}

// --------------------------------------------------------------------------
// Provenance — every seeded number wears its label. Pure helpers the kanaly
// page uses to decide what disclosure the module owes the tenant.
// --------------------------------------------------------------------------

export interface PlanProvenance {
  /** the module is showing SEEDED sample data → the standard sample gutter shows
   *  (true also when the store read degraded to the read-only sample) */
  sample: boolean;
  /** when a pinned AI plan shows: the ISO timestamp it was generated (its save) */
  generatedAt?: string;
}

/** What the module owes the tenant about the plan it renders: a seeded fallback
 *  plan wears the sample gutter like every other seeded module; a pinned AI plan
 *  instead discloses WHEN it was generated (`updatedAt` of the save that pinned
 *  it) so a stale plan can't read as fresh analysis. */
export function planProvenance(resolved: {
  source: "sample" | "ai";
  updatedAt?: string;
}): PlanProvenance {
  if (resolved.source !== "ai") return { sample: true };
  return { sample: false, ...(resolved.updatedAt ? { generatedAt: resolved.updatedAt } : {}) };
}

/** Health of the competitor grounding the regenerate affordance would feed the
 *  channel-research op. "unavailable" (the read FAILED) must stay distinct from
 *  "none" (the tenant genuinely has no curated competitors): a failed read
 *  silently un-grounds regeneration, and the tenant deserves to know before
 *  they overwrite a grounded plan with an un-grounded one. */
export type CompetitorsGrounding = "ok" | "none" | "unavailable";

export function competitorsGrounding(
  readFailed: boolean,
  names: readonly string[]
): CompetitorsGrounding {
  if (readFailed) return "unavailable";
  return names.length > 0 ? "ok" : "none";
}

// --------------------------------------------------------------------------
// Request sanitizers — used by the persistence route to coerce arbitrary client
// JSON into a clean, bounded state blob (never trust the wire). Framework-free.
// --------------------------------------------------------------------------

const CATEGORY_SET = new Set<string>(CHANNEL_CATEGORIES);
const EFFORT_SET = new Set<string>(["low", "medium", "high"]);
const STAGE_SET = new Set<string>(CHANNEL_STAGES);
const MODE_SET = new Set<string>(["manual", "twin"]);
const INBOX_SET = new Set<string>(["manual", "import"]);

const s = (v: unknown, max: number): string =>
  (typeof v === "string" ? v.trim() : "").slice(0, max);

/** Pre-lifecycle blobs stored a flat status string per channel. Map it onto the
 *  stage vocabulary so existing tracked work survives the model change. */
const LEGACY_STATUS_TO_STAGE: Record<string, ChannelStage> = {
  active: "live",
  done: "done",
};

/** Coerce one track from the wire (or a legacy status string) into a clean
 *  ChannelTrack, or null to drop it (= "identified", the default). */
export function sanitizeTrack(raw: unknown): ChannelTrack | null {
  if (typeof raw === "string") {
    const stage = LEGACY_STATUS_TO_STAGE[raw];
    return stage ? { stage } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const stage = STAGE_SET.has(o.stage as string) ? (o.stage as ChannelStage) : null;
  if (!stage || stage === "identified") {
    // "identified" is the absent-track default — never persist it.
    return null;
  }
  const track: ChannelTrack = { stage };
  if (MODE_SET.has(o.mode as string)) track.mode = o.mode as ChannelMode;
  const twinScope = s(o.twinScope, 24);
  if (twinScope) track.twinScope = twinScope;
  if (INBOX_SET.has(o.inboxSource as string)) track.inboxSource = o.inboxSource as ChannelInboxSource;
  const cap = Math.round(Number(o.maxPerWeek));
  if (Number.isFinite(cap) && cap >= 1) track.maxPerWeek = Math.min(14, cap);
  const decidedAt = s(o.decidedAt, 40);
  if (decidedAt) track.decidedAt = decidedAt;
  return track;
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
  const tracks: Record<string, ChannelTrack> = {};
  // `tracks` is the current shape; `statuses` is the legacy flat-status map from
  // pre-lifecycle blobs (and old clients) — sanitizeTrack migrates both.
  const source = (o.tracks ?? o.statuses) as unknown;
  if (source && typeof source === "object") {
    let n = 0;
    for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
      const key = s(k, 80);
      if (!key) continue;
      const track = sanitizeTrack(v);
      // Only persist the non-default tracks — keeps the blob small.
      if (track) {
        tracks[key] = track;
        if (++n >= 64) break;
      }
    }
  }
  const out: Omit<OrganicChannelState, "updatedAt"> = { tracks };
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
