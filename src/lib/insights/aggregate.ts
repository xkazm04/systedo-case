/** The cross-module signal hub. Each project type's modules emit Recommendations
 *  from their data; `collectRecommendations` gathers and ranks them for the
 *  Overview command center. Server-safe (pure compute over the spine + samples).
 *  As modules move onto live data (Phase D), only the producers below change. */
import type { Project } from "@/lib/projects/types";
import { MODULES, moduleLabel } from "@/lib/projects/modules";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { channelRows, totalsOf } from "@/lib/metrics";
import { createFormatters, type SupportedLocale } from "@/lib/format";
import { computeProfit } from "@/lib/profit/compute";
import { defaultMargins } from "@/lib/profit/sample";
import { SAMPLE_PRODUCTS } from "@/lib/catalog/sample";
import { AT_RISK_DAYS, budgetChangeSet, monthlySeasonality, stockRows } from "@/lib/inventory/compute";
import { SAMPLE_SOURCES } from "@/lib/lead-quality/sample";
import { withMetrics as leadMetrics } from "@/lib/lead-quality/compute";
import { SAMPLE_LEADS } from "@/lib/speed-lead/sample";
import { SLA_TARGET_MIN } from "@/lib/speed-lead/draft";
import { resolveCohorts } from "@/lib/ltv/resolve";
import { ltvSummary } from "@/lib/ltv/compute";
import { SAMPLE_EXPERIMENTS } from "@/lib/lp-exp/sample";
import { evaluate } from "@/lib/lp-exp/compute";
import { SAMPLE_QUERIES, type CompareQuery } from "@/lib/seo-compare/sample";
import { scoreQueries } from "@/lib/seo-compare/compute";
import { SAMPLE_TARGETS, targetsForProject, type LocalTarget } from "@/lib/local/sample";
import { gaps } from "@/lib/local/compute";
import type { KeywordRank } from "@/lib/mappack/sample";
import { sortLadder } from "@/lib/mappack/compute";
import type { ReviewItem } from "@/lib/reviews/sample";
import { bandOf } from "@/lib/reviews/compute";
import { SAMPLE_DECAY } from "@/lib/content-engine/sample";
import { decayingPosts } from "@/lib/content-engine/compute";
import { channelPlanForProject } from "@/lib/organic-channels/sample";
import type { ChannelTrack, OrganicChannel } from "@/lib/organic-channels/types";
import { CHANNEL_KEY_LABELS } from "@/lib/publishing/channel-key";
import type { CadenceCheck } from "@/lib/publishing/types";
import {
  byImpact,
  subjectSlug,
  type Recommendation,
  type RecommendationSnapshot,
  type Severity,
} from "./types";

/** WP W3-A: `subjectKey` sits FOURTH, before the localized title, so the type system
 *  itself forces every producer to supply one — a new rec cannot compile without an
 *  identity. `snapshot` is last and optional: only a producer with a real number
 *  behind its signal passes one (see RecommendationSnapshot's registered keys). */
function rec(
  locale: SupportedLocale,
  module: string,
  severity: Severity,
  subjectKey: string,
  title: string,
  detail: string,
  metric?: string,
  impactCzk?: number,
  snapshot?: RecommendationSnapshot
): Recommendation {
  // Look the module def up defensively: the non-null assertion here threw inside
  // moduleLabel BEFORE the `?? module` fallback could apply, so one renamed/removed
  // module key turned every project Overview into an error page instead of degrading
  // a single recommendation's label. Fall back to the raw key when the def is missing.
  const def = MODULES.find((m) => m.key === module);
  return {
    id: `${module}:${title}`,
    subjectKey,
    module,
    moduleLabel: def ? moduleLabel(def, locale) : module,
    severity,
    title,
    detail,
    metric,
    impactCzk,
    ...(snapshot ? { snapshot } : {}),
  };
}

/** Tag a rec with the provenance of the SIGNAL it was derived from — the exact
 *  pattern localRecs established: each rec reads one signal, so the flag is per-rec,
 *  never per-project. `signalLive` is the caller-threaded liveness of that signal's
 *  resolver seam (fail-CLOSED: unknown → sample, so the worst case is over-disclosure). */
const from = (signalLive: boolean, r: Recommendation): Recommendation =>
  signalLive ? r : { ...r, sample: true };

/** A rec derived from a static illustrative fixture (SAMPLE_PRODUCTS, SAMPLE_LEADS,
 *  SAMPLE_DECAY, seeded per-project samples…) that has NO live import seam yet. Such a
 *  signal can never be live, tenant or demo — so the rec always discloses itself. When
 *  a signal gains a resolver seam (the localRecs / seoQueries treatment), switch its
 *  recs from `fixture(...)` to `from(resolved.live, ...)`. */
