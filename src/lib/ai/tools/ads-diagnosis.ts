/** AI tool — ads-performance diagnosis (grounded in the tenant's ACTUAL synced
 *  campaign portfolio: the union of its Google Ads and Sklik accounts, ADR-0010).
 *  Today a tenant whose only live data is Ads gets no passive diagnosis at all —
 *  the weekly digest knows the lead-source arm and exits. This reads the portfolio's
 *  REAL, already-computed numbers (per-network cost/ROAS, the worst wasted spend,
 *  the best performers, the prior window) and returns a Czech root cause — burned
 *  budget vs misallocation vs drifting efficiency vs a measurement gap vs an
 *  unbalanced network mix — plus the single concrete action, and the ids of the
 *  campaigns it is about.
 *
 *  Anti-fabrication: the prompt carries ONLY pre-computed numbers and their
 *  provenance; `affectedCampaignIds` is normalised back to the ids the request
 *  actually supplied, so the model cannot name a campaign that does not exist. No
 *  cross-currency arithmetic is ever asked for (ADR-0010): with disagreeing
 *  currencies the totals cover the primary network alone and the prompt says so.
 *  Runs through the provider-switching LLM wrapper (../../llm). Server-only. */
import { Type } from "@google/genai";
import {
  ADS_DIAGNOSIS_CAUSES,
  ADS_DIAGNOSIS_CAUSE_LABELS,
  ADS_PLATFORM_LABELS,
  type AdsDiagnosisCampaign,
  type AdsDiagnosisCause,
  type AdsDiagnosisRequest,
  type AdsDiagnosisResult,
  type AiResponse,
} from "../../ai-types";
import { CAMPAIGN_TYPE_LABELS, type CampaignType } from "../../campaigns/types";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct, fmtSignedPct, type SupportedLocale } from "../../format";
import { generateStructured } from "../../llm";
import { txt } from "./_shared";
import { antiFabrication, demoTail } from "./_fragments";
import { missingStrFields, withObjectGuard } from "./_validate";
import { coerceEnum } from "./_coerce";
import { refineLines } from "./refine";
import { dataProvenanceLine } from "./cohort-diagnosis";

const ADS_DIAGNOSIS_SYSTEM = `Jsi zkušený český PPC stratég. Děláš stručnou diagnostiku CELÉHO placeného portfolia klienta (Google Ads a Sklik dohromady) za posledních 30 dní.

Pravidla:
- ${antiFabrication("předaných čísel")}
- Nikdy nesčítej částky napříč měnami. Je-li uvedeno, že sítě mají různé měny, souhrn platí jen pro hlavní síť a ostatní sítě porovnávej pouze poměrovými ukazateli (ROAS, PNO).
- Urči JEDNU nejpravděpodobnější příčinu, proč portfolio nedosahuje cíle — a klasifikuj ji do jedné z těchto kategorií (pole „likelyCause"):
  - „waste-zero-conv" = podstatná část rozpočtu teče do kampaní bez konverzí.
  - „budget-misallocation" = peníze sedí v podvýkonných kampaních, zatímco ty výkonné by unesly víc.
  - „efficiency-drift" = efektivita se zhoršuje oproti minulému období (náklady rostou rychleji než hodnota konverzí).
  - „tracking-gap" = čísla ukazují na chybějící měření (výdaje a prokliky jsou, konverze či jejich hodnota chybí).
  - „platform-imbalance" = jedna síť nese velkou část nákladů s výrazně horším ROAS než druhá.
  - „healthy" = portfolio nemá zásadní problém.
- Doporuč JEDNU nejúčinnější, konkrétní akci (např. vypnout / omezit konkrétní kampaň, přesunout rozpočet ke jmenované výkonnější kampani, dorovnat měření konverzí) — akčně, ne obecně.
- Jmenuj konkrétní kampaně podle jejich názvů a čísel; pole „affectedCampaignIds" smí obsahovat POUZE id kampaní uvedená v datech.
- Je-li uvedeno minulé období, zohledni vývoj: zhoršující se portfolio je naléhavější a mění doporučení i závažnost.
- Odkazuj se na konkrétní čísla z dat (náklady, ROAS, PNO, konverze, cíl PNO).
- Vrať „severity" (high | medium | low) podle závažnosti.
- Piš česky, věcně, bez vaty a marketingových frází.
- Drž se zadaného JSON schématu.`;

