/** The cross-module signal hub. Each project type's modules emit Recommendations
 *  from their data; `collectRecommendations` gathers and ranks them for the
 *  Overview command center. Server-safe (pure compute over the spine + samples).
 *  As modules move onto live data (Phase D), only the producers below change. */
import type { Project } from "@/lib/projects/types";
import { MODULES } from "@/lib/projects/modules";
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
import { SAMPLE_COHORTS } from "@/lib/ltv/sample";
import { ltvSummary } from "@/lib/ltv/compute";
import { SAMPLE_EXPERIMENTS } from "@/lib/lp-exp/sample";
import { evaluate } from "@/lib/lp-exp/compute";
import { SAMPLE_QUERIES } from "@/lib/seo-compare/sample";
import { scoreQueries } from "@/lib/seo-compare/compute";
import { SAMPLE_TARGETS } from "@/lib/local/sample";
import { gaps } from "@/lib/local/compute";
import { SAMPLE_DECAY } from "@/lib/content-engine/sample";
import { decayingPosts } from "@/lib/content-engine/compute";
import { byImpact, type Recommendation, type Severity } from "./types";

const moduleLabel = (key: string) => MODULES.find((m) => m.key === key)?.label ?? key;

function rec(
  module: string,
  severity: Severity,
  title: string,
  detail: string,
  metric?: string,
  impactCzk?: number
): Recommendation {
  return { id: `${module}:${title}`, module, moduleLabel: moduleLabel(module), severity, title, detail, metric, impactCzk };
}

