/** ONE visibility plan — the artifact that makes "get found without paying" read
 *  as a single plan instead of three unrelated modules.
 *
 *  The gap this closes (UAT L1-STANDA-004, confirmed at L2; impact analysis §6 P2/P3):
 *  the search-query leg lives in Klíčová slova, the content leg in the Obsahový
 *  engine and the channel leg in Kanály zdarma, and nothing ever packaged them.
 *  A maker who wants traffic has to hold the join in their head — and the channel
 *  plan did not even LINK to the query half (its NextSteps hopped to content and
 *  social only).
 *
 *  THE SPINE IS THE CHANNEL PLAN. One row = one channel, in the plan's own
 *  fit-ranked order, carrying the query it should aim at and the brief/draft that
 *  already covers that query. That choice is what makes the empty case honest: a
 *  project with no saved keywords and no saved content gets back exactly the
 *  channel-only plan today's page already implies — same channels, same order,
 *  same first actions — with the query and content legs explicitly `null` rather
 *  than filled with something invented (pinned byte-for-byte by the unit tests).
 *
 *  THE ONE HEURISTIC, STATED PLAINLY. There is no stored link between a query and
 *  a channel; the app is PROPOSING one. The proposal is a deterministic zip:
 *  target queries (in-flight first, then by opportunity) are dealt one-by-one onto
 *  the channels that can actually carry content — communities, social and owned
 *  content — in fit order. A directory listing gets no query: "register on
 *  Firmy.cz" is not a piece of writing, and pairing one with a keyword would be
 *  advice the data does not support. Channel↔content, by contrast, is a REAL join
 *  the tenant made: a saved brief names its `primaryKeyword`, so content is matched
 *  to the query it was briefed against, never guessed.
 *
 *  PROVENANCE TRAVELS PER LEG. Each leg says where it came from — seeded (a
 *  fixture number), ai (a generation: the pinned AI plan, the onboarding scan's
 *  keyword seed, a generated brief) or user (the tenant's own measured/decided
 *  data) — and the row rolls them up as the strongest one present, so a row that
 *  is partly the tenant's own work never reads as pure sample.
 *
 *  Pure and framework-free: no I/O, no store, no React, no locale. The server
 *  resolver (./visibility-plan-resolve) does the reads; the card renders the
 *  labels. */
import type { KeywordList } from "@/lib/keywords/types";
import type { SavedContentEntry } from "@/lib/content-library/entries";
import { SCAN_LIST_SEED } from "@/lib/onboarding/seed";
import { measuredBadge, outcomeFor, type ChannelOutcome } from "./outcomes";
import { isModuleAvailable } from "@/lib/projects/modules";
import type { ProjectType } from "@/lib/projects/types";
import {
  channelKind,
  type ChannelCategory,
  type ChannelEffort,
  type ChannelStage,
  type ChannelTrack,
  type OrganicChannel,
} from "./types";

/** Where a leg's datum came from. Ordered weakest → strongest for the row roll-up. */
export type PlanLegProvenance = "seeded" | "ai" | "user";

const PROVENANCE_RANK: Record<PlanLegProvenance, number> = { seeded: 0, ai: 1, user: 2 };

/** The strongest provenance among the legs a row actually has. A row with any of
 *  the tenant's own data reads as `user`; one touched by a generation reads as
 *  `ai`; only an all-fixture row reads as `seeded`. */
function strongest(...legs: readonly PlanLegProvenance[]): PlanLegProvenance {
  return legs.reduce<PlanLegProvenance>(
    (best, p) => (PROVENANCE_RANK[p] > PROVENANCE_RANK[best] ? p : best),
    "seeded"
  );
}

/** The ONE thing to do on this row this week. Deliberately small — every value is
 *  an action the app can actually route to. `first-action` is both "this channel
 *  is not about writing" and the honest fallback when there is no query to aim at,
 *  which is what keeps the no-data plan identical to the channel-only plan. */
export type VisibilityStep = "publish" | "finish-draft" | "write-brief" | "first-action" | "done";

