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
import { triage } from "./triage";
import { recommendBudgetMoves } from "./budget-moves";

/** Render one campaign's deterministic triage as prompt lines, so the model
 *  reasons over the same rule-based diagnosis the UI badges show — instead of
 *  re-inventing one that can contradict the screen. */
function triageLines(c: CampaignRow): string[] {
  const t = triage(c);
  if (t.reasons.length === 0) return ["- Bez porušení pravidel triáže (plní cíle)."];
  return t.reasons.map(
    (r) => `- [${r.severity === "critical" ? "KRITICKÉ" : "sledovat"}] ${r.label}: ${r.detail}`
  );
}

const CLIENT_LINE = "Klient: Mionelo (mionelo.cz) — e-shop s ořechy, semínky a superpotravinami";

const metricsLine = (c: CampaignRow): string =>
  [
    `typ ${CAMPAIGN_TYPE_LABELS[c.type]}`,
    `stav ${CAMPAIGN_STATUS_LABELS[c.status].toLowerCase()}`,
    `náklady ${fmtCZK(c.cost)}`,
    `hodnota konverzí ${fmtCZK(c.conversionValue)}`,
    `konverze ${fmtInt(c.conversions)}`,
    // Distinguish "spent budget with zero return" (cost>0, value=0) from a
    // harmless paused/zero-spend campaign — both used to print "—", hiding the
    // worst case behind the same dash as the benign one.
    `ROAS ${c.roas > 0 ? fmtMultiple(c.roas) : c.cost > 0 ? "0× (bez návratnosti)" : "—"}`,
    `PNO ${c.pno > 0 ? fmtPct(c.pno) : c.cost > 0 ? "∞ (bez návratnosti)" : "—"}`,
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
    "DETERMINISTICKÁ TRIÁŽ (pravidlová diagnóza zobrazená u kampaně — tvé hodnocení s ní musí být v souladu):",
    ...triageLines(t),
    "",
    "Na základě těchto čísel vrať: skóre 0–100 (zdraví kampaně vůči cíli a portfoliu), jednovětý verdikt, krátké shrnutí, silné stránky, slabiny a 2–4 konkrétní doporučené kroky s prioritou. Skóre i verdikt musí odpovídat triáži výše — kampaň s kritickým nálezem nemůže dostat skóre zdraví nad 50. Vycházej VÝHRADNĚ z uvedených čísel.",
  ].join("\n");
}

/** Prompt for the portfolio-level evaluation — totals, per-type breakdown and
 *  every campaign, so the model can recommend where to shift budget. Optionally
 *  grounded in the account's own winning patterns (the patterns library), so the
 *  model reasons from proven lessons, not generic advice. */
export function buildOverallPrompt(
  all: Campaign[],
  period: CampaignPeriod,
  patternLines: string[] = []
): string {
  const portfolio = aggregate(all);
  const types = groupByType(all);
  const rows = [...all].map(withMetrics).sort((a, b) => b.cost - a.cost);
  // Deterministic layer the model must agree with: rule-based triage + the
  // quantified budget-reallocation the BudgetMoves card already shows on screen.
  const flagged = rows.map((c) => ({ c, t: triage(c) })).filter((x) => x.t.severity !== "ok");
  const rec = recommendBudgetMoves(rows);

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
    "DETERMINISTICKÁ TRIÁŽ (pravidlové nálezy, které UI u kampaní zobrazuje — respektuj je):",
    ...(flagged.length > 0
      ? flagged.map(
          ({ c, t }) =>
            `- „${c.name}“: ${t.reasons
              .map((r) => `[${r.severity === "critical" ? "KRITICKÉ" : "sledovat"}] ${r.label}`)
              .join("; ")}`
        )
      : ["- Žádná kampaň neporušuje pravidla triáže."]),
    "",
    "DOPORUČENÉ PŘESUNY ROZPOČTU (deterministický model — použij je jako základ, neodporuj jim):",
    ...(rec.moves.length > 0
      ? [
          ...rec.moves.map(
            (m) =>
              `- Přesunout ${fmtCZK(m.amount)} z „${m.fromName}“ (ROAS ${fmtMultiple(m.fromRoas)}) do „${m.toName}“ (ROAS ${fmtMultiple(m.toRoas)}); odhad +${fmtCZK(m.estValueGain)} hodnoty konverzí.`
          ),
          `- Souhrnný odhad po přesunech: ROAS ${fmtMultiple(rec.simulation.before.roas)} → ${fmtMultiple(rec.simulation.after.roas)}, PNO ${fmtPct(rec.simulation.before.pno)} → ${fmtPct(rec.simulation.after.pno)}.`,
        ]
      : ["- Model nenašel jednoznačné přesuny (žádný jasný dárce/příjemce vůči cíli)."]),
    "",
    ...(patternLines.length > 0
      ? [
          "",
          "OSVĚDČENÉ VZORY Z TOHOTO ÚČTU (knihovna vzorů — využij je, pokud dávají v kontextu smysl):",
          ...patternLines,
        ]
      : []),
    "",
    "Na základě těchto čísel vrať: skóre 0–100 (celkové zdraví portfolia vůči cíli), jednovětý verdikt, krátké shrnutí, silné stránky, slabiny a 3–5 konkrétních doporučených kroků s prioritou (kde přidat rozpočet, co optimalizovat, co utlumit). Doporučení musí vycházet z triáže a navržených přesunů výše a nesmí jim odporovat. Odkazuj se na konkrétní kampaně a typy. Vycházej VÝHRADNĚ z uvedených čísel.",
  ].join("\n");
}