const fixture = (r: Recommendation): Recommendation => from(false, r);

function eshopRecs(project: Project, locale: SupportedLocale, metricsLive: boolean): Recommendation[] {
  // Numbers must follow the sentence's language — an English recommendation
  // with "1 234 567 Kč" inside reads as a rendering bug.
  const f = createFormatters(locale);
  const data = getProjectDataset(project);
  const out: Recommendation[] = [];

  // Profit → channels losing money after margin. Provenance follows the performance
  // dataset's seam (`metricsLive` = hasSyncedMetrics, the same truth source the
  // Živá/Ukázková pill reads) — sample until the project has actually synced rows.
  const rows = channelRows(data.channels, totalsOf(data.daily.slice(-90)));
  const { rows: profit } = computeProfit(rows, defaultMargins(data.channels));
  for (const r of profit.filter((p) => !p.profitable)) {
    out.push(from(metricsLive, rec(locale, "zisk", "critical",
      `zisk:unprofitable-channel:${subjectSlug(r.channel)}`,
      locale === "en"
        ? `${r.channel} loses money after margin`
        : `${r.channel} prodělává po marži`,
      locale === "en"
        ? `ROAS ${f.fmtMultiple(r.roas)} is below break-even ${f.fmtMultiple(r.breakEvenRoas)}. Shift budget to profitable channels.`
        : `ROAS ${f.fmtMultiple(r.roas)} je pod bodem zvratu ${f.fmtMultiple(r.breakEvenRoas)}. Přesuňte rozpočet do ziskových kanálů.`,
      f.fmtCZK(r.netProfit), Math.abs(r.netProfit),
      // POAS is the margin-aware profit-on-ad-spend of THIS channel: higher is
      // better, and acting on the advice (shifting budget away, fixing margin)
      // moves it. The registered key lives in types.ts.
      { key: "poas", value: r.poas })));
  }

  // Reference "now" derived from the dataset's last day → deterministic projected dates.
  const lastDate = data.daily.at(-1)?.date;
  const now = lastDate ? new Date(`${lastDate}T00:00:00Z`) : new Date();
  const stock = stockRows(SAMPLE_PRODUCTS, now);

  // Stock → items about to run out. All four stock recs read SAMPLE_PRODUCTS — a
  // static fixture with no warehouse import seam yet — so they are `fixture(...)`
  // (always disclosed) regardless of the metrics seam.
  for (const s of stock.filter((s) => s.status === "pause")) {
    out.push(fixture(rec(locale, "sklad-sezonnost", "warning",
      `sklad-sezonnost:stockout:${subjectSlug(s.product.sku)}`,
      locale === "en"
        ? `${s.product.title} runs out soon`
        : `${s.product.title} brzy dojde`,
      locale === "en"
        ? `Stock for ${Math.round(s.daysOfCover)} days. Consider pausing ads for this product.`
        : `Zásoba na ${Math.round(s.daysOfCover)} dní. Zvažte pozastavení reklamy na tento produkt.`,
      `${Math.round(s.daysOfCover)} ${locale === "en" ? "days" : "dní"}`, s.coverValue,
      { key: "daysOfCover", value: s.daysOfCover })));
  }

  // Stock → early warning: SKUs trending toward stockout (< 14 dní), not yet a hard pauza.
  for (const s of stock.filter((s) => s.atRisk)) {
    out.push(fixture(rec(locale, "sklad-sezonnost", "opportunity",
      `sklad-sezonnost:stockout-risk:${subjectSlug(s.product.sku)}`,
      locale === "en"
        ? `${s.product.title} approaching stockout`
        : `${s.product.title} se blíží vyprodání`,
      locale === "en"
        ? `Stock dropping below ${AT_RISK_DAYS} days (${Math.round(s.daysOfCover)} days left). Restock before you need to pause ads.`
        : `Zásoba klesá pod ${AT_RISK_DAYS} dní (zbývá ${Math.round(s.daysOfCover)} dní). Doplňte sklad včas, než bude nutné pozastavit reklamu.`,
      `${Math.round(s.daysOfCover)} ${locale === "en" ? "days" : "dní"}`, s.coverValue,
      { key: "daysOfCover", value: s.daysOfCover })));
  }

  // Stock → paused SKU with a scheduled restock inside the horizon (resuming).
  for (const s of stock.filter((s) => s.status === "resuming")) {
    out.push(fixture(rec(locale, "sklad-sezonnost", "info",
      `sklad-sezonnost:restock-scheduled:${subjectSlug(s.product.sku)}`,
      locale === "en"
        ? `Refresh: ${s.product.title}`
        : `${s.product.title} se brzy obnoví`,
      locale === "en"
        ? `Out of stock, but restock is scheduled${s.resumeAt ? ` for ${s.resumeAt}` : ""}. Pause ads now, resume after delivery.`
        : `Sklad dojde, ale doskladnění je naplánováno${s.resumeAt ? ` na ${s.resumeAt}` : ""}. Reklamu zatím pozastavte a po doplnění obnovte.`,
      s.resumeAt ?? undefined)));
  }

  // Stock → propose reallocating budget from constrained SKU to fast movers in the
  // same category (top proposed move only, to keep the command center concise).
  const topMove = budgetChangeSet(stock).moves[0];
  if (topMove) {
    out.push(fixture(rec(locale, "sklad-sezonnost", "opportunity",
      `sklad-sezonnost:budget-shift:${subjectSlug(topMove.fromSku)}|${subjectSlug(topMove.toSku)}`,
      locale === "en"
        ? `Shift budget: ${topMove.fromTitle} → ${topMove.toTitle}`
        : `Přesunout rozpočet: ${topMove.fromTitle} → ${topMove.toTitle}`,
      locale === "en"
        ? `${topMove.fromTitle} is stock-constrained. Move part of its budget to fast-moving SKUs in the same category (${topMove.category}).`
        : `${topMove.fromTitle} je omezené zásobou. Přesuňte část rozpočtu na rychloobrátkové SKU ve stejné kategorii (${topMove.category}).`,
      f.fmtCZK(topMove.amountCzk), topMove.amountCzk)));
  }

  // Seasonality → upcoming peak
  const season = monthlySeasonality(data.daily);
  const cur = now.getUTCMonth();
  const next = season[(cur + 1) % 12]!;
  if (next.index >= 1.15) {
    // Seasonality is computed from the same performance dataset as the profit recs,
    // so it follows the same metrics-seam provenance.
    out.push(from(metricsLive, rec(locale, "sklad-sezonnost", "opportunity",
      // The MONTH INDEX, not the (Czech-only) month label — the identity must read
      // the same whichever locale rendered the sentence.
      `sklad-sezonnost:seasonal-peak:${next.month}`,
      locale === "en"
        ? `${next.label} is a seasonal peak`
        : `${next.label} bývá sezónní špička`,
      locale === "en"
        ? `Index ${f.fmtMultiple(next.index)}. Prepare a higher budget and stock in advance.`
        : `Index ${f.fmtMultiple(next.index)}. Připravte vyšší rozpočet a zásoby s předstihem.`,
      f.fmtMultiple(next.index))));
  }
  return out;
}

