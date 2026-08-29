/** AI tool — lead-source diagnosis (grounded in one source's computed lead-quality
 *  metrics). Today the Kvalita leadů module flags a "junk" source with a single
 *  hard-coded qualification-rate threshold and no reason. This reads the source's
 *  REAL numbers (leads, qualified, won, qualRate, winRate, CPQL, spend) and returns
 *  a Czech root-cause — spam vs mis-targeting vs pricing/fit — plus the single
 *  concrete action to take. Builds the prompt + JSON schema, normalizes/validates
 *  the model output (constrains likelyCause to a known set, coercing unknowns to a
 *  default rather than failing) and provides a deterministic, data-driven demo
 *  fallback that picks the cause from the metrics. Runs through the provider-
 *  switching LLM wrapper (../../llm). The model gets ONLY real figures and must
 *  not invent any. Server-only. */
import { Type } from "@google/genai";
import {
  LEAD_SOURCE_CAUSE_LABELS,
  LEAD_SOURCE_CAUSES,
  type AiResponse,
  type LeadSourceCause,
  type LeadSourceDiagnosisRequest,
  type LeadSourceDiagnosisResult,
  type LeadSourceSeverity,
} from "../../ai-types";
import { fmtCZK, fmtInt, fmtPct, fmtSignedPct, type SupportedLocale } from "../../format";
import { generateStructured } from "../../llm";
import { txt } from "./_shared";
import { antiFabrication, demoTail } from "./_fragments";
import { missingStrFields, withObjectGuard } from "./_validate";
import { coerceEnum } from "./_coerce";
import { refineLines } from "./refine";
import { dataProvenanceLine } from "./cohort-diagnosis";

const LEAD_SOURCE_DIAGNOSIS_SYSTEM = `Jsi zkušený český analytik akvizice a kvality leadů pro B2B a lead-gen firmy. Děláš stručnou diagnostiku JEDNOHO podvýkonného zdroje leadů.

Pravidla:
- ${antiFabrication("předaných čísel")}
- Urči JEDNU nejpravděpodobnější příčinu, proč zdroj podvýkonný — a klasifikuj ji do jedné z těchto kategorií (pole „likelyCause"):
  - „spam" = levné leady, ale skoro nic se nekvalifikuje (nízká míra kvalifikace + nízká cena za lead) → boti, soutěžící, nezájemci.
  - „mis-targeting" = leady se kvalifikují, ale skoro nic se neuzavře (slušná míra kvalifikace, nízký win rate) → špatné cílení / nesoulad (fit).
  - „pricing" = drahá akvizice na kvalifikovaný lead (vysoké CPQL) i přes rozumnou kvalifikaci → cena/rozpočet.
  - „volume" = příliš málo dat na spolehlivý závěr (velmi málo leadů) → sbírat víc dat.
  - „ok" = zdroj nemá zásadní problém.
- Doporuč JEDNU nejúčinnější, konkrétní akci (např. přitvrdit kvalifikaci formuláře a vyloučit boty; přecílit publikum; přesunout rozpočet ke kvalitnějším zdrojům; sbírat víc dat) — akčně, ne obecně.
- Jsou-li v datech uvedeny i ostatní zdroje pro srovnání a doporučuješ přesun rozpočtu, jmenuj KONKRÉTNÍ lepší zdroj podle jeho čísel — ne obecně „ke kvalitnějším zdrojům".
- Je-li uveden VÝVOJ oproti minulému období (drift CPQL, kvalifikace, win rate) nebo upozornění, zohledni ho: zhoršující se zdroj (rostoucí CPQL, klesající kvalifikace) je naléhavější a mění doporučení i závažnost.
- Je-li uvedena rychlost (dní lead → uzavřeno), vezmi ji v potaz — pomalý zdroj je jiný problém než nekvalitní.
- Odkazuj se na konkrétní čísla z dat (míra kvalifikace, win rate, CPL, CPQL, počet leadů).
- Volitelně vrať „severity" (high | medium | low) podle závažnosti.
- Piš česky, věcně, bez vaty a marketingových frází.
- Drž se zadaného JSON schématu.`;

/** The allowed cause labels for the prompt — keeps the model on the known set. */
const CAUSE_PROMPT_LINE = LEAD_SOURCE_CAUSES.map(
  (c) => `„${c}" (${LEAD_SOURCE_CAUSE_LABELS[c]})`
).join(", ");

