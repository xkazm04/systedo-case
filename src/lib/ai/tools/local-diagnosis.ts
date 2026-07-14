/** AI tool — local diagnosis (grounded in a local business's computed map-pack
 *  coverage, ranking ladder, review sentiment and location health). Reads the
 *  figures the Lokální module already resolved (live when imported, else the honest
 *  sample) and returns a concise Czech diagnosis: which coverage gap to close first
 *  and the single action to take. Builds the prompt + JSON schema, normalizes /
 *  validates the model output (worstGap must be one of the supplied gaps —
 *  domain-limited like cohort's worstCohort) and provides a deterministic,
 *  data-driven demo fallback that picks the highest-volume gap. Runs through the
 *  provider-switching LLM wrapper (../../llm). The model gets ONLY real figures and
 *  must not invent any. Server-only. */
import { Type } from "@google/genai";
import type {
  AiResponse,
  LocalDiagnosisGap,
  LocalDiagnosisRequest,
  LocalDiagnosisResult,
} from "../../ai-types";
import { fmtInt, fmtPct, type SupportedLocale } from "../../format";
import { generateStructured } from "../../llm";
import { txt, cleanList } from "./_shared";
import { antiFabrication, demoTail } from "./_fragments";
import { missingStrFields, withObjectGuard } from "./_validate";
import { refineLines } from "./refine";

function localDiagnosisSystem(): string {
  return `Jsi zkušený český specialista na lokální SEO a Google Business Profile (mapa-pack, pokrytí služeb v lokalitách, recenze). Děláš stručnou diagnostiku lokální viditelnosti pro majitele podniku.

Pravidla:
- ${antiFabrication("předaných spočítaných čísel")} Nevymýšlej si žádné lokality, služby ani metriky, které v datech nejsou.
- Urči JEDNU mezeru v pokrytí (kombinaci služba×lokalita), kterou má smysl uzavřít jako první, a pojmenuj ji PŘESNĚ tak, jak je označená v datech (pole „worstGap" musí být jeden z povolených názvů).
- Zohledni objem hledání: mezera s vyšší měsíční hledaností a bez pokrytí je obvykle přednější než okrajová.
- Doporuč JEDNU nejúčinnější akci, kterou řešit jako první (nasadit lokální microsite + Google profil, posílit slabou pozici do top 3, nebo odpovědět na negativní recenze) — konkrétně a akčně, ne obecně.
- Odkazuj se na konkrétní čísla z dat (pokrytí %, objem v mezerách, průměrná pozice, podíl v top 3, počet recenzí a hodnocení).
- Je-li uveden trend pozic (posun od posledního importu), zohledni ho: zhoršující se pozice je naléhavější než stabilní.
- Cíl je co nejvyšší pokrytí a co nejvíc kombinací v top 3 (mapa-pack); nezodpovězené negativní recenze snižují důvěru.
- Piš česky, věcně, bez vaty a marketingových frází.
- Drž se zadaného JSON schématu.`;
}

/** The coverage headline + the allowed-gap list as prompt lines. */
function coverageLines(req: LocalDiagnosisRequest): string[] {
  const lines = [
    `Pokrytí: ${fmtPct(req.coveragePct, 0)} (${fmtInt(req.withPage)} z ${fmtInt(
      req.trackedCombos
    )} sledovaných kombinací služba×lokalita má vlastní stránku).`,
    `Objem hledání bez pokrytí (v mezerách): ${fmtInt(req.gapVolume)} / měsíc.`,
  ];
  if (req.gaps.length > 0) {
    lines.push(`Mezery v pokrytí (od nejvyššího objemu; „worstGap" musí být jeden z těchto názvů):`);
    for (const g of req.gaps) {
      lines.push(`  - ${g.label}: ${fmtInt(g.monthlyVolume)} hledání/měs., bez stránky`);
    }
  }
  return lines;
}

/** The ladder rollup as a prompt line, when present. */
function ladderLine(req: LocalDiagnosisRequest): string | null {
  const l = req.ladder;
  if (!l || l.tracked === 0) return null;
  const src = l.live ? "živá data" : "ukázková data";
  const trend =
    l.spanDays > 0 && l.improved + l.declined > 0
      ? ` Trend za ${fmtInt(l.spanDays)} dní: ${fmtInt(l.improved)} zlepšeno, ${fmtInt(
          l.declined
        )} zhoršeno (čistý posun ${l.netSinceLast > 0 ? "+" : ""}${l.netSinceLast}).`
      : "";
  return `Mapa-pack pozice [zdroj: ${src}]: v top 3 je ${fmtInt(l.inPack)} z ${fmtInt(
    l.tracked
  )} kombinací (${fmtPct(l.packRate, 0)}), na 1. místě ${fmtInt(l.top1)}; průměrná pozice ${l.avgRank.toFixed(
    1
  )}.${trend}`;
}