/** @param seoQueries the project's RESOLVED comparison queries (catalog-generated
 *  when the catalog has plans / named competitors, else the sample set) — threaded
 *  in by the caller (ProjectOverview) exactly as srovnani-seo/page.tsx resolves them,
 *  so the Overview SEO rec scores the same slate the module shows. The aggregator
 *  stays pure and does NO I/O — same precedent as the localRecs signals above.
 *
 *  The LTV rec reads the project's RESOLVED cohorts (`resolveCohorts` — the same pure,
 *  project-varied source the /ltv page consumes), so Overview's "LTV:CAC pod cílem"
 *  can't contradict the /ltv page it links to. Previously it read the global static
 *  SAMPLE_COHORTS, giving every app project the identical (and often divergent) rec. */
function appRecs(project: Project, locale: SupportedLocale, seoQueries: CompareQuery[]): Recommendation[] {
  const f = createFormatters(locale);
  const out: Recommendation[] = [];
  // resolveCohorts is the pure per-project SAMPLE the /ltv page also renders — there
  // is no billing-import seam yet, so the ratio is seeded fiction and says so.
  const ltv = ltvSummary(resolveCohorts(project));
  if (ltv.avgLtvCac < 3) {
    out.push(fixture(rec(locale, "ltv", ltv.avgLtvCac < 1 ? "critical" : "warning",
      // One global subject per project — no entity part.
      "ltv:ltv-cac-below-target",
      locale === "en"
        ? "LTV:CAC below target"
        : "LTV:CAC pod cílem",
      locale === "en"
        ? `Ratio ${f.fmtMultiple(ltv.avgLtvCac)} (target ≥ 3×). Before adding budget, improve retention/ARPU or reduce CAC.`
        : `Poměr ${f.fmtMultiple(ltv.avgLtvCac)} (cíl ≥ 3×). Než přidáte rozpočet, zlepšete retenci/ARPU nebo snižte CAC.`,
      f.fmtMultiple(ltv.avgLtvCac), undefined,
      { key: "ltvCac", value: ltv.avgLtvCac })));
  }
  for (const w of SAMPLE_EXPERIMENTS.map(evaluate).filter((r) => r.significant)) {
    out.push(fixture(rec(locale, "experimenty-lp", "opportunity",
      `experimenty-lp:ship-winner:${subjectSlug(w.cluster)}`,
      locale === "en"
        ? `Ship the winner: ${w.cluster}`
        : `Nasadit vítěze: ${w.cluster}`,
      locale === "en"
        ? `Variant leads conclusively (${f.fmtPct(w.confidence)} confidence). Deploy it as the primary landing page.`
        : `Varianta vede průkazně (${f.fmtPct(w.confidence)} jistota). Nasaďte ji jako hlavní landing page.`)));
  }
  // Even a catalog-generated slate carries SEEDED volumes/difficulty (there is no
  // keyword-tool import) — the volume number in this rec is illustrative either way.
  const top = scoreQueries(seoQueries).find((q) => q.opportunity === "high");
  if (top) {
    out.push(fixture(rec(locale, "srovnani-seo", "opportunity",
      `srovnani-seo:content-gap:${subjectSlug(top.query)}`,
      locale === "en"
        ? `Content for query ${top.query}`
        : `Obsah pro dotaz ${top.query}`,
      locale === "en"
        ? `High opportunity, ${f.fmtInt(top.volume)} searches/mo. Create a comparison page.`
        : `Vysoká příležitost, ${f.fmtInt(top.volume)} hledání/měs. Vytvořte srovnávací stránku.`)));
  }
  return out;
}