export function buildLeadSourceDiagnosisPrompt(req: LeadSourceDiagnosisRequest): string {
  const paid = (req.spend ?? 0) > 0;
  const provenance = dataProvenanceLine(req.sample);
  const lines = [
    "Níže jsou reálná, již spočítaná data jednoho zdroje leadů (kvalifikace, uzavření, náklady).",
    "Zanalyzuj, proč zdroj podvýkonný, a připrav krátkou diagnostiku.",
    ...(provenance ? [provenance] : []),
    "",
    `ZDROJ: ${req.source}`,
    `- Leadů celkem: ${fmtInt(req.leads)}`,
    `- Z toho kvalifikovaných (SQL): ${fmtInt(req.qualified)} (míra kvalifikace ${fmtPct(req.qualRate)})`,
    `- Z toho uzavřených (won): ${fmtInt(req.won)} (win rate ${fmtPct(req.winRate)})`,
  ];
  if (paid) {
    lines.push(`- Náklady (spend): ${fmtCZK(req.spend ?? 0)}`);
    if (req.cpl != null) lines.push(`- CPL (cena za lead): ${fmtCZK(req.cpl)}`);
    if (req.costPerQualified != null)
      lines.push(`- CPQL (cena za kvalifikovaný lead): ${fmtCZK(req.costPerQualified)}`);
  } else {
    lines.push("- Neplacený zdroj (bez nákladů) — cenu/CPQL neřeš.");
  }
  // Period-over-period drift, velocity and any live alerts for this source — so the
  // diagnosis reads whether it is getting WORSE, not just its static snapshot.
  if (req.trend) {
    const parts: string[] = [];
    if (req.trend.cpqlDelta != null) parts.push(`CPQL ${fmtSignedPct(req.trend.cpqlDelta)}`);
    if (req.trend.qualRateDelta != null) parts.push(`kvalifikace ${fmtSignedPct(req.trend.qualRateDelta)}`);
    if (req.trend.winRateDelta != null) parts.push(`win rate ${fmtSignedPct(req.trend.winRateDelta)}`);
    if (parts.length > 0) lines.push(`- Vývoj oproti minulému období: ${parts.join(", ")}`);
  }
  if (req.velocityDays != null && req.velocityDays > 0) {
    lines.push(`- Rychlost lead → uzavřeno: ø ${Math.round(req.velocityDays)} dní`);
  }
  if (req.alerts && req.alerts.length > 0) {
    lines.push("- Upozornění (drift):");
    for (const a of req.alerts) lines.push(`  · ${a}`);
  }
  // WP W3-C — the CRM conversion ledger's own 30-day counts for this source.
  // AGGREGATE COUNTS ONLY (no contacts, no click ids). The anti-fabrication framing
  // is explicit because the coverage share is easy to over-read: it says how many
  // conversions can be UPLOADED, not how many happened.
  if (req.conversions) {
    lines.push(
      `- Konverzní ledger za 30 dní: ${fmtInt(req.conversions.qualified30d)} kvalifikovaných, ${fmtInt(req.conversions.won30d)} uzavřených; ${fmtPct(req.conversions.gclidPct)} z nich nese Google Click ID (podíl nahratelný do Google Ads, ne podíl úspěšnosti). Neodvozuj z těchto čísel nic nad rámec uvedených počtů.`
    );
  }
  const peers = (req.peers ?? []).filter((p) => p.source !== req.source);
  if (peers.length > 0) {
    lines.push("", "PRO SROVNÁNÍ — ostatní zdroje (kam lze případně přesunout rozpočet):");
    for (const p of peers) {
      const cpq = p.costPerQualified != null ? `, CPQL ${fmtCZK(p.costPerQualified)}` : "";
      lines.push(`- ${p.source}: kvalifikace ${fmtPct(p.qualRate)}, win rate ${fmtPct(p.winRate)}${cpq}`);
    }
  }
  lines.push(
    "",
    `Povolené hodnoty pole „likelyCause": ${CAUSE_PROMPT_LINE}.`,
    "",
    'Vrať: „summary" (krátký odstavec proč zdroj podvýkonný), „likelyCause" (jedna z povolených hodnot), „recommendation" (jedna nejúčinnější konkrétní akce) a volitelně „severity" (high | medium | low). Vycházej pouze z uvedených čísel.'
  );
  if (peers.length > 0) {
    lines.push(
      "Pokud doporučuješ přesun rozpočtu, jmenuj konkrétní lepší zdroj z výše uvedených podle čísel (vyšší kvalifikace / win rate, nižší CPQL)."
    );
  }
  lines.push(...refineLines(req.refine));
  return lines.join("\n");
}

const LEAD_SOURCE_DIAGNOSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Krátký odstavec shrnující, proč zdroj podvýkonný",
    },
    likelyCause: {
      type: Type.STRING,
      description: `Hlavní příčina, jedna z: ${LEAD_SOURCE_CAUSES.join(" | ")}`,
    },
    recommendation: {
      type: Type.STRING,
      description: "Jedna nejúčinnější konkrétní akce k řešení",
    },
    severity: {
      type: Type.STRING,
      description: "Závažnost problému: high | medium | low",
    },
  },
  required: ["summary", "likelyCause", "recommendation"],
  propertyOrdering: ["summary", "likelyCause", "recommendation", "severity"],
};

