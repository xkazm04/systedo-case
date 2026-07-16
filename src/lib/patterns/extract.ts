/** Deterministic winning-pattern extraction — mines the tenant's own synced
 *  campaigns + AI-score history for reusable lessons (what works, what to avoid,
 *  what optimization moved the needle). No AI, no invention: every pattern is a
 *  rendering of real numbers, so it reconciles with the rest of the app.
 *  Server-only (reads the campaign store). */
import { createHash } from "node:crypto";
import {
  CAMPAIGN_TYPE_LABELS,
  aggregate,
  groupByType,
  withMetrics,
  type Campaign,
  type CampaignType,
} from "@/lib/campaigns/types";
import { getReportHistories, listCampaigns } from "@/lib/campaigns/store";
import { PAID_PORTFOLIO_TARGET_PNO } from "@/lib/targets";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct, fmtSignedPct } from "@/lib/format";
import { evaluate } from "@/lib/lp-exp/compute";
import { SAMPLE_EXPERIMENTS, type LpExperiment } from "@/lib/lp-exp/sample";
import { listExperiments } from "@/lib/lp-exp/store";
import { SAMPLE_ATTRIBUTION, type ChannelPerf } from "@/lib/distribution/sample";
import type { ReportHistoryPoint } from "@/lib/ai-types";
import type { Pattern, PatternCategory } from "./types";

/** Stable id from the title so the same derived pattern doesn't duplicate across
 *  reloads (and so a saved copy can be matched back to its auto source). */
function patternId(title: string): string {
  return createHash("sha1").update(title).digest("hex").slice(0, 16);
}

function mk(
  title: string,
  category: PatternCategory,
  insight: string,
  evidence: string
): Pattern {
  return { id: patternId(title), title, category, insight, evidence, source: "auto", createdAt: "" };
}

/** Pure pattern mining over an already-loaded campaign set + score history —
 *  no I/O, so it is directly unit-testable. `extractPatterns` is the thin store
 *  wrapper below.
 *
 *  `pnoGoal` is the tenant's agreed PNO target (ClientProfile.pnoGoal) — the SAME
 *  bar the reports, alerts and triage measure against, threaded in so mined
 *  patterns can't judge a tenant against a different target than the rest of the
 *  app. Defaults to the paid-portfolio target (0.18) so an unseeded/default tenant
 *  mines byte-identically to before. The target ROAS is its reciprocal. */