function leadgenRecs(locale: SupportedLocale): Recommendation[] {
  const f = createFormatters(locale);
  const out: Recommendation[] = [];
  // Every leadgen signal below (SAMPLE_SOURCES, SAMPLE_LEADS, SAMPLE_TARGETS) is a
  // static fixture with no CRM/inbox import seam yet — all fixture-tagged.
  for (const s of SAMPLE_SOURCES.map(leadMetrics).filter((s) => s.junk)) {
    out.push(fixture(rec(locale, "kvalita-leadu", "warning",
      `kvalita-leadu:junk-source:${subjectSlug(s.source)}`,
      locale === "en"
        ? `${s.source}: cheap but low-quality leads`
        : `${s.source}: levné, ale nekvalitní leady`,
      locale === "en"
        ? `Qualification rate ${f.fmtPct(s.qualRate)}, CPQL ${f.fmtCZK(s.cpql)}. Optimize bidding toward qualified leads.`
        : `Míra kvalifikace ${f.fmtPct(s.qualRate)}, CPQL ${f.fmtCZK(s.cpql)}. Optimalizujte bidding na kvalifikované leady.`,
      f.fmtCZK(s.spend), s.spend,
      // The SAME metric the lead-source diagnosis snapshots (diagnoses/outcome.ts),
      // so the two outcome chips can never disagree about this source.
      { key: "qualRate", value: s.qualRate })));
  }
  const overdue = SAMPLE_LEADS.filter((l) => l.minutesAgo > SLA_TARGET_MIN).length;
  if (overdue > 0) {
    // Tagged rather than suppressed: without the disclosure this "critical" would be
    // a permanent tenant-independent false alarm; the sample chip is exactly the
    // disclosure the type asks for, and the demo Overview keeps its urgency.
    out.push(fixture(rec(locale, "schranka", "critical",
      // The COUNT is the metric, not the identity — a subject key carrying it would
      // mint a new tracked subject every time one more lead slipped the SLA.
      "schranka:sla-breach",
      locale === "en"
        ? `${overdue} leads past SLA`
        : `${overdue} poptávek po SLA`,
      locale === "en"
        ? `Respond within ${SLA_TARGET_MIN} minutes. Response speed determines lead conversion.`
        : `Reagujte do ${SLA_TARGET_MIN} minut. Rychlost reakce rozhoduje o konverzi leadu.`,
      `${overdue}`)));
  }
  const gap = gaps(SAMPLE_TARGETS)[0];
  if (gap) {
    out.push(fixture(rec(locale, "lokalni", "opportunity",
      coverageGapSubjectKey(gap.service, gap.area),
      locale === "en"
        ? `Missing page: ${gap.service} ${gap.area}`
        : `Chybí stránka: ${gap.service} ${gap.area}`,
      locale === "en"
        ? `${f.fmtInt(gap.monthlyVolume)} searches/mo. with no coverage. Deploy a local microsite.`
        : `${f.fmtInt(gap.monthlyVolume)} hledání/měs. bez pokrytí. Nasaďte lokální microsite.`)));
  }
  return out;
}