/** Do-this-first order. `done` sinks (finished work is not this week's work);
 *  everything else ranks by how close it already is to a published page. The sort
 *  is STABLE, so equal-step rows keep the channel plan's own fit order. */
const STEP_RANK: Record<VisibilityStep, number> = {
  publish: 0,
  "finish-draft": 1,
  "write-brief": 2,
  "first-action": 3,
  done: 4,
};

/** A target search query, normalized out of whatever module holds it. */
export interface PlanQuery {
  query: string;
  /** 0–100 opportunity, or 0 when the source carried no metric (a scan seed) */
  opportunity: number;
  /** average monthly searches, or 0 when unmeasured */
  volume: number;
  provenance: PlanLegProvenance;
}

/** A saved brief or article draft, tied to the query it was briefed against. */
export interface PlanContent {
  id: string;
  title: string;
  /** the query this piece targets — the real join to the query leg */
  primaryKeyword: string;
  kind: "brief" | "article";
  provenance: PlanLegProvenance;
}

export interface VisibilityRow {
  /** the channel id — a row IS a channel, so this is the stable React/test key */
  id: string;
  channel: {
    id: string;
    name: string;
    category: ChannelCategory;
    effort: ChannelEffort;
    fit: number;
    stage: ChannelStage;
    /** the plan's own first concrete step here, when it proposed one */
    firstAction: string | null;
    url?: string;
  };
  /** the query this channel's content should aim at — null when the channel does
   *  not carry content, or when the tenant has no queries left to deal out */
  query: PlanQuery | null;
  /** the brief/draft that already covers `query` — null when nothing does */
  content: PlanContent | null;
  step: VisibilityStep;
  provenance: PlanLegProvenance;
  /** MEASURED 30-day clicks on this channel's own `/go` links (WP W2-A). ABSENT
   *  when nothing was measured — which is not the same as zero, so the row shows
   *  the number only where one exists. It does not enter the ordering: the plan is
   *  a "what to do next" queue, and letting a measured channel jump the queue would
   *  starve exactly the channels the tenant has not started yet. */
  measuredClicks?: number;
}

export interface VisibilityPlan {
  /** the "this week" list, ordered and capped */
  rows: VisibilityRow[];
  /** rows before the cap — lets the card say how much of the plan it is showing */
  total: number;
  /** how much of each leg actually fed the composition (0 = an honest empty) */
  counts: { queries: number; content: number; channels: number };
  /** provenance of the channel leg as a whole (the plan's spine) */
  channelSource: "sample" | "ai";
}

/** How many rows the card shows. Three is the point of the artifact: a plan you
 *  can act on this week, not a second copy of the channel table. */
export const VISIBILITY_PLAN_ROWS = 3;

/** The three modules the plan joins. Gating on all three (rather than assuming
 *  they exist) is the module registry's own contract: retarget any one of them to
 *  a subset of project types and the plan disappears for the rest instead of
 *  linking somewhere that 404s. */
export const VISIBILITY_PLAN_MODULES = ["klicova-slova", "obsahovy-engine", "kanaly"] as const;