function eshopRecs(project: Project, locale: SupportedLocale): Recommendation[] {
  // Numbers must follow the sentence's language — an English recommendation
  // with "1 234 567 Kč" inside reads as a rendering bug.
  const f = createFormatters(locale);
  const data = getProjectDataset(project);
  const out: Recommendation[] = [];

  // Profit → channels losing money after margin
  const rows = channelRows(data.channels, totalsOf(data.daily.slice(-90)));
  const { rows: profit } = computeProfit(rows, defaultMargins(data.channels));
  for (const r of profit.filter((p) => !p.profitable)) {
    out.push(rec("zisk", "critical",
      locale === "en"
        ? `${r.channel} loses money after margin`
        : `${r.channel} prodělává po marži`,
      locale === "en"
        ? `ROAS ${f.fmtMultiple(r.roas)} is below break-even ${f.fmtMultiple(r.breakEvenRoas)}. Shift budget to profitable channels.`
        : `ROAS ${f.fmtMultiple(r.roas)} je pod bodem zvratu ${f.fmtMultiple(r.breakEvenRoas)}. Přesuňte rozpočet do ziskových kanálů.`,
      f.fmtCZK(r.netProfit), Math.abs(r.netProfit)));
  }

  // Reference "now" derived from the dataset's last day → deterministic projected dates.
  const lastDate = data.daily.at(-1)?.date;
  const now = lastDate ? new Date(`${lastDate}T00:00:00Z`) : new Date();
  const stock = stockRows(SAMPLE_PRODUCTS, now);

  // Stock → items about to run out
  for (const s of stock.filter((s) => s.status === "pause")) {
    out.push(rec("sklad-sezonnost", "warning",
      locale === "en"
        ? `${s.product.title} runs out soon`
        : `${s.product.title} brzy dojde`,
      locale === "en"
        ? `Stock for ${Math.round(s.daysOfCover)} days — consider pausing ads for this product.`
        : `Zásoba na ${Math.round(s.daysOfCover)} dní — zvažte pozastavení reklamy na tento produkt.`,
      `${Math.round(s.daysOfCover)} ${locale === "en" ? "days" : "dní"}`, s.coverValue));
  }

  // Stock → early warning: SKUs trending toward stockout (< 14 dní), not yet a hard pauza.
  for (const s of stock.filter((s) => s.atRisk)) {
    out.push(rec("sklad-sezonnost", "opportunity",
      locale === "en"
        ? `${s.product.title} approaching stockout`
        : `${s.product.title} se blíží vyprodání`,
      locale === "en"
        ? `Stock dropping below ${AT_RISK_DAYS} days (${Math.round(s.daysOfCover)} days left) — restock before you need to pause ads.`
        : `Zásoba klesá pod ${AT_RISK_DAYS} dní (zbývá ${Math.round(s.daysOfCover)} dní) — doplňte sklad včas, než bude nutné pozastavit reklamu.`,
      `${Math.round(s.daysOfCover)} ${locale === "en" ? "days" : "dní"}`, s.coverValue));
  }

  // Stock → paused SKU with a scheduled restock inside the horizon (resuming).
  for (const s of stock.filter((s) => s.status === "resuming")) {
    out.push(rec("sklad-sezonnost", "info",
      locale === "en"
        ? `Refresh: ${s.product.title}`
        : `${s.product.title} se brzy obnoví`,
      locale === "en"
        ? `Out of stock, but restock is scheduled${s.resumeAt ? ` for ${s.resumeAt}` : ""} — pause ads now, resume after delivery.`
        : `Sklad dojde, ale doskladnění je naplánováno${s.resumeAt ? ` na ${s.resumeAt}` : ""} — reklamu zatím pozastavte a po doplnění obnovte.`,
      s.resumeAt ?? undefined));
  }

  // Stock → propose reallocating budget from constrained SKU to fast movers in the
  // same category (top proposed move only, to keep the command center concise).
  const topMove = budgetChangeSet(stock).moves[0];
  if (topMove) {
    out.push(rec("sklad-sezonnost", "opportunity",
      locale === "en"
        ? `Shift budget: ${topMove.fromTitle} → ${topMove.toTitle}`
        : `Přesunout rozpočet: ${topMove.fromTitle} → ${topMove.toTitle}`,
      locale === "en"
        ? `${topMove.fromTitle} is stock-constrained — move part of its budget to fast-moving SKUs in the same category (${topMove.category}).`
        : `${topMove.fromTitle} je omezené zásobou — přesuňte část rozpočtu na rychloobrátkové SKU ve stejné kategorii (${topMove.category}).`,
      f.fmtCZK(topMove.amountCzk), topMove.amountCzk));
  }

  // Seasonality → upcoming peak
  const season = monthlySeasonality(data.daily);
  const cur = now.getUTCMonth();
  const next = season[(cur + 1) % 12]!;
  if (next.index >= 1.15) {
    out.push(rec("sklad-sezonnost", "opportunity",
      locale === "en"
        ? `${next.label} is a seasonal peak`
        : `${next.label} bývá sezónní špička`,
      locale === "en"
        ? `Index ${f.fmtMultiple(next.index)} — prepare a higher budget and stock in advance.`
        : `Index ${f.fmtMultiple(next.index)} — připravte vyšší rozpočet a zásoby s předstihem.`,
      f.fmtMultiple(next.index)));
  }
  return out;
}

function appRecs(locale: SupportedLocale): Recommendation[] {
  const f = createFormatters(locale);
  const out: Recommendation[] = [];
  const ltv = ltvSummary(SAMPLE_COHORTS);
  if (ltv.avgLtvCac < 3) {
    out.push(rec("ltv", ltv.avgLtvCac < 1 ? "critical" : "warning",
      locale === "en"
        ? "LTV:CAC below target"
        : "LTV:CAC pod cílem",
      locale === "en"
        ? `Ratio ${f.fmtMultiple(ltv.avgLtvCac)} (target ≥ 3×). Before adding budget, improve retention/ARPU or reduce CAC.`
        : `Poměr ${f.fmtMultiple(ltv.avgLtvCac)} (cíl ≥ 3×). Než přidáte rozpočet, zlepšete retenci/ARPU nebo snižte CAC.`,
      f.fmtMultiple(ltv.avgLtvCac)));
  }
  for (const w of SAMPLE_EXPERIMENTS.map(evaluate).filter((r) => r.significant)) {
    out.push(rec("experimenty-lp", "opportunity",
      locale === "en"
        ? `Ship the winner: ${w.cluster}`
        : `Nasadit vítěze: ${w.cluster}`,
      locale === "en"
        ? `Variant leads conclusively (${f.fmtPct(w.confidence)} confidence). Deploy it as the primary landing page.`
        : `Varianta vede průkazně (${f.fmtPct(w.confidence)} jistota). Nasaďte ji jako hlavní landing page.`));
  }
  const top = scoreQueries(SAMPLE_QUERIES).find((q) => q.opportunity === "high");
  if (top) {
    out.push(rec("srovnani-seo", "opportunity",
      locale === "en"
        ? `Content for query ${top.query}`
        : `Obsah pro dotaz ${top.query}`,
      locale === "en"
        ? `High opportunity, ${f.fmtInt(top.volume)} searches/mo. Create a comparison page.`
        : `Vysoká příležitost, ${f.fmtInt(top.volume)} hledání/měs. Vytvořte srovnávací stránku.`));
  }
  return out;
}