/** ONE identity for the coverage gap, minted by both the leadgen fallback branch
 *  above and the local producer below — the same service×area is the same tracked
 *  subject whichever branch produced the rec. `|` joins the two entity halves, the
 *  same separator `coverageKey` uses for the same pair. */
function coverageGapSubjectKey(service: string, area: string): string {
  return `lokalni:coverage-gap:${subjectSlug(service)}|${subjectSlug(area)}`;
}

/** Per-signal liveness for a local project — which of the local-signals seams are on
 *  genuinely IMPORTED data and which are still the illustrative seed. A project can be
 *  live on any SUBSET (each seam — ladder, reviews, coverage, locations, pack — imports
 *  independently), so this is a flag per seam, never one project-wide boolean.
 *
 *  Mirrors what `buildLocalDiagnosisRequest` already threads (`ladderLive`/`reviewsLive`):
 *  the aggregator must not be the one surface that renders seeded numbers with no idea
 *  they are seeded. `pack` carries no recommendation of its own yet — it is threaded so
 *  the Overview's provenance picture is complete the moment a pack-derived rec exists. */
export interface LocalLiveness {
  /** coverage matrix (resolveCoverage) is on imported page-presence */
  coverage: boolean;
  /** ranking ladder (resolveLocalLadder) is imported/synced */
  ladder: boolean;
  /** review set (resolveReviews) is imported */
  reviews: boolean;
  /** competitor map pack (resolvePacks) is imported */
  pack: boolean;
}

/** Nothing imported — the honest default for a project that has connected no source.
 *  Fail-CLOSED: an unknown seam counts as sample, so the worst case is over-disclosure. */
export const ALL_SAMPLE: LocalLiveness = {
  coverage: false,
  ladder: false,
  reviews: false,
  pack: false,
};

/** The already-resolved local signals a `local` project's Overview recs read —
 *  threaded in by the caller (ProjectOverview) so the aggregator stays pure and
 *  does NO I/O: coverage targets (catalog-grounded when the catalog has services,
 *  else the per-project sample), the ranking ladder (live-over-sample via
 *  resolveLocalLadder) and the review set (live-over-sample via resolveReviews),
 *  plus `live` — WHICH of those are real (see {@link LocalLiveness}).
 *  Absent → collectRecommendations falls back to the pure per-project sample so a
 *  local project always gets local recs, never content-marketing advice. */
export interface LocalRecsInput {
  targets: LocalTarget[];
  ladder: KeywordRank[];
  reviews: ReviewItem[];
  live: LocalLiveness;
}

/** Recommendations for a `local` project: the coverage gap with the most search
 *  volume, the weakest tracked map-pack position, and a nudge to answer negative
 *  reviews. Pure — reads only the resolved signals the caller threaded in, mirroring
 *  how lokalni/page.tsx resolves them. Was the missing branch that dumped `local`
 *  projects into contentRecs (content-marketing advice on a local Overview). */