/** The review-sentiment rollup as a prompt line, when present. */
function reviewsLine(req: LocalDiagnosisRequest): string | null {
  const r = req.reviews;
  if (!r || r.total === 0) return null;
  const src = r.live ? "živá data" : "ukázková data";
  return `Recenze [zdroj: ${src}]: ${fmtInt(r.total)} hodnocení, průměr ${r.avg.toFixed(
    1
  )}★; pozitivních ${fmtInt(r.positive)}, neutrálních ${fmtInt(r.neutral)}, negativních ${fmtInt(r.negative)}.`;
}

/** The location-roster attention rollup as a prompt line, when present. */
function locationsLine(req: LocalDiagnosisRequest): string | null {
  const l = req.locations;
  if (!l || l.total === 0) return null;
  return `Pobočky: ${fmtInt(l.total)} lokalit, z toho ${fmtInt(
    l.attention
  )} vyžaduje pozornost; nezodpovězených recenzí celkem ${fmtInt(l.unanswered)}.`;
}

function buildLocalDiagnosisPrompt(req: LocalDiagnosisRequest): string {
  const labels = req.gaps.map((g) => g.label).join(", ");
  return [
    req.businessName ? `Podnik: ${req.businessName}.` : "",
    "Níže jsou reálná, již spočítaná data lokální viditelnosti. Zanalyzuj je a připrav krátkou diagnostiku.",
    "",
    "POKRYTÍ:",
    ...coverageLines(req),
    "",
    "DALŠÍ SIGNÁLY:",
    ...[ladderLine(req), reviewsLine(req), locationsLine(req)].filter((l): l is string => l !== null),
    "",
    labels ? `Povolené názvy pro pole „worstGap": ${labels}.` : "",
    'Vrať: „summary" (krátký odstavec čtení lokální viditelnosti), „worstGap" (přesný název mezery, kterou uzavřít první, z povolených názvů), „recommendation" (jedna nejúčinnější akce k řešení jako první) a volitelně „risks" (1–3 rizika). Vycházej pouze z uvedených čísel.',
    ...refineLines(req.refine),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const LOCAL_DIAGNOSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "Krátký odstavec shrnující lokální viditelnost" },
    worstGap: {
      type: Type.STRING,
      description: "Přesný název mezery v pokrytí z předaných dat, kterou uzavřít jako první",
    },
    recommendation: {
      type: Type.STRING,
      description: "Jedna nejúčinnější akce, kterou řešit jako první (konkrétní akce)",
    },
    risks: {
      type: Type.ARRAY,
      description: "1–3 rizika nebo na co si dát pozor",
      items: { type: Type.STRING },
    },
  },
  required: ["summary", "worstGap", "recommendation"],
  propertyOrdering: ["summary", "worstGap", "recommendation", "risks"],
};

/** The highest-volume gap — the deterministic "worst" pick used by the demo and as
 *  the floor for an empty / off-list model worstGap. */
function worstGapOf(gaps: LocalDiagnosisGap[]): LocalDiagnosisGap | null {
  if (gaps.length === 0) return null;
  return gaps.reduce((worst, g) => (g.monthlyVolume > worst.monthlyVolume ? g : worst), gaps[0]!);
}

export function normalizeLocalDiagnosis(
  parsed: unknown,
  req: LocalDiagnosisRequest
): LocalDiagnosisResult {
  const o = parsed as Record<string, unknown> | null;
  const labels = new Set(req.gaps.map((g) => g.label));
  const fallback = demoLocalDiagnosis(req);

  // Keep the model's worstGap only when it names a real gap; otherwise fall back to
  // the deterministically highest-volume pick so the field is always valid.
  const rawWorst = txt(o?.worstGap);
  const worstGap = labels.has(rawWorst) ? rawWorst : fallback.worstGap;

  const risks = cleanList(o?.risks, 3);
  const result: LocalDiagnosisResult = {
    summary: txt(o?.summary) || fallback.summary,
    worstGap,
    recommendation: txt(o?.recommendation) || fallback.recommendation,
  };
  if (risks.length > 0) result.risks = risks;
  else if (fallback.risks && fallback.risks.length > 0) result.risks = fallback.risks;
  return result;
}