function leadgenRecs(locale: SupportedLocale): Recommendation[] {
  const f = createFormatters(locale);
  const out: Recommendation[] = [];
  for (const s of SAMPLE_SOURCES.map(leadMetrics).filter((s) => s.junk)) {
    out.push(rec("kvalita-leadu", "warning",
      locale === "en"
        ? `${s.source}: cheap but low-quality leads`
        : `${s.source}: levné, ale nekvalitní leady`,
      locale === "en"
        ? `Qualification rate ${f.fmtPct(s.qualRate)}, CPQL ${f.fmtCZK(s.cpql)}. Optimise bidding toward qualified leads.`
        : `Míra kvalifikace ${f.fmtPct(s.qualRate)}, CPQL ${f.fmtCZK(s.cpql)}. Optimalizujte bidding na kvalifikované leady.`,
      f.fmtCZK(s.spend), s.spend));
  }
  const overdue = SAMPLE_LEADS.filter((l) => l.minutesAgo > SLA_TARGET_MIN).length;
  if (overdue > 0) {
    out.push(rec("rychla-reakce", "critical",
      locale === "en"
        ? `${overdue} leads past SLA`
        : `${overdue} poptávek po SLA`,
      locale === "en"
        ? `Respond within ${SLA_TARGET_MIN} minutes — response speed determines lead conversion.`
        : `Reagujte do ${SLA_TARGET_MIN} minut — rychlost reakce rozhoduje o konverzi leadu.`,
      `${overdue}`));
  }
  const gap = gaps(SAMPLE_TARGETS)[0];
  if (gap) {
    out.push(rec("lokalni", "opportunity",
      locale === "en"
        ? `Missing page: ${gap.service} ${gap.area}`
        : `Chybí stránka: ${gap.service} ${gap.area}`,
      locale === "en"
        ? `${f.fmtInt(gap.monthlyVolume)} searches/mo. with no coverage — deploy a local microsite.`
        : `${f.fmtInt(gap.monthlyVolume)} hledání/měs. bez pokrytí — nasaďte lokální microsite.`));
  }
  return out;
}

function contentRecs(locale: SupportedLocale): Recommendation[] {
  const f = createFormatters(locale);
  const out: Recommendation[] = [];
  for (const p of decayingPosts(SAMPLE_DECAY)) {
    out.push(rec("obsahovy-engine", p.trafficChangePct <= -0.3 ? "warning" : "info",
      locale === "en"
        ? `Refresh: ${p.title}`
        : `Obnovit: ${p.title}`,
      locale === "en"
        ? `Traffic ${f.fmtPct(p.trafficChangePct)} year-on-year. Update and re-link into the cluster.`
        : `Návštěvnost ${f.fmtPct(p.trafficChangePct)} meziročně. Aktualizujte a znovu prolinkujte do klastru.`,
      f.fmtPct(p.trafficChangePct)));
  }
  return out;
}

/** All recommendations for a project, ranked by impact (severity bucket, then
 *  money at stake) so the highest-leverage items lead — see {@link byImpact}. */
export function collectRecommendations(project: Project, locale: SupportedLocale = "cs"): Recommendation[] {
  const recs =
    project.type === "eshop"
      ? eshopRecs(project, locale)
      : project.type === "app"
        ? appRecs(locale)
        : project.type === "leadgen"
          ? leadgenRecs(locale)
          : contentRecs(locale);
  return recs.sort(byImpact);
}