function localRecs(locale: SupportedLocale, input: LocalRecsInput): Recommendation[] {
  const f = createFormatters(locale);
  const out: Recommendation[] = [];
  const live = input.live ?? ALL_SAMPLE;
  // Provenance per rec via the module-level `from`: each local rec reads exactly one
  // seam, so a project live on reviews but not on the ladder gets an untagged reviews
  // rec next to a tagged rank rec — which is precisely the truth.

  // Coverage gap → the highest-volume uncovered service×area (from the project's
  // RESOLVED targets, not the hardcoded HVAC sample the leadgen branch used).
  const gap = gaps(input.targets)[0];
  if (gap) {
    out.push(from(live.coverage, rec(locale, "lokalni", "opportunity",
      coverageGapSubjectKey(gap.service, gap.area),
      locale === "en"
        ? `Missing page: ${gap.service} ${gap.area}`
        : `Chybí stránka: ${gap.service} ${gap.area}`,
      locale === "en"
        ? `${f.fmtInt(gap.monthlyVolume)} searches/mo. with no coverage. Deploy a local microsite.`
        : `${f.fmtInt(gap.monthlyVolume)} hledání/měs. bez pokrytí. Nasaďte lokální microsite.`,
      `${f.fmtInt(gap.monthlyVolume)}/${locale === "en" ? "mo." : "měs."}`, gap.monthlyVolume)));
  }

  // Weakest position → the tracked keyword furthest from the map pack (worst current
  // rank), so the Overview points at the combo most worth pushing into the top 3.
  const weakest = sortLadder(input.ladder).at(-1);
  if (weakest && weakest.current > 3) {
    out.push(from(live.ladder, rec(locale, "lokalni", "warning",
      `lokalni:weak-rank:${subjectSlug(weakest.keyword)}|${subjectSlug(weakest.area)}`,
      locale === "en"
        ? `Weak position: ${weakest.keyword}`
        : `Slabá pozice: ${weakest.keyword}`,
      locale === "en"
        ? `Ranks #${weakest.current} in ${weakest.area} (best #${weakest.best}), outside the top 3. Strengthen the page + GBP to reach the map pack.`
        : `V oblasti ${weakest.area} je na pozici #${weakest.current} (nejlépe #${weakest.best}), mimo top 3. Posilte stránku a Google Business Profile pro vstup do map.`,
      `#${weakest.current}`)));
  }

  // Reviews → unanswered negative reviews drag reputation; nudge to reply.
  const negative = input.reviews.filter((r) => bandOf(r.rating) === "negative").length;
  if (negative > 0) {
    out.push(from(live.reviews, rec(locale, "lokalni", "warning",
      // Count in the metric, never in the identity (see schranka:sla-breach).
      "lokalni:unanswered-negative-reviews",
      locale === "en"
        ? `${negative} negative reviews need a reply`
        : `${negative} negativních recenzí čeká na odpověď`,
      locale === "en"
        ? `Public negative reviews left unanswered erode trust. Reply promptly to show you resolve issues.`
        : `Nezodpovězené negativní recenze snižují důvěru. Reagujte včas a ukažte, že problémy řešíte.`,
      `${negative}`)));
  }

  return out;
}

function contentRecs(locale: SupportedLocale): Recommendation[] {
  const f = createFormatters(locale);
  const out: Recommendation[] = [];
  // SAMPLE_DECAY is a static fixture (no Search Console import seam) → always tagged.
  for (const p of decayingPosts(SAMPLE_DECAY)) {
    out.push(fixture(rec(locale, "obsahovy-engine", p.trafficChangePct <= -0.3 ? "warning" : "info",
      `obsahovy-engine:decaying-post:${subjectSlug(p.title)}`,
      locale === "en"
        ? `Refresh: ${p.title}`
        : `Obnovit: ${p.title}`,
      locale === "en"
        ? `Traffic ${f.fmtPct(p.trafficChangePct)} year-on-year. Update and re-link into the cluster.`
        : `Návštěvnost ${f.fmtPct(p.trafficChangePct)} meziročně. Aktualizujte a znovu prolinkujte do klastru.`,
      f.fmtPct(p.trafficChangePct), undefined,
      // Signed YoY change: a decaying post recovering means this rises. A negative
      // baseline is handled by the ledger's |base| denominator.
      { key: "trafficChangePct", value: p.trafficChangePct })));
  }
  return out;
}

/** The already-resolved channel plan the Overview rec reads — threaded in by the
 *  caller (resolveChannelRecsInput) exactly like LocalRecsInput, so the aggregator
 *  stays pure and free of the server-only organic-channels store. */
export interface ChannelRecsInput {
  /** the ACTIVE plan: the tenant's pinned AI plan when there is one, else the seed */
  channels: OrganicChannel[];
  /** channelId → tracked lifecycle; a channel already being worked is not a "next" */
  tracks: Record<string, ChannelTrack>;
  /** "ai" only for a plan the tenant generated and pinned; a degraded store read
   *  resolves to the sample and must therefore report "sample" (fail-CLOSED). */
  source: "sample" | "ai";
}

/** The single best zero-ad-spend visibility opportunity, surfaced across every
 *  project type — the fastest free channel to get seen (low effort, high fit).
 *  Points at the Kanály module, where the full plan + first steps live.
 *
 *  Reads the SAME plan the module shows. It used to compute from
 *  `channelPlanForProject` unconditionally, so a tenant who had generated and
 *  pinned an AI plan was still recommended a channel off the seeded list — the
 *  Overview and `/kanaly` disagreed about what the plan even contained, and the
 *  rec kept its "ukázková data" badge on a channel the tenant's own model chose.
 *  The selection rule is the module's own quick-win rule (OrganicChannels.tsx:
 *  `effort === "low" && fit >= 70`, untracked), so the callout and the rec name
 *  the same channel. Untracked FIRST: a channel already in the lifecycle is not
 *  the next thing to start. The Overview always wants one item, so it falls back
 *  past the quick-win bar rather than going silent. */