/** The allowed cause labels for the prompt — keeps the model on the known set. */
const ADS_CAUSE_PROMPT_LINE = ADS_DIAGNOSIS_CAUSES.map(
  (c) => `„${c}" (${ADS_DIAGNOSIS_CAUSE_LABELS[c]})`
).join(", ");

/** Money in the account's own currency. CZK keeps the shared Czech formatter; any
 *  other captured currency is stated as a plain amount + its ISO code rather than
 *  being re-labelled as korunas (which would misprice a foreign account). */
function money(n: number, currency: string): string {
  return currency === "CZK" ? fmtCZK(n) : `${fmtInt(Math.round(n))} ${currency}`;
}

function campaignTypeLabel(type: string): string {
  return CAMPAIGN_TYPE_LABELS[type as CampaignType] ?? type;
}

function campaignLine(c: AdsDiagnosisCampaign, currency: string): string {
  const parts = [
    `náklady ${money(c.cost, currency)}`,
    `konverze ${fmtInt(c.conversions)}`,
    `hodnota ${money(c.conversionValue, currency)}`,
    `ROAS ${fmtMultiple(c.roas)}`,
    `PNO ${fmtPct(c.pno)}`,
    `CTR ${fmtPct(c.ctr)}`,
  ];
  if (c.budgetPerDay != null) parts.push(`denní rozpočet ${money(c.budgetPerDay, currency)}`);
  if (c.deltaCostPct != null) parts.push(`náklady ${fmtSignedPct(c.deltaCostPct)} oproti minulé synchronizaci`);
  if (c.deltaValuePct != null) parts.push(`hodnota konverzí ${fmtSignedPct(c.deltaValuePct)}`);
  return `- [${c.id}] „${c.name}" (${ADS_PLATFORM_LABELS[c.platform]}, ${campaignTypeLabel(c.type)}): ${parts.join(", ")}`;
}

export function buildAdsDiagnosisPrompt(req: AdsDiagnosisRequest): string {
  const cur = req.currency;
  const provenance = dataProvenanceLine(req.sample);
  const lines = [
    "Níže jsou reálná, již spočítaná data placeného portfolia za posledních 30 dní.",
    "Zanalyzuj, proč portfolio nedosahuje cíle, a připrav krátkou diagnostiku.",
    ...(provenance ? [provenance] : []),
    "",
    `SOUHRN PORTFOLIA (měna ${cur}${req.mixedCurrency ? ", jen hlavní síť" : ""}):`,
    `- Náklady: ${money(req.totals.cost, cur)}`,
    `- Konverze: ${fmtInt(req.totals.conversions)} v hodnotě ${money(req.totals.conversionValue, cur)}`,
    `- ROAS ${fmtMultiple(req.totals.roas)} · PNO ${fmtPct(req.totals.pno)}`,
  ];
  if (req.targetPno != null) lines.push(`- Cílové PNO: ${fmtPct(req.targetPno)}`);
  if (req.prior) {
    lines.push(
      `- Minulé období: náklady ${money(req.prior.cost, cur)}, konverze ${fmtInt(
        req.prior.conversions
      )}, hodnota ${money(req.prior.conversionValue, cur)}`
    );
  }
  if (req.mixedCurrency) {
    lines.push(
      "- POZOR: sítě tohoto klienta mají různé měny. Souhrn výše platí jen pro hlavní síť; částky jednotlivých sítí NIKDY nesčítej, porovnávej je jen poměrově (ROAS, PNO)."
    );
  }

  lines.push("", "SÍTĚ (každá ve své vlastní měně):");
  for (const p of req.platforms) {
    lines.push(
      `- ${ADS_PLATFORM_LABELS[p.platform]}: ${p.campaigns} kampaní, náklady ${money(
        p.cost,
        cur
      )}, ROAS ${fmtMultiple(p.roas)}`
    );
  }

  lines.push("", "NEJVÍC PÁLÍCÍ KAMPANĚ (od nejvyššího nevyužitého rozpočtu):");
  for (const c of req.worst) lines.push(campaignLine(c, cur));
  if (req.best.length > 0) {
    lines.push("", "NEJVÝKONNĚJŠÍ KAMPANĚ (kam lze případně přesunout rozpočet):");
    for (const c of req.best) lines.push(campaignLine(c, cur));
  }

  lines.push(
    "",
    `Povolené hodnoty pole „likelyCause": ${ADS_CAUSE_PROMPT_LINE}.`,
    "",
    'Vrať: „summary" (krátký odstavec, proč portfolio nedosahuje cíle), „likelyCause" (jedna z povolených hodnot), „recommendation" (jedna nejúčinnější konkrétní akce), „severity" (high | medium | low) a „affectedCampaignIds" (id dotčených kampaní POUZE z výše uvedených dat, nejvýš 6). Vycházej pouze z uvedených čísel.'
  );
  lines.push(...refineLines(req.refine));
  return lines.join("\n");
}