/** Flag a hollow diagnosis (no summary / recommendation, or a worstGap that isn't
 *  one of the supplied labels) so the wrapper re-prompts once instead of rendering
 *  an empty card the normalizer would silently paper over. */
export function validateLocalDiagnosis(parsed: unknown, req: LocalDiagnosisRequest): string[] {
  return withObjectGuard((o) => {
    const labels = new Set(req.gaps.map((g) => g.label));
    const v = missingStrFields(o, [
      ["summary", "Chybí shrnutí (summary)."],
      ["recommendation", "Chybí doporučení (recommendation)."],
    ]);
    const worst = txt(o.worstGap);
    if (!worst) v.push("Chybí název mezery (worstGap).");
    else if (labels.size > 0 && !labels.has(worst)) {
      v.push(`„worstGap" musí být jedna z předaných mezer: ${[...labels].join(", ")}.`);
    }
    return v;
  })(parsed);
}

/** Deterministic, data-driven diagnosis: pick the highest-volume coverage gap and
 *  emit a templated Czech reading. The keyless demo and the floor for empty fields. */
export function demoLocalDiagnosis(req: LocalDiagnosisRequest): LocalDiagnosisResult {
  const worst = worstGapOf(req.gaps);
  if (!worst) {
    return {
      summary:
        `Pokrytí je ${fmtPct(req.coveragePct, 0)} (${fmtInt(req.withPage)} z ${fmtInt(
          req.trackedCombos
        )} kombinací) a v datech nejsou žádné otevřené mezery k uzavření.` +
        demoTail("diagnostiku od modelu"),
      worstGap: "—",
      recommendation:
        "Držte pokrytí a soustřeďte se na posun slabých pozic do top 3 a odpovídání na recenze.",
    };
  }

  const rec = req.reviews;
  const ladder = req.ladder;
  const negNudge =
    rec && rec.negative > 0
      ? ` Zároveň máte ${fmtInt(rec.negative)} negativních recenzí — odpovídejte na ně, ať neztrácíte důvěru.`
      : "";

  const recommendation = `Nasaďte lokální microsite pro „${worst.label}" (${fmtInt(
    worst.monthlyVolume
  )} hledání/měs. bez pokrytí) a napojte na ni Google Business profil — je to největší nepokrytá poptávka.${negNudge}`;

  const risks: string[] = [];
  if (ladder && ladder.tracked > 0 && ladder.packRate < 0.5) {
    risks.push(
      `Jen ${fmtPct(ladder.packRate, 0)} sledovaných kombinací je v top 3 (mapa-pack) — bez posílení pozic zůstává viditelnost nízká.`
    );
  }
  if (ladder && ladder.spanDays > 0 && ladder.declined > ladder.improved) {
    risks.push(
      `Za posledních ${fmtInt(ladder.spanDays)} dní se víc kombinací zhoršilo (${fmtInt(
        ladder.declined
      )}) než zlepšilo (${fmtInt(ladder.improved)}) — trend klesá.`
    );
  }
  if (rec && rec.total > 0 && rec.negative > 0) {
    risks.push(`${fmtInt(rec.negative)} negativních recenzí bez odpovědi snižuje důvěru u nových zákazníků.`);
  }

  const packStr =
    ladder && ladder.tracked > 0
      ? ` V mapa-packu (top 3) je ${fmtInt(ladder.inPack)} z ${fmtInt(ladder.tracked)} kombinací.`
      : "";

  return {
    summary: `Pokrytí je ${fmtPct(req.coveragePct, 0)} (${fmtInt(req.withPage)} z ${fmtInt(
      req.trackedCombos
    )} kombinací), v mezerách leží ${fmtInt(
      req.gapVolume
    )} hledání měsíčně. Největší nepokrytá poptávka je „${worst.label}" (${fmtInt(
      worst.monthlyVolume
    )} hledání/měs.).${packStr}${demoTail("diagnostiku od modelu")}`,
    worstGap: worst.label,
    recommendation,
    risks: risks.length > 0 ? risks : undefined,
  };
}

export function generateLocalDiagnosis(
  req: LocalDiagnosisRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<LocalDiagnosisResult>> {
  return generateStructured({
    // llm-tool: local-diagnosis
    id: "local-diagnosis",
    prompt: buildLocalDiagnosisPrompt(req),
    system: localDiagnosisSystem(),
    schema: LOCAL_DIAGNOSIS_SCHEMA,
    temperature: 0.6,
    normalize: (parsed) => normalizeLocalDiagnosis(parsed, req),
    validate: (parsed) => validateLocalDiagnosis(parsed, req),
    demo: () => demoLocalDiagnosis(req),
    locale,
    signal,
  });
}