function channelRecs(
  project: Project,
  locale: SupportedLocale,
  input?: ChannelRecsInput | null
): Recommendation[] {
  // No threaded plan → the seeded per-project sample, labelled as such. Same
  // fail-closed shape as the local/SEO fallbacks above.
  const plan = input ?? {
    channels: channelPlanForProject(project),
    tracks: {},
    source: "sample" as const,
  };
  const isQuickWin = (c: OrganicChannel) => c.effort === "low" && c.fit >= 70;
  const untracked = plan.channels.filter((c) => !plan.tracks[c.id]);
  // Untracked exhausts BEFORE tracked: a channel already in the lifecycle is work
  // the tenant started, so it is never "the next free channel to get seen on" — not
  // even when it is the only one clearing the quick-win bar. Both plans arrive
  // sorted by fit descending, so `[0]` is the best-fit member of its group.
  const quickWin =
    untracked.find(isQuickWin) ??
    untracked[0] ??
    plan.channels.find(isQuickWin) ??
    plan.channels[0];
  if (!quickWin) return [];
  // The fallback chain deliberately goes PAST the quick-win bar rather than going
  // silent — but the body text then described the pick instead of the rule, and
  // said "low effort, high fit" about a channel that is provably neither (the
  // pinned case in insights-channel-rec.test.mjs picks a high-effort one). A
  // recommendation that misstates the thing it is recommending is the same trust
  // defect as a seeded number without its badge, so the copy follows the pick.
  const quick = isQuickWin(quickWin);
  // A seeded plan's fit scores are illustrative and wear the badge; a pinned AI
  // plan is the tenant's own resolved data and must not be called sample.
  return [
    from(plan.source === "ai", rec(
      locale,
      "kanaly",
      "opportunity",
      // The channel's own stable slug (`OrganicChannel.id`), never its display name.
      // No snapshot: `fit` is a scoring constant of the plan, not something acting on
      // the advice moves, so a snapshot here would mint permanent "unchanged" chips.
      `kanaly:free-channel:${subjectSlug(quickWin.id)}`,
      locale === "en" ? `Free channel: ${quickWin.name}` : `Kanál zdarma: ${quickWin.name}`,
      quick
        ? locale === "en"
          ? `Low-effort, high-fit organic channel (fit ${quickWin.fit}). Get visible without an ad budget. Open the plan for the first steps.`
          : `Bezplatný kanál s nízkou náročností a vysokou vhodností (fit ${quickWin.fit}). Získejte viditelnost bez rozpočtu na reklamu. V plánu máte první kroky.`
        : locale === "en"
          ? `The best-fitting free channel you haven't started yet (fit ${quickWin.fit}) — the plan has no low-effort quick win left right now. Get visible without an ad budget. Open the plan for the first steps.`
          : `Nejlépe sedící bezplatný kanál, který ještě nemáte rozpracovaný (fit ${quickWin.fit}) — rychlou výhru s nízkou náročností teď plán nenabízí. Získejte viditelnost bez rozpočtu na reklamu. V plánu máte první kroky.`,
      `fit ${quickWin.fit}`
    )),
  ];
}

/** The publishing calendar's cadence checks for the CURRENT week, threaded by the
 *  caller (`weekCadence` over the resolved calendar — async I/O stays out of this
 *  pure aggregator). */
export interface PublishingRecsInput {
  checks: CadenceCheck[];
}

/** Cadence recs — the two things a per-channel cap can be wrong about, once it is
 *  actually enforced.
 *
 *  Both are derived from the tenant's OWN stores (their tracked caps, their four
 *  schedulers' items), so neither is ever fixture-tagged: there is no sample path
 *  into this producer at all. A caller that has not threaded the calendar gets no
 *  recs rather than invented ones — the same fail-closed posture as the local and
 *  SEO seams, expressed as silence instead of a labelled guess.
 *
 *  OVER the cap is a warning, not a critical: it can only happen through a
 *  deliberate human override (or a cap lowered after the fact), so it is a "you
 *  chose this, here it is on the record" — never an alarm about a rule the app
 *  enforced anyway. ZERO on a capped channel is the opposite failure and only an
 *  info: the operator set a cadence for this channel and has published nothing to
 *  it this week. */