const ADS_DIAGNOSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Krátký odstavec shrnující, proč portfolio nedosahuje cíle",
    },
    likelyCause: {
      type: Type.STRING,
      description: `Hlavní příčina, jedna z: ${ADS_DIAGNOSIS_CAUSES.join(" | ")}`,
    },
    recommendation: {
      type: Type.STRING,
      description: "Jedna nejúčinnější konkrétní akce k řešení",
    },
    severity: {
      type: Type.STRING,
      description: "Závažnost problému: high | medium | low",
    },
    affectedCampaignIds: {
      type: Type.ARRAY,
      description: "Id dotčených kampaní, pouze z předaných dat (nejvýš 6)",
      items: { type: Type.STRING },
    },
  },
  required: ["summary", "likelyCause", "recommendation"],
  propertyOrdering: ["summary", "likelyCause", "recommendation", "severity", "affectedCampaignIds"],
};

/** Coerce the model's likelyCause to a known cause, defaulting unknowns to
 *  „budget-misallocation" (the neutral, always-actionable catch-all). */
const coerceCause = coerceEnum<AdsDiagnosisCause, AdsDiagnosisCause>(
  ADS_DIAGNOSIS_CAUSES,
  "budget-misallocation"
);

type AdsSeverity = AdsDiagnosisResult["severity"];
const coerceSeverity = coerceEnum<AdsSeverity, undefined>(["high", "medium", "low"], undefined);

// Deterministic thresholds mirroring the qualitative CAUSE definitions in
// ADS_DIAGNOSIS_SYSTEM. Named + commented so the TS floor and the prompt wording
// move in lockstep (edit both together). Currency-free by construction — every one
// is a ratio, so they hold for a foreign account too.
const WASTE_SHARE_HIGH = 0.25; // ≥ this share of spend on zero-conversion campaigns
const DRIFT_COST_RISE = 0.15; // period-over-period cost rise that counts as drift…
const DRIFT_VALUE_LAG = 0.5; // …while conversion value grew less than this fraction of it
const IMBALANCE_ROAS_RATIO = 0.6; // a network retaining less than this share of the best ROAS…
const IMBALANCE_COST_SHARE = 0.25; // …while carrying at least this share of the spend

/** Every campaign id the request actually supplied — the only ids a diagnosis may
 *  name. */
function requestIds(req: AdsDiagnosisRequest): Set<string> {
  return new Set([...req.worst, ...req.best].map((c) => c.id));
}

/** Deterministic, data-driven cause from the numbers alone — the demo's pick and the
 *  floor when the model leaves likelyCause empty. Mirrors the prompt's rules, in the
 *  order a PPC manager would rule them out. */