/** Whether a project type has all three legs, i.e. whether the plan is meaningful. */
export function hasVisibilityPlan(type: ProjectType): boolean {
  return VISIBILITY_PLAN_MODULES.every((key) => isModuleAvailable(type, key));
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Channels whose visibility is won by PUBLISHING something (owned content,
 *  communities, social) — the only ones a target query can sensibly be dealt to.
 *  A directory/marketplace listing or a PR pitch is won by doing its first action. */
function carriesContent(category: ChannelCategory): boolean {
  const kind = channelKind(category);
  return kind === "content" || kind === "conversational";
}

/** Index content by the query it was briefed against. A published draft beats a
 *  bare brief for the same query (it is further along, and `publish` is the more
 *  useful instruction); ties keep the first entry, so a newest-first library keeps
 *  its newest. */
function indexContent(content: readonly PlanContent[]): Map<string, PlanContent> {
  const byQuery = new Map<string, PlanContent>();
  for (const c of content) {
    const key = norm(c.primaryKeyword);
    if (!key) continue;
    const existing = byQuery.get(key);
    if (!existing || (existing.kind === "brief" && c.kind === "article")) byQuery.set(key, c);
  }
  return byQuery;
}

/** Compose the one plan. Everything is derived; nothing is invented. */
export function buildVisibilityPlan(input: {
  channels: readonly OrganicChannel[];
  tracks?: Readonly<Record<string, ChannelTrack>>;
  queries?: readonly PlanQuery[];
  content?: readonly PlanContent[];
  channelSource?: "sample" | "ai";
  /** measured per-channel outcomes (WP W2-A) — stamped onto the matching rows and
   *  nothing more; the composition, the ordering and the caps are untouched, so a
   *  project with no measurement produces a byte-identical plan. */
  outcomes?: readonly ChannelOutcome[];
  /** rows to keep; 0 means uncapped */
  limit?: number;
}): VisibilityPlan {
  const tracks = input.tracks ?? {};
  const content = input.content ?? [];
  const channelSource = input.channelSource ?? "sample";
  const limit = input.limit ?? VISIBILITY_PLAN_ROWS;
  const byQuery = indexContent(content);

  // A piece of content whose keyword is in no saved list is still a query the
  // tenant chose — promoting it keeps written work from falling out of the plan
  // just because the keyword was never saved to a list.
  const queries = [...(input.queries ?? [])];
  const known = new Set(queries.map((q) => norm(q.query)).filter(Boolean));
  for (const c of content) {
    const key = norm(c.primaryKeyword);
    if (!key || known.has(key)) continue;
    known.add(key);
    queries.push({
      query: c.primaryKeyword.trim(),
      opportunity: 0,
      volume: 0,
      provenance: c.provenance,
    });
  }

  // In-flight work first (something is already written for it), then the biggest
  // opportunity, then measured volume; the name breaks the last tie so the deal
  // is deterministic for a given input.
  const queue = queries
    .filter((q) => q.query.trim().length > 0)
    .sort(
      (a, b) =>
        Number(byQuery.has(norm(b.query))) - Number(byQuery.has(norm(a.query))) ||
        b.opportunity - a.opportunity ||
        b.volume - a.volume ||
        a.query.localeCompare(b.query, "cs")
    );

  // Measured clicks, looked up per row. `measuredBadge` is the same null-on-nothing
  // rule the channel table uses, so the two surfaces can never disagree about
  // whether a channel counts as measured.
  const measuredOf = (name: string) => measuredBadge(outcomeFor(input.outcomes, name));

  let next = 0;
  const rows: VisibilityRow[] = input.channels.map((c) => {
    const stage: ChannelStage = tracks[c.id]?.stage ?? "identified";
    const done = stage === "done";
    // A finished channel is not dealt a query — the plan would be proposing work
    // on something the tenant already closed.
    const query = !done && carriesContent(c.category) && next < queue.length ? queue[next++]! : null;
    const matched = query ? (byQuery.get(norm(query.query)) ?? null) : null;
    const step: VisibilityStep = done
      ? "done"
      : matched?.kind === "article"
        ? "publish"
        : matched?.kind === "brief"
          ? "finish-draft"
          : query
            ? "write-brief"
            : "first-action";
    const channelProvenance: PlanLegProvenance = tracks[c.id]
      ? "user" // the tenant made a decision on this channel
      : channelSource === "ai"
        ? "ai"
        : "seeded";
    return {
      id: c.id,
      channel: {
        id: c.id,
        name: c.name,
        category: c.category,
        effort: c.effort,
        fit: c.fit,
        stage,
        firstAction: c.firstActions[0] ?? null,
        ...(c.url ? { url: c.url } : {}),
      },
      query,
      content: matched,
      step,
      ...(measuredOf(c.name) ? { measuredClicks: measuredOf(c.name)!.clicks30d } : {}),
      provenance: strongest(
        channelProvenance,
        ...(query ? [query.provenance] : []),
        ...(matched ? [matched.provenance] : [])
      ),
    };
  });

  // Stable sort: rows sharing a step keep the channel plan's fit order, which is
  // what makes the no-query/no-content plan identical to the channel-only one.
  rows.sort((a, b) => STEP_RANK[a.step] - STEP_RANK[b.step]);

  return {
    rows: limit > 0 ? rows.slice(0, limit) : rows,
    total: rows.length,
    counts: { queries: queue.length, content: content.length, channels: input.channels.length },
    channelSource,
  };
}

/* -------------------------------------------------------------------------- */
/*  Adapters — the two other modules' stored shapes → plan legs. Pure, so the   */
/*  mapping (and its provenance rules) is testable without a store.             */
/* -------------------------------------------------------------------------- */

/** Max target queries carried into the plan — a bound, not a ranking decision. */
const MAX_QUERIES = 24;

/** Provenance of a saved keyword list. The onboarding scan writes one list under a
 *  sentinel seed: those keywords are the SCAN's reading of the homepage, so `ai`.
 *  A list saved from a real Keyword Planner / Sklik pull carries measured numbers
 *  the tenant kept → `user`. A list saved off the sample generator carries
 *  fabricated volumes, so it stays `seeded` however deliberately it was saved —
 *  the label describes the NUMBERS, which is what a reader would otherwise trust. */
function listProvenance(list: KeywordList): PlanLegProvenance {
  if (list.seed === SCAN_LIST_SEED) return "ai";
  return list.source === "google-ads" ? "user" : "seeded";
}

/** Saved keyword lists → target queries. Negatives are exclusions, never targets,
 *  so they are dropped. Deduped case-insensitively keeping the richest record
 *  (higher opportunity, then higher volume) and the strongest provenance seen for
 *  that keyword, then ranked by opportunity. */
export function queriesFromKeywordLists(lists: readonly KeywordList[]): PlanQuery[] {
  const byKeyword = new Map<string, PlanQuery>();
  for (const list of lists) {
    const provenance = listProvenance(list);
    for (const k of list.keywords ?? []) {
      if (k.tag === "negative") continue;
      const keyword = k.keyword.trim();
      const key = norm(keyword);
      if (!key) continue;
      const candidate: PlanQuery = {
        query: keyword,
        opportunity: Math.max(0, Math.round(k.opportunity)) || 0,
        volume: Math.max(0, Math.round(k.avgMonthlySearches)) || 0,
        provenance,
      };
      const existing = byKeyword.get(key);
      if (!existing) {
        byKeyword.set(key, candidate);
        continue;
      }
      const richer =
        candidate.opportunity > existing.opportunity ||
        (candidate.opportunity === existing.opportunity && candidate.volume > existing.volume)
          ? candidate
          : existing;
      byKeyword.set(key, {
        ...richer,
        provenance: strongest(existing.provenance, candidate.provenance),
      });
    }
  }
  return [...byKeyword.values()]
    .sort(
      (a, b) =>
        b.opportunity - a.opportunity ||
        b.volume - a.volume ||
        a.query.localeCompare(b.query, "cs")
    )
    .slice(0, MAX_QUERIES);
}

/** Saved library entries → the content leg. An entry with no primary keyword has
 *  no join to a query and is dropped rather than attached to a guess. A demo-mode
 *  generation is `seeded` (deterministic fixture text); a real one is `ai` — the
 *  words are the model's however deliberately the tenant kept them. */
export function contentFromLibrary(entries: readonly SavedContentEntry[]): PlanContent[] {
  const out: PlanContent[] = [];
  for (const e of entries) {
    const primaryKeyword = (e.form?.primaryKeyword ?? "").trim();
    if (!primaryKeyword) continue;
    out.push({
      id: e.id,
      title: e.title,
      primaryKeyword,
      kind: e.kind,
      provenance: e.briefMeta?.demo ? "seeded" : "ai",
    });
  }
  return out;
}