export function minePatterns(
  campaigns: Campaign[],
  histories: Record<string, ReportHistoryPoint[]>,
  pnoGoal: number = PAID_PORTFOLIO_TARGET_PNO
): Pattern[] {
  if (campaigns.length === 0) return [];

  const targetPno = pnoGoal;
  const targetRoas = 1 / pnoGoal;
  const rows = campaigns.map(withMetrics);
  const portfolio = aggregate(campaigns);
  const types = groupByType(campaigns);
  const out: Pattern[] = [];

  // 1. Best-performing channel type (a structural lesson worth repeating).
  const bestType = [...types].filter((t) => t.total.cost > 0).sort((a, b) => b.total.roas - a.total.roas)[0];
  if (bestType && bestType.total.roas >= targetRoas) {
    out.push(
      mk(
        `${CAMPAIGN_TYPE_LABELS[bestType.type]} je nejefektivnější typ`,
        "structure",
        `${CAMPAIGN_TYPE_LABELS[bestType.type]} drží nejlepší návratnost — upřednostňujte ho při alokaci rozpočtu.`,
        `ROAS ${fmtMultiple(bestType.total.roas)} při nákladech ${fmtCZK(bestType.total.cost)} (${bestType.total.count} kampaní).`
      )
    );
  }

  // 2. Top campaign over target — a template for scaling.
  const winners = rows.filter((c) => c.cost > 0 && c.roas >= targetRoas).sort((a, b) => b.roas - a.roas);
  if (winners[0]) {
    const w = winners[0];
    out.push(
      mk(
        `Vzor pro škálování: „${w.name}"`,
        "budget",
        `Kampaně tohoto střihu (${CAMPAIGN_TYPE_LABELS[w.type]}) nad cílovým ROAS unesou vyšší rozpočet bez ztráty efektivity.`,
        `ROAS ${fmtMultiple(w.roas)}, PNO ${fmtPct(w.pno)} (cíl ${fmtPct(targetPno, 0)}).`
      )
    );
  }

  // 3. Money pit to avoid — what NOT to repeat.
  const losers = rows
    .filter((c) => c.status === "enabled" && c.cost > 0 && c.roas > 0 && c.roas < targetRoas)
    .map((c) => ({ c, waste: c.cost * (1 - c.roas / targetRoas) }))
    .sort((a, b) => b.waste - a.waste);
  if (losers[0]) {
    const l = losers[0].c;
    out.push(
      mk(
        `Past na rozpočet: profil „${l.name}"`,
        "budget",
        `Kampaně s tímto profilem pálí rozpočet pod cílem — hlídejte je a včas utlumte nebo přestavte.`,
        `ROAS ${fmtMultiple(l.roas)} pod cílem ${fmtMultiple(targetRoas)}; promrhaný odhad ${fmtCZK(Math.round(losers[0].waste))}.`
      )
    );
  }

  // 4. Brand search efficiency (a recurring high-ROAS structural win).
  const brandish = rows
    .filter((c) => c.type === "search" && /brand|značk/i.test(c.name) && c.roas > 0)
    .sort((a, b) => b.roas - a.roas)[0];
  if (brandish) {
    out.push(
      mk(
        "Brandové vyhledávání jako efektivní základ",
        "structure",
        "Samostatná brandová Search kampaň zachytává nejlevnější poptávku — držte ji oddělenou od generického Search.",
        `„${brandish.name}" má ROAS ${fmtMultiple(brandish.roas)} při PNO ${fmtPct(brandish.pno)}.`
      )
    );
  }

  // 5. Optimization that moved the needle (from score history).
  for (const [key, points] of Object.entries(histories)) {
    if (points.length < 2) continue;
    const first = points[0]!.score;
    const last = points[points.length - 1]!.score;
    if (last - first >= 10) {
      const label = key === "overall" ? "portfolia" : "kampaně";
      out.push(
        mk(
          `Optimalizace ${label} zabrala`,
          "trend",
          "Opakované AI vyhodnocení + zásahy zvedly skóre zdraví — pravidelná kontrola se vyplácí.",
          `Skóre ${first} → ${last} napříč ${points.length} vyhodnoceními.`
        )
      );
      break; // one trend pattern is enough
    }
  }

  // 6. Portfolio hitting target — a baseline worth protecting.
  if (portfolio.pno > 0 && portfolio.pno <= targetPno) {
    out.push(
      mk(
        "Portfolio plní cílové PNO",
        "trend",
        "Mix kampaní drží dohodnutou efektivitu — hlavní páka je teď objem, ne škrty.",
        `Celkové PNO ${fmtPct(portfolio.pno)} ≤ cíl ${fmtPct(targetPno, 0)}, ROAS ${fmtMultiple(portfolio.roas)}.`
      )
    );
  }

  return out;
}

/** The tested angle behind a variant label like "B · Důraz na šablony" → "Důraz na
 *  šablony" (the part after the "·" prefix). Falls back to the whole label when
 *  there is no prefix, so a bare hypothesis label still reads sensibly. */
function variantAngle(label: string): string {
  const parts = label.split("·");
  return (parts.length > 1 ? parts.slice(1).join("·") : label).trim();
}

/** Pure `creative`-category miner: a WON landing-page experiment variant becomes a
 *  reusable creative angle. Reads the LP-experiment module's OWN verdict (`evaluate`
 *  from @/lib/lp-exp) so only a statistically significant winner over control is
 *  mined — a leading-but-unproven arm is not a lesson yet. The control→winner CVR
 *  jump and the tested hypothesis are rendered from the stored outcome, so the
 *  pattern reconciles with the experiments module. No I/O → directly unit-testable.
 *  Empty input (or no proven winner) → no patterns. */