export function pickAdsCause(req: AdsDiagnosisRequest): AdsDiagnosisCause {
  const { totals } = req;
  // Spend with nothing measured coming back reads as a measurement gap first: an
  // action ("fix conversion tracking") that a waste verdict would send the wrong way.
  if (totals.cost > 0 && totals.conversions <= 0) return "tracking-gap";

  const zeroConvCost = req.worst
    .filter((c) => c.conversions <= 0)
    .reduce((a, c) => a + c.cost, 0);
  if (totals.cost > 0 && zeroConvCost / totals.cost >= WASTE_SHARE_HIGH) return "waste-zero-conv";

  if (req.prior && req.prior.cost > 0) {
    const costRise = (totals.cost - req.prior.cost) / req.prior.cost;
    const valueRise =
      req.prior.conversionValue > 0
        ? (totals.conversionValue - req.prior.conversionValue) / req.prior.conversionValue
        : 0;
    if (costRise >= DRIFT_COST_RISE && valueRise < costRise * DRIFT_VALUE_LAG) return "efficiency-drift";
  }

  const spending = req.platforms.filter((p) => p.cost > 0);
  if (spending.length > 1 && totals.cost > 0) {
    const bestRoas = Math.max(...spending.map((p) => p.roas));
    const laggard = spending.find(
      (p) => p.roas < bestRoas * IMBALANCE_ROAS_RATIO && p.cost / totals.cost >= IMBALANCE_COST_SHARE
    );
    if (laggard) return "platform-imbalance";
  }

  if (req.targetPno != null && totals.pno > 0 && totals.pno <= req.targetPno) return "healthy";
  return "budget-misallocation";
}

function severityFor(cause: AdsDiagnosisCause): AdsSeverity {
  if (cause === "waste-zero-conv" || cause === "tracking-gap") return "high";
  if (cause === "healthy") return "low";
  return "medium";
}

function normalizeAdsDiagnosis(parsed: unknown, req: AdsDiagnosisRequest): AdsDiagnosisResult {
  const o = parsed as Record<string, unknown> | null;
  // Per-field floor is the TAIL-FREE base — backfilling an empty summary must not
  // carry the keyless "připojte LLM" disclaimer into a real (billed) diagnosis.
  const fallback = baseAdsDiagnosis(req);

  const rawCause = txt(o?.likelyCause);
  const likelyCause = rawCause ? coerceCause(rawCause) : fallback.likelyCause;

  // Anti-fabrication: the model may only name campaigns it was given. Unknown ids are
  // dropped (never coerced to something plausible) and an empty list is allowed — the
  // diagnosis can legitimately be about the portfolio rather than named rows.
  const known = requestIds(req);
  const ids = Array.isArray(o?.affectedCampaignIds)
    ? (o.affectedCampaignIds as unknown[])
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => known.has(v))
    : [];
  const affectedCampaignIds = Array.from(new Set(ids)).slice(0, 6);

  return {
    summary: txt(o?.summary) || fallback.summary,
    likelyCause,
    recommendation: txt(o?.recommendation) || fallback.recommendation,
    // Derive severity from the cause we ACTUALLY show when the model omits it, so a
    // model "waste-zero-conv" can never render beside a green "low" pill.
    severity: coerceSeverity(o?.severity) ?? severityFor(likelyCause),
    affectedCampaignIds:
      affectedCampaignIds.length > 0 ? affectedCampaignIds : fallback.affectedCampaignIds,
  };
}

/** Flag a hollow diagnosis so the wrapper re-prompts once instead of rendering an
 *  empty card the normalizer would silently paper over. */
function validateAdsDiagnosis(parsed: unknown): string[] {
  return withObjectGuard((o) =>
    missingStrFields(o, [
      ["summary", "Chybí shrnutí (summary)."],
      ["likelyCause", "Chybí příčina (likelyCause) — vrať jednu z povolených hodnot."],
      ["recommendation", "Chybí doporučení (recommendation)."],
    ])
  )(parsed);
}

/** The keyless demo: the tail-free base plus the honest "ukázkový výstup — připojte
 *  LLM" disclaimer on the summary. Reached ONLY through the wrapper's demo() return
 *  path; live per-field backfill uses baseAdsDiagnosis so the disclaimer never leaks
 *  into a real, metered diagnosis. */
export function demoAdsDiagnosis(req: AdsDiagnosisRequest): AdsDiagnosisResult {
  const base = baseAdsDiagnosis(req);
  return { ...base, summary: base.summary + demoTail("diagnostiku od modelu") };
}

/** Deterministic, data-driven diagnosis: pick the cause from the numbers and emit a
 *  templated Czech reading — TAIL-FREE, so it is safe both as the floor for empty
 *  model fields and as the base the demo wraps with the disclaimer. */
