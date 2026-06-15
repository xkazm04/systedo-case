/** Turns synced campaign numbers into compact, human-readable prompt blocks that
 *  ground the AI evaluation — the same idea as `snapshot.ts` for the dashboard:
 *  the model interprets real data instead of inventing it. Pure (no DB, no React).
 */
import { fmtCZK, fmtInt, fmtMultiple, fmtPct } from "../format";
import {
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_STATUS_LABELS,
  TARGET_PNO,
  aggregate,
  groupByType,
  withMetrics,
  type Campaign,
  type CampaignPeriod,
  type CampaignRow,
} from "./types";
import { CAMPAIGN_PERIOD_LABELS } from "./types";

const CLIENT_LINE = "Klient: Mionelo (mionelo.cz) — e-shop s ořechy, semínky a superpotravinami";

const metricsLine = (c: CampaignRow): string =>
  [
    `typ ${CAMPAIGN_TYPE_LABELS[c.type]}`,
    `stav ${CAMPAIGN_STATUS_LABELS[c.status].toLowerCase()}`,
    `náklady ${fmtCZK(c.cost)}`,
    `hodnota konverzí ${fmtCZK(c.conversionValue)}`,
    `konverze ${fmtInt(c.conversions)}`,
    `ROAS ${c.roas > 0 ? fmtMultiple(c.roas) : "—"}`,
    `PNO ${c.pno > 0 ? fmtPct(c.pno) : "—"}`,
    `CPA ${c.conversions > 0 ? fmtCZK(c.cpa) : "—"}`,
    `CTR ${fmtPct(c.ctr, 2)}`,
    `prokliky ${fmtInt(c.clicks)}`,
  ].join(", ");

function targetLine(): string {
  return `Cílové PNO domluvené s klientem: ${fmtPct(TARGET_PNO, 0)} (≈ ROAS ${fmtMultiple(1 / TARGET_PNO)}).`;
}

function header(period: CampaignPeriod): string[] {
  return [
    CLIENT_LINE,
    `Období: posledních ${CAMPAIGN_PERIOD_LABELS[period]}.`,
    targetLine(),
  ];
}

/** Prompt for evaluating one campaign — its own numbers plus the portfolio
 *  context it sits in (share of spend, rank, how its type performs overall). */
export function buildCampaignPrompt(target: Campaign, all: Campaign[], period: CampaignPeriod): string {
  const t = withMetrics(target);
  const portfolio = aggregate(all);
  const ranked = [...all].map(withMetrics).sort((a, b) => b.roas - a.roas);
  const rank = ranked.findIndex((c) => c.id === target.id) + 1;
  const sameType = all.filter((c) => c.type === target.type);
  const typeTotal = aggregate(sameType);
  const costShare = portfolio.cost > 0 ? target.cost / portfolio.cost : 0;
  const revShare = portfolio.conversionValue > 0 ? target.conversionValue / portfolio.conversionValue : 0;

  return [
    "Vyhodnoť výkon jedné konkrétní reklamní kampaně z Google Ads.",
    "",
    ...header(period),
    "",
    `HODNOCENÁ KAMPAŇ: „${target.name}“`,
    `- ${metricsLine(t)}`,
    `- podíl na celkových nákladech portfolia: ${fmtPct(costShare)}`,
    `- podíl na celkové hodnotě konverzí portfolia: ${fmtPct(revShare)}`,
    `- pořadí podle ROAS: ${rank}. z ${all.length} kampaní`,
    "",
    "KONTEXT PORTFOLIA (pro srovnání):",
    `- Celé portfolio: náklady ${fmtCZK(portfolio.cost)}, hodnota konverzí ${fmtCZK(portfolio.conversionValue)}, ROAS ${fmtMultiple(portfolio.roas)}, PNO ${fmtPct(portfolio.pno)}.`,
    `- Typ ${CAMPAIGN_TYPE_LABELS[target.type]} celkem (${typeTotal.count} kampaní): náklady ${fmtCZK(typeTotal.cost)}, ROAS ${fmtMultiple(typeTotal.roas)}, PNO ${fmtPct(typeTotal.pno)}.`,
    "",
    "Na základě těchto čísel vrať: skóre 0–100 (zdraví kampaně vůči cíli a portfoliu), jednovětý verdikt, krátké shrnutí, silné stránky, slabiny a 2–4 konkrétní doporučené kroky s prioritou. Vycházej VÝHRADNĚ z uvedených čísel.",
  ].join("\n");
}

/** Prompt for the portfolio-level evaluation — totals, per-type breakdown and
 *  every campaign, so the model can recommend where to shift budget. */
export function buildOverallPrompt(all: Campaign[], period: CampaignPeriod): string {
  const portfolio = aggregate(all);
  const types = groupByType(all);
  const rows = [...all].map(withMetrics).sort((a, b) => b.cost - a.cost);

  return [
    "Vyhodnoť celé portfolio reklamních kampaní klienta z Google Ads jako PPC stratég.",
    "",
    ...header(period),
    "",
    `SOUHRN PORTFOLIA (${portfolio.count} kampaní):`,
    `- náklady ${fmtCZK(portfolio.cost)}, hodnota konverzí ${fmtCZK(portfolio.conversionValue)}, konverze ${fmtInt(portfolio.conversions)}`,
    `- ROAS ${fmtMultiple(portfolio.roas)}, PNO ${fmtPct(portfolio.pno)} (cíl ${fmtPct(TARGET_PNO, 0)})`,
    "",
    "VÝKON PODLE TYPU (náklady | hodnota konverzí | ROAS | PNO):",
    ...types.map(
      (g) =>
        `- ${CAMPAIGN_TYPE_LABELS[g.type]} (${g.total.count}): ${fmtCZK(g.total.cost)} | ${fmtCZK(g.total.conversionValue)} | ${g.total.roas > 0 ? fmtMultiple(g.total.roas) : "—"} | ${g.total.pno > 0 ? fmtPct(g.total.pno) : "—"}`
    ),
    "",
    "JEDNOTLIVÉ KAMPANĚ (seřazené podle nákladů):",
    ...rows.map((c) => `- „${c.name}“: ${metricsLine(c)}`),
    "",
    "Na základě těchto čísel vrať: skóre 0–100 (celkové zdraví portfolia vůči cíli), jednovětý verdikt, krátké shrnutí, silné stránky, slabiny a 3–5 konkrétních doporučených kroků s prioritou (kde přidat rozpočet, co optimalizovat, co utlumit). Odkazuj se na konkrétní kampaně a typy. Vycházej VÝHRADNĚ z uvedených čísel.",
  ].join("\n");
}