/** Coerce the model's likelyCause to a known cause, defaulting unknowns to
 *  „mis-targeting" (a safe, non-accusatory catch-all) rather than failing. */
const coerceCause = coerceEnum<LeadSourceCause, LeadSourceCause>(LEAD_SOURCE_CAUSES, "mis-targeting");

/** Coerce the model's severity to a known level, or undefined when it isn't one. */
const coerceSeverity = coerceEnum<LeadSourceSeverity, undefined>(["high", "medium", "low"], undefined);

// Deterministic thresholds mirroring the qualitative CAUSE definitions in
// LEAD_SOURCE_SYSTEM. Named + commented so the TS floor and the prompt wording
// move in lockstep (edit both together). CZK-denominated — they assume a Czech
// SMB context; a different currency/business size would want different anchors.
const MIN_LEADS_FOR_SIGNAL = 30; // fewer leads → too small a sample to blame anything but volume
const CHEAP_CPL_CZK = 200; // CPL at/under this reads as "cheap" leads (spam vs mis-targeting split)
const MIN_QUAL_RATE = 0.35; // qualification rate under this = leads don't qualify
const MIN_WIN_RATE = 0.15; // win rate under this = qualifies but doesn't close
const HIGH_CPQL_CZK = 3000; // cost per qualified lead at/over this = a pricing problem

/** Deterministic, data-driven cause from the metrics alone — the demo's pick and
 *  the floor when the model leaves likelyCause empty. Mirrors the prompt's rules:
 *  too little data → volume; cheap + barely qualifies → spam; qualifies but
 *  doesn't close → mis-targeting; expensive per qualified → pricing; else ok. */
export function pickCause(req: LeadSourceDiagnosisRequest): LeadSourceCause {
  if (req.leads < MIN_LEADS_FOR_SIGNAL) return "volume";
  const paid = (req.spend ?? 0) > 0;
  const cheap = paid && req.cpl != null && req.cpl <= CHEAP_CPL_CZK;
  if (req.qualRate < MIN_QUAL_RATE) return cheap ? "spam" : "mis-targeting";
  // Qualifies acceptably from here on.
  if (req.winRate < MIN_WIN_RATE) return "mis-targeting";
  if (paid && req.costPerQualified != null && req.costPerQualified >= HIGH_CPQL_CZK) return "pricing";
  return "ok";
}

function severityFor(cause: LeadSourceCause): LeadSourceSeverity {
  if (cause === "spam") return "high";
  if (cause === "ok" || cause === "volume") return "low";
  return "medium";
}

function normalizeLeadSourceDiagnosis(
  parsed: unknown,
  req: LeadSourceDiagnosisRequest
): LeadSourceDiagnosisResult {
  const o = parsed as Record<string, unknown> | null;
  // Per-field floor is the TAIL-FREE base — backfilling an empty summary must not carry
  // the keyless "připojte LLM" disclaimer into a real (billed) model diagnosis.
  const fallback = baseLeadSourceDiagnosis(req);

  const rawCause = txt(o?.likelyCause);
  const likelyCause = rawCause ? coerceCause(rawCause) : fallback.likelyCause;

  const result: LeadSourceDiagnosisResult = {
    summary: txt(o?.summary) || fallback.summary,
    likelyCause,
    recommendation: txt(o?.recommendation) || fallback.recommendation,
  };
  // Derive severity from the cause we ACTUALLY show when the model omits it. The old
  // `?? fallback.severity` middle term took the demo's severity (severityFor(pickCause),
  // a deterministic cause chosen independently of the model), so a model "spam" (high)
  // cause could render a green "low" pill. severityFor(likelyCause) is total, so the
  // fallback.severity term was also dead code.
  const severity = coerceSeverity(o?.severity) ?? severityFor(likelyCause);
  if (severity) result.severity = severity;
  return result;
}

/** Flag a hollow diagnosis so the wrapper re-prompts once instead of rendering an
 *  empty card the normalizer would silently paper over. Covers every required
 *  field: a missing likelyCause now fails here (→ one repair) before normalize()
 *  coerces an absent value to a default — a truncated response no longer skips
 *  straight to the demo floor. */