export function baseAdsDiagnosis(req: AdsDiagnosisRequest): AdsDiagnosisResult {
  const cause = pickAdsCause(req);
  const cur = req.currency;
  const worst = req.worst[0];
  const best = req.best[0];
  const pno = fmtPct(req.totals.pno);
  const roas = fmtMultiple(req.totals.roas);
  const target = req.targetPno != null ? fmtPct(req.targetPno) : "—";
  const spend = money(req.totals.cost, cur);
  const worstName = worst ? `„${worst.name}"` : "nejdražší kampaň";

  let summary: string;
  let recommendation: string;
  switch (cause) {
    case "tracking-gap":
      summary = `Portfolio utratilo ${spend}, ale za posledních 30 dní nemá jedinou naměřenou konverzi — to je typicky mezera v měření, ne fakt, že by reklamy nic nepřinesly.`;
      recommendation = `Zkontrolujte měření konverzí (značka, import konverzí, propojení účtů) dřív, než budete cokoli vypínat — bez dat je každý zásah do rozpočtu střelba naslepo.`;
      break;
    case "waste-zero-conv":
      summary = `Podstatná část rozpočtu (${spend} celkem, PNO ${pno} proti cíli ${target}) padá na kampaně bez jediné konverze — ${worstName} je z nich nejdražší.`;
      recommendation = best
        ? `Zastavte nebo výrazně omezte ${worstName} a uvolněný rozpočet přesuňte do „${best.name}" (ROAS ${fmtMultiple(best.roas)}), která ho dokáže zhodnotit.`
        : `Zastavte nebo výrazně omezte ${worstName} a rozpočet vraťte až po nápravě cílení či měření.`;
      break;
    case "efficiency-drift":
      summary = `Efektivita portfolia se zhoršuje: náklady rostou rychleji než hodnota konverzí, ROAS je ${roas} a PNO ${pno} proti cíli ${target}.`;
      recommendation = `Vraťte se k nastavení, které platilo minulé období u ${worstName} (rozpočet, bidding, publika), a změny zaveďte po jedné — dnešní pokles je způsobený posledními úpravami, ne trhem.`;
      break;
    case "platform-imbalance":
      summary = `Sítě nesou rozpočet nerovnoměrně: jedna z nich má výrazně horší ROAS než druhá, přestože drží podstatnou část nákladů (celkem ${spend}, PNO ${pno}).`;
      recommendation = `Srovnejte rozpočty podle výkonu sítí — utlumte tu se slabším ROAS a přidejte v té silnější, po týdnu vyhodnoťte znovu.`;
      break;
    case "healthy":
      summary = `Portfolio nemá zásadní problém: ROAS ${roas} a PNO ${pno} drží na cíli ${target} při nákladech ${spend}.`;
      recommendation = `Držte současné nastavení a zvažte opatrné navýšení rozpočtu u nejvýkonnějších kampaní, dokud zůstane PNO na cíli.`;
      break;
    default:
      summary = `Rozpočet sedí ve špatných kampaních: portfolio je na PNO ${pno} proti cíli ${target}, přičemž ${worstName} spotřebovává rozpočet s podprůměrnou návratností.`;
      recommendation = best
        ? `Přesuňte rozpočet z ${worstName} do „${best.name}" (ROAS ${fmtMultiple(best.roas)}) a limit navyšujte po krocích, dokud PNO neklesne k cíli.`
        : `Snižte rozpočet u ${worstName} a nechte peníze v kampaních, které drží PNO pod cílem.`;
      break;
  }

  return {
    summary,
    likelyCause: cause,
    recommendation,
    severity: severityFor(cause),
    affectedCampaignIds: cause === "healthy" ? [] : req.worst.slice(0, 6).map((c) => c.id),
  };
}

export function generateAdsDiagnosis(
  req: AdsDiagnosisRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<AdsDiagnosisResult>> {
  return generateStructured({
    // llm-tool: ads-diagnosis
    id: "ads-diagnosis",
    prompt: buildAdsDiagnosisPrompt(req),
    system: ADS_DIAGNOSIS_SYSTEM,
    schema: ADS_DIAGNOSIS_SCHEMA,
    temperature: 0.6,
    normalize: (parsed) => normalizeAdsDiagnosis(parsed, req),
    validate: (parsed) => validateAdsDiagnosis(parsed),
    demo: () => demoAdsDiagnosis(req),
    locale,
    signal,
  });
}