export function mineCreativePatterns(experiments: LpExperiment[]): Pattern[] {
  const out: Pattern[] = [];
  for (const exp of experiments) {
    const r = evaluate(exp);
    if (!r.significant || !r.winner) continue;
    const control = r.variants.find((v) => v.isControl);
    if (!control) continue;
    const angle = variantAngle(r.winner.label);
    out.push(
      mk(
        `Vítězný úhel: „${angle}" (${r.cluster})`,
        "creative",
        `Hypotéza „${angle}" zvedla konverzi z ${fmtPct(control.cvr)} na ${fmtPct(r.winner.cvr)} — použijte tento úhel i v dalších kreativách a inzerátech.`,
        `Klastr „${r.cluster}": ${fmtSignedPct(r.winner.uplift)} vs. kontrola, ${fmtPct(r.confidence)} jistota (${fmtInt(r.winner.visitors)} návštěvníků).`
      )
    );
  }
  return out;
}

/** Pure `targeting`-category miner: per-channel CTR outliers from the distribution
 *  learnings become targeting lessons — a channel that clearly beats (or trails)
 *  the mean CTR of its peers is where budget/cílení should shift. Needs ≥3 channels
 *  with reach so "peers" is meaningful; emits at most one over- and one
 *  under-performer, and only when the gap clears the outlier threshold. No I/O →
 *  directly unit-testable. Fewer than 3 channels, or no clear outlier → no patterns. */
export function mineTargetingPatterns(channels: ChannelPerf[]): Pattern[] {
  const rows = channels
    .filter((c) => c.reach > 0)
    .map((c) => ({ channel: c.channel, ctr: c.clicks / c.reach }));
  if (rows.length < 3) return [];

  // Peer mean = the mean CTR of the OTHER channels (excludes the candidate itself),
  // so an outlier is judged against its peers, not against a benchmark it skews.
  const peerMean = (idx: number) => {
    const others = rows.filter((_, i) => i !== idx);
    return others.reduce((a, r) => a + r.ctr, 0) / others.length;
  };
  const withPeer = rows.map((r, i) => ({ ...r, peer: peerMean(i) }));
  const OUTLIER = 0.25; // ≥25 % above / below the peer mean CTR to count as an outlier

  const out: Pattern[] = [];
  const over = [...withPeer]
    .filter((r) => r.peer > 0)
    .sort((a, b) => b.ctr / b.peer - a.ctr / a.peer)[0];
  if (over && over.ctr >= over.peer * (1 + OUTLIER)) {
    out.push(
      mk(
        `Nadvýkonný kanál: ${over.channel}`,
        "targeting",
        `${over.channel} má výrazně vyšší CTR než ostatní kanály — přesuňte sem víc rozpočtu i cílení a stavte na něm jako na primárním kanálu.`,
        `CTR ${fmtPct(over.ctr)} vs. ${fmtPct(over.peer)} průměr ostatních kanálů (${fmtMultiple(over.ctr / over.peer)}).`
      )
    );
  }
  const under = [...withPeer]
    .filter((r) => r.peer > 0 && r.channel !== over?.channel)
    .sort((a, b) => a.ctr / a.peer - b.ctr / b.peer)[0];
  if (under && under.ctr <= under.peer * (1 - OUTLIER)) {
    out.push(
      mk(
        `Podvýkonný kanál: ${under.channel}`,
        "targeting",
        `${under.channel} zaostává za ostatními kanály v CTR — přehodnoťte cílení a kreativu, nebo rozpočet přesuňte na silnější kanály.`,
        `CTR ${fmtPct(under.ctr)} vs. ${fmtPct(under.peer)} průměr ostatních kanálů.`
      )
    );
  }
  return out;
}

