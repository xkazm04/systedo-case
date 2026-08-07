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
import { byImpact, type Recommendation, type Severity } from "./types";

function rec(
  locale: SupportedLocale,
  module: string,
  severity: Severity,
  title: string,
  detail: string,
  metric?: string,
  impactCzk?: number
): Recommendation {
  // Look the module def up defensively: the non-null assertion here threw inside
  // moduleLabel BEFORE the `?? module` fallback could apply, so one renamed/removed
  // module key turned every project Overview into an error page instead of degrading
  // a single recommendation's label. Fall back to the raw key when the def is missing.
  const def = MODULES.find((m) => m.key === module);
  return {
    id: `${module}:${title}`,
    module,
    moduleLabel: def ? moduleLabel(def, locale) : module,
    severity,
    title,
    detail,
    metric,
    impactCzk,
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
      locale === "en"
        ? `${r.channel} loses money after margin`
        : `${r.channel} prodělává po marži`,
      locale === "en"
        ? `ROAS ${f.fmtMultiple(r.roas)} is below break-even ${f.fmtMultiple(r.breakEvenRoas)}. Shift budget to profitable channels.`
        : `ROAS ${f.fmtMultiple(r.roas)} je pod bodem zvratu ${f.fmtMultiple(r.breakEvenRoas)}. Přesuňte rozpočet do ziskových kanálů.`,
      f.fmtCZK(r.netProfit), Math.abs(r.netProfit))));
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
      locale === "en"
        ? `${s.product.title} runs out soon`
        : `${s.product.title} brzy dojde`,
      locale === "en"
        ? `Stock for ${Math.round(s.daysOfCover)} days. Consider pausing ads for this product.`
        : `Zásoba na ${Math.round(s.daysOfCover)} dní. Zvažte pozastavení reklamy na tento produkt.`,
      `${Math.round(s.daysOfCover)} ${locale === "en" ? "days" : "dní"}`, s.coverValue)));
  }

  // Stock → early warning: SKUs trending toward stockout (< 14 dní), not yet a hard pauza.
  for (const s of stock.filter((s) => s.atRisk)) {
    out.push(fixture(rec(locale, "sklad-sezonnost", "opportunity",
      locale === "en"
        ? `${s.product.title} approaching stockout`
        : `${s.product.title} se blíží vyprodání`,
      locale === "en"
        ? `Stock dropping below ${AT_RISK_DAYS} days (${Math.round(s.daysOfCover)} days left). Restock before you need to pause ads.`
        : `Zásoba klesá pod ${AT_RISK_DAYS} dní (zbývá ${Math.round(s.daysOfCover)} dní). Doplňte sklad včas, než bude nutné pozastavit reklamu.`,
      `${Math.round(s.daysOfCover)} ${locale === "en" ? "days" : "dní"}`, s.coverValue)));
  }

  // Stock → paused SKU with a scheduled restock inside the horizon (resuming).
  for (const s of stock.filter((s) => s.status === "resuming")) {
    out.push(fixture(rec(locale, "sklad-sezonnost", "info",
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
      locale === "en"
        ? "LTV:CAC below target"
        : "LTV:CAC pod cílem",
      locale === "en"
        ? `Ratio ${f.fmtMultiple(ltv.avgLtvCac)} (target ≥ 3×). Before adding budget, improve retention/ARPU or reduce CAC.`
        : `Poměr ${f.fmtMultiple(ltv.avgLtvCac)} (cíl ≥ 3×). Než přidáte rozpočet, zlepšete retenci/ARPU nebo snižte CAC.`,
      f.fmtMultiple(ltv.avgLtvCac))));
  }
  for (const w of SAMPLE_EXPERIMENTS.map(evaluate).filter((r) => r.significant)) {
    out.push(fixture(rec(locale, "experimenty-lp", "opportunity",
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
      locale === "en"
        ? `${s.source}: cheap but low-quality leads`
        : `${s.source}: levné, ale nekvalitní leady`,
      locale === "en"
        ? `Qualification rate ${f.fmtPct(s.qualRate)}, CPQL ${f.fmtCZK(s.cpql)}. Optimize bidding toward qualified leads.`
        : `Míra kvalifikace ${f.fmtPct(s.qualRate)}, CPQL ${f.fmtCZK(s.cpql)}. Optimalizujte bidding na kvalifikované leady.`,
      f.fmtCZK(s.spend), s.spend)));
  }
  const overdue = SAMPLE_LEADS.filter((l) => l.minutesAgo > SLA_TARGET_MIN).length;
  if (overdue > 0) {
    // Tagged rather than suppressed: without the disclosure this "critical" would be
    // a permanent tenant-independent false alarm; the sample chip is exactly the
    // disclosure the type asks for, and the demo Overview keeps its urgency.
    out.push(fixture(rec(locale, "schranka", "critical",
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
      locale === "en"
        ? `Missing page: ${gap.service} ${gap.area}`
        : `Chybí stránka: ${gap.service} ${gap.area}`,
      locale === "en"
        ? `${f.fmtInt(gap.monthlyVolume)} searches/mo. with no coverage. Deploy a local microsite.`
        : `${f.fmtInt(gap.monthlyVolume)} hledání/měs. bez pokrytí. Nasaďte lokální microsite.`)));
  }
  return out;
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
      locale === "en"
        ? `Refresh: ${p.title}`
        : `Obnovit: ${p.title}`,
      locale === "en"
        ? `Traffic ${f.fmtPct(p.trafficChangePct)} year-on-year. Update and re-link into the cluster.`
        : `Návštěvnost ${f.fmtPct(p.trafficChangePct)} meziročně. Aktualizujte a znovu prolinkujte do klastru.`,
      f.fmtPct(p.trafficChangePct))));
  }
  return out;
}

/** The single best zero-ad-spend visibility opportunity, surfaced across every
 *  project type — the fastest free channel to get seen (low effort, high fit).
 *  Points at the Kanály module, where the full plan + first steps live. */
function channelRecs(project: Project, locale: SupportedLocale): Recommendation[] {
  const plan = channelPlanForProject(project);
  const quickWin = plan.find((c) => c.effort === "low" && c.fit >= 70) ?? plan[0];
  if (!quickWin) return [];
  // channelPlanForProject is a seeded per-project plan (fit scores are illustrative).
  return [
    fixture(rec(
      locale,
      "kanaly",
      "opportunity",
      locale === "en" ? `Free channel: ${quickWin.name}` : `Kanál zdarma: ${quickWin.name}`,
      locale === "en"
        ? `Low-effort, high-fit organic channel (fit ${quickWin.fit}). Get visible without an ad budget. Open the plan for the first steps.`
        : `Bezplatný kanál s nízkou náročností a vysokou vhodností (fit ${quickWin.fit}). Získejte viditelnost bez rozpočtu na reklamu. V plánu máte první kroky.`,
      `fit ${quickWin.fit}`
    )),
  ];
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
  metricsLive = false
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
  return [...typeRecs, ...channelRecs(project, locale)].sort(byImpact);
}
