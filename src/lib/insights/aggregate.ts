/** The cross-module signal hub. Each project type's modules emit Recommendations
 *  from their data; `collectRecommendations` gathers and ranks them for the
 *  Overview command center. Server-safe (pure compute over the spine + samples).
 *  As modules move onto live data (Phase D), only the producers below change. */
import type { Project } from "@/lib/projects/types";
import { MODULES } from "@/lib/projects/modules";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { channelRows, totalsOf } from "@/lib/metrics";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct } from "@/lib/format";
import { computeProfit } from "@/lib/profit/compute";
import { defaultMargins } from "@/lib/profit/sample";
import { SAMPLE_PRODUCTS } from "@/lib/catalog/sample";
import { AT_RISK_DAYS, monthlySeasonality, stockRows } from "@/lib/inventory/compute";
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
import { SEVERITY_ORDER, type Recommendation, type Severity } from "./types";

const moduleLabel = (key: string) => MODULES.find((m) => m.key === key)?.label ?? key;

function rec(module: string, severity: Severity, title: string, detail: string, metric?: string): Recommendation {
  return { id: `${module}:${title}`, module, moduleLabel: moduleLabel(module), severity, title, detail, metric };
}

function eshopRecs(project: Project): Recommendation[] {
  const data = getProjectDataset(project);
  const out: Recommendation[] = [];

  // Profit → channels losing money after margin
  const rows = channelRows(data.channels, totalsOf(data.daily.slice(-90)));
  const { rows: profit } = computeProfit(rows, defaultMargins(data.channels));
  for (const r of profit.filter((p) => !p.profitable)) {
    out.push(rec("zisk", "critical", `${r.channel} prodělává po marži`,
      `ROAS ${fmtMultiple(r.roas)} je pod bodem zvratu ${fmtMultiple(r.breakEvenRoas)}. Přesuňte rozpočet do ziskových kanálů.`,
      fmtCZK(r.netProfit)));
  }

  // Reference "now" derived from the dataset's last day → deterministic projected dates.
  const lastDate = data.daily.at(-1)?.date;
  const now = lastDate ? new Date(`${lastDate}T00:00:00Z`) : new Date();
  const stock = stockRows(SAMPLE_PRODUCTS, now);

  // Stock → items about to run out
  for (const s of stock.filter((s) => s.status === "pause")) {
    out.push(rec("sklad-sezonnost", "warning", `${s.product.title} brzy dojde`,
      `Zásoba na ${Math.round(s.daysOfCover)} dní — zvažte pozastavení reklamy na tento produkt.`,
      `${Math.round(s.daysOfCover)} dní`));
  }

  // Stock → early warning: SKUs trending toward stockout (< 14 dní), not yet a hard pauza.
  for (const s of stock.filter((s) => s.atRisk)) {
    out.push(rec("sklad-sezonnost", "opportunity", `${s.product.title} se blíží vyprodání`,
      `Zásoba klesá pod ${AT_RISK_DAYS} dní (zbývá ${Math.round(s.daysOfCover)} dní) — doplňte sklad včas, než bude nutné pozastavit reklamu.`,
      `${Math.round(s.daysOfCover)} dní`));
  }

  // Seasonality → upcoming peak
  const season = monthlySeasonality(data.daily);
  const cur = now.getUTCMonth();
  const next = season[(cur + 1) % 12]!;
  if (next.index >= 1.15) {
    out.push(rec("sklad-sezonnost", "opportunity", `${next.label} bývá sezónní špička`,
      `Index ${fmtMultiple(next.index)} — připravte vyšší rozpočet a zásoby s předstihem.`, fmtMultiple(next.index)));
  }
  return out;
}

function appRecs(): Recommendation[] {
  const out: Recommendation[] = [];
  const ltv = ltvSummary(SAMPLE_COHORTS);
  if (ltv.avgLtvCac < 3) {
    out.push(rec("ltv", ltv.avgLtvCac < 1 ? "critical" : "warning", "LTV:CAC pod cílem",
      `Poměr ${fmtMultiple(ltv.avgLtvCac)} (cíl ≥ 3×). Než přidáte rozpočet, zlepšete retenci/ARPU nebo snižte CAC.`,
      fmtMultiple(ltv.avgLtvCac)));
  }
  for (const w of SAMPLE_EXPERIMENTS.map(evaluate).filter((r) => r.significant)) {
    out.push(rec("experimenty-lp", "opportunity", `Nasadit vítěze: ${w.cluster}`,
      `Varianta vede průkazně (${fmtPct(w.confidence)} jistota). Nasaďte ji jako hlavní landing page.`));
  }
  const top = scoreQueries(SAMPLE_QUERIES).find((q) => q.opportunity === "high");
  if (top) {
    out.push(rec("srovnani-seo", "opportunity", `Obsah pro dotaz ${top.query}`,
      `Vysoká příležitost, ${fmtInt(top.volume)} hledání/měs. Vytvořte srovnávací stránku.`));
  }
  return out;
}

function leadgenRecs(): Recommendation[] {
  const out: Recommendation[] = [];
  for (const s of SAMPLE_SOURCES.map(leadMetrics).filter((s) => s.junk)) {
    out.push(rec("kvalita-leadu", "warning", `${s.source}: levné, ale nekvalitní leady`,
      `Míra kvalifikace ${fmtPct(s.qualRate)}, CPQL ${fmtCZK(s.cpql)}. Optimalizujte bidding na kvalifikované leady.`));
  }
  const overdue = SAMPLE_LEADS.filter((l) => l.minutesAgo > SLA_TARGET_MIN).length;
  if (overdue > 0) {
    out.push(rec("rychla-reakce", "critical", `${overdue} poptávek po SLA`,
      `Reagujte do ${SLA_TARGET_MIN} minut — rychlost reakce rozhoduje o konverzi leadu.`, `${overdue}`));
  }
  const gap = gaps(SAMPLE_TARGETS)[0];
  if (gap) {
    out.push(rec("lokalni", "opportunity", `Chybí stránka: ${gap.service} ${gap.area}`,
      `${fmtInt(gap.monthlyVolume)} hledání/měs. bez pokrytí — nasaďte lokální microsite.`));
  }
  return out;
}

function contentRecs(): Recommendation[] {
  const out: Recommendation[] = [];
  for (const p of decayingPosts(SAMPLE_DECAY)) {
    out.push(rec("obsahovy-engine", p.trafficChangePct <= -0.3 ? "warning" : "info", `Obnovit: ${p.title}`,
      `Návštěvnost ${fmtPct(p.trafficChangePct)} meziročně. Aktualizujte a znovu prolinkujte do klastru.`,
      fmtPct(p.trafficChangePct)));
  }
  return out;
}

/** All recommendations for a project, most urgent first. */
export function collectRecommendations(project: Project): Recommendation[] {
  const recs =
    project.type === "eshop"
      ? eshopRecs(project)
      : project.type === "app"
        ? appRecs()
        : project.type === "leadgen"
          ? leadgenRecs()
          : contentRecs();
  return recs.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}