/** The creative/targeting lessons mined from the LP-experiment + distribution
 *  modules' resolved data. Both source stores are SAMPLE-ONLY (never persisted —
 *  each module renders per-project-scaled sample data whose CVR/CTR *rates* are
 *  project-invariant), so these lessons are demo-derived, not account-derived.
 *  That is why they are a separate producer from `minePatterns` (which mines the
 *  tenant's own synced campaigns): the library shows them as illustrative lessons
 *  for every tenant, but the AI-prompt path must NOT present them as proven wins
 *  from a live account — see `promptSafePatterns`. The "(ukázková lekce)" suffix
 *  keeps the rendered insight honest wherever it appears. */
export function sampleLessonPatterns(): Pattern[] {
  const mark = (p: Pattern): Pattern => ({ ...p, insight: `${p.insight} (ukázková lekce)` });
  return [
    ...mineCreativePatterns(SAMPLE_EXPERIMENTS),
    ...mineTargetingPatterns(SAMPLE_ATTRIBUTION),
  ].map(mark);
}

/** Truth-in-labeling gate for the AI-prompt path (`getPatternLines`): a LIVE
 *  tenant's prompts must contain only lessons mined from their real data plus
 *  their own manual saves — never the demo-derived sample lessons above (those
 *  would be fabricated evidence "from this account"). A sample/demo tenant keeps
 *  them: there the whole surface is illustrative. Matching is by the stable id
 *  (sha1 of title), so a manually SAVED copy of a sample lesson gets a random
 *  store id and is deliberately kept — the user chose to endorse it. Pure. */
export function promptSafePatterns(patterns: Pattern[], excludeSampleLessons: boolean): Pattern[] {
  if (!excludeSampleLessons) return patterns;
  const sampleIds = new Set(sampleLessonPatterns().map((p) => p.id));
  return patterns.filter((p) => !sampleIds.has(p.id));
}

/** How many chars of raw `evidence` may ride into a prompt line. Auto-mined evidence
 *  is a single short sentence; a hand-written pin can be up to 400 — cap it so the
 *  clause stays compact and never dominates the lesson it backs. */
const EVIDENCE_CLAUSE_MAX = 140;

/** Collapse whitespace + cap the evidence to a short clause (…-elided past the cap).
 *  "" when the pattern carries no proof, so the line falls back to insight-only. Pure. */
