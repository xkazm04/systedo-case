/** Turns synced campaign numbers into compact, human-readable prompt blocks that
 *  ground the AI evaluation — the same idea as `snapshot.ts` for the dashboard:
 *  the model interprets real data instead of inventing it. Pure (no DB, no React).
 */
import { fmtCZK, fmtInt, fmtMultiple, fmtPct, fmtSignedPct } from "../format";
import {
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_STATUS_LABELS,
  TARGET_PNO,
  aggregate,
  groupByType,
  indexChanges,
  withMetrics,
  type Campaign,
  type CampaignChange,
  type CampaignPeriod,
  type CampaignRow,
  type ChangesSummary,
} from "./types";
import { CAMPAIGN_PERIOD_LABELS } from "./types";
import { triage } from "./triage";
import { recommendBudgetMoves } from "./budget-moves";

/** Render one campaign's deterministic triage as prompt lines, so the model
 *  reasons over the same rule-based diagnosis the UI badges show — instead of
 *  re-inventing one that can contradict the screen. When the sync-over-sync
 *  `change` is supplied, the change-aware rules (roas_crater / spend_spike)
 *  run too, exactly like the table badges. */
function triageLines(c: CampaignRow, change?: CampaignChange): string[] {
  const t = triage(c, change);
  if (t.reasons.length === 0) return ["- Bez porušení pravidel triáže (plní cíle)."];
  return t.reasons.map(
    (r) => `- [${r.severity === "critical" ? "KRITICKÉ" : "sledovat"}] ${r.label}: ${r.detail}`
  );
}

/** One mover from the sync-over-sync diff as a compact prompt line. */
function changeLine(ch: CampaignChange): string {
  if (ch.kind === "added") {
    return `- „${ch.name}“: nová kampaň od minulé synchronizace (náklady ${fmtCZK(ch.costAfter)}).`;
  }
  if (ch.kind === "removed") {
    return `- „${ch.name}“: od minulé synchronizace zmizela (předtím náklady ${fmtCZK(ch.costBefore)}).`;
  }
  return `- „${ch.name}“: náklady ${fmtCZK(ch.costBefore)} → ${fmtCZK(ch.costAfter)} (${fmtSignedPct(ch.costDelta)}), hodnota konverzí ${fmtSignedPct(ch.valueDelta)}, ROAS ${fmtMultiple(ch.roasBefore)} → ${fmtMultiple(ch.roasAfter)}.`;
}

/** Render the sync-over-sync diff as a prompt block, so the AI sees the same
 *  movement layer the UI badges show — a campaign can sit above target yet be
 *  cratering toward it, and the evaluation must not contradict that. `[]` when
 *  there is no diff (fewer than two syncs) or no items survive the filter. */
function changesBlock(changes: ChangesSummary | undefined, onlyCampaignId?: string): string[] {
  if (!changes) return [];
  const items = onlyCampaignId
    ? changes.items.filter((i) => i.campaignId === onlyCampaignId)
    : changes.items;
  if (items.length === 0) return [];
  return [
    "",
    "ZMĚNY OD MINULÉ SYNCHRONIZACE (diff posledních dvou synchronizací — zohledni směr vývoje, ne jen aktuální stav):",
    ...items.map(changeLine),
  ];
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
 *  context it sits in (share of spend, rank, how its type performs overall).
 *  Optionally grounded in the sync-over-sync diff (`changes`), so the triage the
 *  model must agree with is the same change-aware one the UI badges run. */
export function buildCampaignPrompt(
  target: Campaign,
  all: Campaign[],
  period: CampaignPeriod,
  changes?: ChangesSummary
): string {
  const changesById = indexChanges(changes);
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
    ...changesBlock(changes, target.id),
    "",
    "KONTEXT PORTFOLIA (pro srovnání):",
    `- Celé portfolio: náklady ${fmtCZK(portfolio.cost)}, hodnota konverzí ${fmtCZK(portfolio.conversionValue)}, ROAS ${fmtMultiple(portfolio.roas)}, PNO ${fmtPct(portfolio.pno)}.`,
    `- Typ ${CAMPAIGN_TYPE_LABELS[target.type]} celkem (${typeTotal.count} kampaní): náklady ${fmtCZK(typeTotal.cost)}, ROAS ${fmtMultiple(typeTotal.roas)}, PNO ${fmtPct(typeTotal.pno)}.`,
    "",
    "DETERMINISTICKÁ TRIÁŽ (pravidlová diagnóza zobrazená u kampaně — tvé hodnocení s ní musí být v souladu):",
    ...triageLines(t, changesById[target.id]),
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
  patternLines: string[] = [],
  changes?: ChangesSummary
): string {
  const changesById = indexChanges(changes);
  const portfolio = aggregate(all);
  const types = groupByType(all);
  const rows = [...all].map(withMetrics).sort((a, b) => b.cost - a.cost);
  // Deterministic layer the model must agree with: rule-based triage (change-
  // aware when the sync diff is supplied, matching the UI badges) + the
  // quantified budget-reallocation the BudgetMoves card already shows on screen.
  const flagged = rows
    .map((c) => ({ c, t: triage(c, changesById[c.id]) }))
    .filter((x) => x.t.severity !== "ok");
  // includePauses: a zero-return spender surfaces as a pause recommendation, so
  // the prompt's deterministic-moves block can't contradict a critical
  // no_conversions triage finding sitting right above it.
  const rec = recommendBudgetMoves(rows, { includePauses: true });

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
    ...changesBlock(changes),
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
          ...rec.moves.map((m) =>
            m.kind === "pause"
              ? `- Pozastavit „${m.fromName}“ (utrácí ${fmtCZK(m.amount)} bez jediné konverze); úspora ${fmtCZK(m.amount)} nákladů bez ztráty hodnoty konverzí.`
              : `- Přesunout ${fmtCZK(m.amount)} z „${m.fromName}“ (ROAS ${fmtMultiple(m.fromRoas)}) do „${m.toName}“ (ROAS ${fmtMultiple(m.toRoas)}); odhad +${fmtCZK(m.estValueGain)} hodnoty konverzí.`
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