function publishingRecs(
  locale: SupportedLocale,
  input?: PublishingRecsInput | null
): Recommendation[] {
  if (!input) return [];
  const out: Recommendation[] = [];
  for (const check of input.checks) {
    if (check.cap === null) continue;
    const name = CHANNEL_KEY_LABELS[check.channel];
    if (check.count > check.cap) {
      out.push(
        rec(
          locale,
          "kanaly",
          "warning",
          // The raw ChannelKey, not CHANNEL_KEY_LABELS[...] — the label is display.
          `kanaly:over-cap:${subjectSlug(check.channel)}`,
          locale === "en" ? `${name}: over the cadence cap` : `${name}: nad limitem kadence`,
          locale === "en"
            ? `${check.count} items are planned this week against a cap of ${check.cap}. The cap is enforced when scheduling, so this week was let through by an explicit override — thin it out or raise the cap in Kanály.`
            : `Na tento týden je naplánováno ${check.count} položek proti limitu ${check.cap}. Limit se vynucuje při plánování, takže tento týden prošel výslovným potvrzením — ubere, nebo limit zvyšte v Kanálech.`,
          `${check.count}/${check.cap}`
        )
      );
    } else if (check.count === 0) {
      out.push(
        rec(
          locale,
          "kanaly",
          "info",
          `kanaly:zero-planned:${subjectSlug(check.channel)}`,
          locale === "en" ? `${name}: nothing planned this week` : `${name}: tento týden nic v plánu`,
          locale === "en"
            ? `You set a cadence of ${check.cap}× a week for this channel and nothing is planned on it. Open the plan and fill the week.`
            : `Pro tento kanál máte nastavenou kadenci ${check.cap}× týdně a není na něm nic naplánováno. Otevřete plán a týden zaplňte.`,
          `0/${check.cap}`
        )
      );
    }
  }
  return out;
}

/** All recommendations for a project, ranked by impact (severity bucket, then
 *  money at stake) so the highest-leverage items lead — see {@link byImpact}. */
export function collectRecommendations(
  project: Project,
  locale: SupportedLocale = "cs",
  /** resolved local signals for a `local` project, threaded by the caller (async
   *  I/O stays out of this pure aggregator). Omitted → a pure per-project sample
   *  fallback, so a local project still gets local recs (never content advice). */
  local?: LocalRecsInput | null,
  /** resolved comparison queries for an `app` project's SEO rec, threaded by the
   *  caller (mirrors srovnani-seo/page.tsx). Omitted → the static SAMPLE_QUERIES,
   *  so an app project without a resolved slate behaves exactly as before. */
  seoQueries?: CompareQuery[] | null,
  /** liveness of the performance-dataset seam (`hasSyncedMetrics` — the same truth
   *  source the Živá/Ukázková pill reads), threaded by the caller. Governs the recs
   *  computed from the project dataset (profit channels, seasonality). Fail-CLOSED:
   *  omitted → false → those recs disclose themselves as sample-derived. */
  metricsLive = false,
  /** the project's ACTIVE channel plan, resolved by the caller the way /kanaly does
   *  (pinned AI plan else the seed, statuses merged in). Omitted → the seeded plan,
   *  sample-tagged — exactly what this rec did before the seam existed. */
  channelPlan?: ChannelRecsInput | null,
  /** the project's publishing calendar cadence checks for the CURRENT week, resolved
   *  by the caller (`weekCadence` over `resolvePublishingCalendar`). Omitted → no
   *  cadence recs at all: this producer has no sample path, so a caller that has not
   *  adopted the seam is byte-identical to before it existed. */
  publishing?: PublishingRecsInput | null
): Recommendation[] {
  const typeRecs =
    project.type === "eshop"
      ? eshopRecs(project, locale, metricsLive)
      : project.type === "app"
        ? appRecs(project, locale, seoQueries ?? SAMPLE_QUERIES)
        : project.type === "leadgen"
          ? leadgenRecs(locale)
          : project.type === "local"
            ? localRecs(
                locale,
                // No threaded signals → the pure per-project SAMPLE, and it is labelled
                // as such (ALL_SAMPLE): a fallback rec is illustrative by construction.
                local ?? { targets: targetsForProject(project), ladder: [], reviews: [], live: ALL_SAMPLE }
              )
            : contentRecs(locale);
  return [
    ...typeRecs,
    ...channelRecs(project, locale, channelPlan),
    ...publishingRecs(locale, publishing),
  ].sort(byImpact);
}