function validateLeadSourceDiagnosis(parsed: unknown): string[] {
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
 *  path; live per-field backfill uses baseLeadSourceDiagnosis so the disclaimer never
 *  leaks into a real, metered diagnosis. */
export function demoLeadSourceDiagnosis(
  req: LeadSourceDiagnosisRequest
): LeadSourceDiagnosisResult {
  const base = baseLeadSourceDiagnosis(req);
  return { ...base, summary: base.summary + demoTail("diagnostiku od modelu") };
}

/** Deterministic, data-driven diagnosis: pick the cause from the numbers and emit
 *  a templated Czech reading — TAIL-FREE, so it is safe both as the floor for empty
 *  model fields and as the base the demo wraps with the disclaimer. */
export function baseLeadSourceDiagnosis(
  req: LeadSourceDiagnosisRequest
): LeadSourceDiagnosisResult {
  const cause = pickCause(req);
  const paid = (req.spend ?? 0) > 0;
  const qual = fmtPct(req.qualRate);
  const win = fmtPct(req.winRate);
  const cpl = req.cpl != null ? fmtCZK(req.cpl) : "—";
  const cpq = req.costPerQualified != null ? fmtCZK(req.costPerQualified) : "—";

  // Deterministic drift note from the period-over-period trend, when the source is
  // measurably getting worse — so the demo also reflects the new signal.
  const driftNote =
    req.trend?.cpqlDelta != null && req.trend.cpqlDelta > 0.25
      ? ` Navíc CPQL vzrostlo o ${fmtSignedPct(req.trend.cpqlDelta)} oproti minulému období — zdroj se zhoršuje.`
      : "";

  let summary: string;
  let recommendation: string;
  switch (cause) {
    case "spam":
      summary = `Zdroj „${req.source}" přináší levné leady (CPL ${cpl}), ale kvalifikuje se jen ${qual} — typický obraz spamu / nezájemců (boti, soutěžící, nerelevantní poptávky).`;
      recommendation = `Přitvrďte kvalifikaci hned u formuláře (povinná pole, ověření, vyloučení botů) a optimalizujte na kvalifikované leady, ne na počet odeslání. Pokud kvalita nestoupne, utlumte rozpočet a přesuňte ho ke zdrojům s vyšší mírou kvalifikace.`;
      break;
    case "mis-targeting":
      summary = `Zdroj „${req.source}" se kvalifikuje slušně (${qual}), ale uzavře se jen ${win} — to ukazuje na nesoulad cílení (fit), ne na spam: leady projdou kvalifikací, ale neodpovídají ideálnímu zákazníkovi.`;
      recommendation = `Zužte cílení podle profilů, které reálně uzavíráte (obor, velikost, region), a slaďte nabídku/zprávu se segmentem — sledujte win rate, ne jen počet kvalifikovaných.`;
      break;
    case "pricing":
      summary = `Zdroj „${req.source}" se kvalifikuje (${qual}), ale kvalifikovaný lead stojí ${cpq} — akvizice je drahá vůči výsledku. Problém je cena/rozpočet, ne kvalita poptávek.`;
      recommendation = `Snižte CPQL: utlumte nejdražší klíčová slova / publika, posuňte rozpočet ke zdrojům s nižším CPQL a nasaďte limity, dokud se cena za kvalifikovaný lead nesrovná.`;
      break;
    case "volume":
      summary = `Zdroj „${req.source}" má zatím jen ${fmtInt(req.leads)} leadů — to je málo na spolehlivý závěr o kvalitě (míra kvalifikace ${qual}, win rate ${win} jsou statisticky nejisté).`;
      recommendation = `Sbírejte víc dat, než budete zdroj škálovat nebo vypínat — nastavte sledování lead → kvalifikovaný → uzavřený a vyhodnoťte znovu při vyšším objemu.`;
      break;
    default:
      summary = `Zdroj „${req.source}" nemá zásadní problém: kvalifikace ${qual} a win rate ${win}${paid ? ` při CPQL ${cpq}` : ""} drží v rozumných mezích.`;
      recommendation = `Zdroj funguje — udržte cílení i rozpočet a zvažte opatrné škálování, dokud zůstanou míra kvalifikace i win rate stabilní.`;
      break;
  }

  return {
    summary: summary + driftNote,
    likelyCause: cause,
    recommendation,
    severity: severityFor(cause),
  };
}

export function generateLeadSourceDiagnosis(
  req: LeadSourceDiagnosisRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<LeadSourceDiagnosisResult>> {
  return generateStructured({
    // llm-tool: lead-source-diagnosis
    id: "lead-source-diagnosis",
    prompt: buildLeadSourceDiagnosisPrompt(req),
    system: LEAD_SOURCE_DIAGNOSIS_SYSTEM,
    schema: LEAD_SOURCE_DIAGNOSIS_SCHEMA,
    temperature: 0.6,
    normalize: (parsed) => normalizeLeadSourceDiagnosis(parsed, req),
    validate: (parsed) => validateLeadSourceDiagnosis(parsed),
    demo: () => demoLeadSourceDiagnosis(req),
    locale,
    signal,
  });
}