export function compactEvidence(evidence: string | undefined): string {
  const s = (evidence ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length <= EVIDENCE_CLAUSE_MAX ? s : `${s.slice(0, EVIDENCE_CLAUSE_MAX - 1).trimEnd()}…`;
}

/** A pattern's PROMPT line (RAG grounding): the reusable insight, PLUS a compact
 *  evidence clause when the pattern carries proof — so the model sees WHICH win
 *  (which campaign / experiment / channel) backs the lesson, not just the claim.
 *
 *  This is dynamic USER-prompt content: the ads + campaign-eval SYSTEM prompts and
 *  schemas are fingerprint-pinned (scripts/llm-eval.mjs), and pattern lines are
 *  injected into the user prompt at request time, so widening the line format does
 *  NOT move any golden snapshot. Pure — directly unit-testable. */
export function patternPromptLine(p: Pattern): string {
  const ev = compactEvidence(p.evidence);
  return ev ? `- ${p.title}: ${p.insight} (doloženo: ${ev})` : `- ${p.title}: ${p.insight}`;
}

/** LIVE creative-pattern handoff: mine a PROJECT's own PERSISTED landing-page
 *  experiments (not the seeded sample) for statistically significant winners, exactly
 *  as `mineCreativePatterns` does for any experiment set. These are NORMAL creative
 *  patterns — NOT marked "(ukázková lekce)" and NOT in the `sampleLessonPatterns` id
 *  set — so `promptSafePatterns` legitimately KEEPS them for a live tenant: a real
 *  experiment's winner IS an account-proven win, unlike the quarantined sample lessons.
 *
 *  The join is by projectId, threaded down from the ad-generator's `resolveAdPatterns`
 *  (which already resolves it for the tenant + brand grounding). No projectId → `[]`,
 *  so the demo / no-project path is byte-identical. Never throws — a store hiccup
 *  degrades to no patterns (via listExperiments). Server-only. */
export async function extractExperimentPatterns(projectId: string | undefined): Promise<Pattern[]> {
  if (!projectId) return [];
  const experiments = await listExperiments(projectId);
  if (experiments.length === 0) return [];
  return mineCreativePatterns(experiments);
}

/** Derive patterns from the tenant's current campaign set + score history, PLUS — when
 *  a `projectId` is threaded through — the project's own persisted LP-experiment winners
 *  (see `extractExperimentPatterns`). Loads campaigns + history from the store, then
 *  delegates to the pure `minePatterns`. See it for the `pnoGoal` contract (defaults to
 *  the paid-portfolio 0.18). The sample-derived creative/targeting lessons are composed
 *  in separately by `getLibrary` via `sampleLessonPatterns` so the prompt path can tell
 *  the two producers apart. No projectId → byte-identical to the campaign-only path.
 *  Server-only. */
export async function extractPatterns(
  tenant: string,
  pnoGoal: number = PAID_PORTFOLIO_TARGET_PNO,
  projectId?: string
): Promise<Pattern[]> {
  return (await extractPatternsWithContext(tenant, pnoGoal, projectId)).patterns;
}

/** The fresh data a contradiction check judges saved pins against: the tenant's own
 *  campaign set + the channel-performance rows, at the tenant's agreed PNO target. */
export interface MiningContext {
  campaigns: Campaign[];
  channels: ChannelPerf[];
  pnoGoal: number;
}

/** As `extractPatterns`, but also returns the fresh `MiningContext` it loaded, so the
 *  caller (getLibrary) can run the contradiction check without a second campaign read
 *  — one load feeds both the auto patterns and the pin-freshness verdict. */
export async function extractPatternsWithContext(
  tenant: string,
  pnoGoal: number = PAID_PORTFOLIO_TARGET_PNO,
  projectId?: string
): Promise<{ patterns: Pattern[]; context: MiningContext }> {
  const experimentPatterns = await extractExperimentPatterns(projectId);
  const campaigns = await listCampaigns(tenant);
  const context: MiningContext = { campaigns, channels: SAMPLE_ATTRIBUTION, pnoGoal };
  if (campaigns.length === 0) return { patterns: experimentPatterns, context };
  const histories = await getReportHistories(tenant);
  return {
    patterns: [...minePatterns(campaigns, histories, pnoGoal), ...experimentPatterns],
    context,
  };
}

// ─── Direction 2 — pinned patterns stop being immortal ───────────────────────────
//
// A saved pin is frozen text: a scaling template stays in the prompts long after its
// campaign craters, because (unlike auto patterns, which are re-mined every request)
// nothing re-checks it. The pure check below re-derives the SUBJECT of an identifiable
// pin from fresh mined data and asks "does the claim still hold?". Only kinds whose
// title names a re-checkable subject are judged; everything else is EXEMPT (documented
// per branch). A contradicted pin is never deleted — it is excluded from prompts and
// flagged in the UI so the human unpins.

const SCALING_PREFIX = "Vzor pro škálování: ";
const BEST_TYPE_SUFFIX = " je nejefektivnější typ";
const OVER_CHANNEL_PREFIX = "Nadvýkonný kanál: ";

/** Strip the display quotes („NAME" / "NAME") + whitespace around a subject pulled
 *  from a pattern title. */
function unquote(s: string): string {
  return s.replace(/^[\s„“”"'‚‘’]+|[\s„“”"'‚‘’]+$/gu, "").trim();
}

function reverseTypeLabels(): Map<string, CampaignType> {
  const m = new Map<string, CampaignType>();
  for (const [type, label] of Object.entries(CAMPAIGN_TYPE_LABELS)) {
    m.set(label, type as CampaignType);
  }
  return m;
}

/** Per-channel CTR + the mean CTR of its PEERS (same recipe as mineTargetingPatterns),
 *  or an empty map when there are too few channels to have peers. */
function channelCtrTable(channels: ChannelPerf[]): Map<string, { ctr: number; peer: number }> {
  const rows = channels
    .filter((c) => c.reach > 0)
    .map((c) => ({ channel: c.channel, ctr: c.clicks / c.reach }));
  const m = new Map<string, { ctr: number; peer: number }>();
  if (rows.length < 3) return m;
  rows.forEach((r, i) => {
    const others = rows.filter((_, j) => j !== i);
    const peer = others.reduce((a, o) => a + o.ctr, 0) / others.length;
    m.set(r.channel, { ctr: r.ctr, peer });
  });
  return m;
}

/** Does fresh data now contradict this SAVED pattern's positive claim? Pure. */
function patternContradicted(
  p: Pattern,
  ctx: {
    rows: ReturnType<typeof withMetrics>[];
    types: ReturnType<typeof groupByType>;
    labelToType: Map<string, CampaignType>;
    channelCtr: Map<string, { ctr: number; peer: number }>;
    targetRoas: number;
  }
): boolean {
  // 1. Scaling template names a campaign → contradicted when that campaign now reads
  //    BELOW the tenant's target ROAS (the pin says "scale this"; the data says stop).
  if (p.category === "budget" && p.title.startsWith(SCALING_PREFIX)) {
    const name = unquote(p.title.slice(SCALING_PREFIX.length)).toLowerCase();
    const row = ctx.rows.find((r) => r.name.trim().toLowerCase() === name);
    return !!row && row.roas > 0 && row.roas < ctx.targetRoas;
  }
  // 2. Best-performing TYPE → contradicted when that type's fresh aggregate falls
  //    below target (it is no longer the efficient base the pin claims).
  if (p.category === "structure" && p.title.endsWith(BEST_TYPE_SUFFIX)) {
    const label = p.title.slice(0, p.title.length - BEST_TYPE_SUFFIX.length).trim();
    const type = ctx.labelToType.get(label);
    if (!type) return false;
    const g = ctx.types.find((t) => t.type === type);
    return !!g && g.total.cost > 0 && g.total.roas < ctx.targetRoas;
  }
  // 3. Over-performing CHANNEL → contradicted when it no longer beats its peers' CTR.
  if (p.category === "targeting" && p.title.startsWith(OVER_CHANNEL_PREFIX)) {
    const channel = p.title.slice(OVER_CHANNEL_PREFIX.length).trim();
    const e = ctx.channelCtr.get(channel);
    return !!e && e.ctr < e.peer;
  }
  // EXEMPT (no reliably re-checkable positive subject): budget traps + underperforming
  // channels are cautions (a recovery isn't a contradiction of a warning); brand-search
  // is evergreen structural advice; creative winners are experiment-proven, not campaign
  // metrics; trend / portfolio-at-target are historical. Hand-written pins that match no
  // template also land here — we never flag what we can't confidently judge.
  return false;
}

/** The ids of SAVED patterns fresh data now contradicts. Empty when there is no fresh
 *  campaign data to judge against (a pin can't be contradicted by nothing). Pure. */
export function contradictedSavedIds(saved: Pattern[], ctx: MiningContext): Set<string> {
  const out = new Set<string>();
  if (ctx.campaigns.length === 0) return out;
  const judge = {
    rows: ctx.campaigns.map(withMetrics),
    types: groupByType(ctx.campaigns),
    labelToType: reverseTypeLabels(),
    channelCtr: channelCtrTable(ctx.channels),
    targetRoas: 1 / ctx.pnoGoal,
  };
  for (const p of saved) {
    if (patternContradicted(p, judge)) out.add(p.id);
  }
  return out;
}
