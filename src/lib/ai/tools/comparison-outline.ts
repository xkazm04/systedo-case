/** AI tool — comparison-page generator. From a single high-intent comparison
 *  query + its intent (vs / alternative / pricing / review) it returns a
 *  publish-ready comparison-page scaffold: H1, ordered sections (heading + bullet
 *  points), the comparison criteria to evaluate against, a verdict and a FAQ —
 *  NOT a generic SEO brief. The framing is intent-aware (a „vs" query wants a
 *  head-to-head; „alternative" an alternatives roundup + migration angle;
 *  „pricing" a pricing breakdown; „review" a verdict-first review).
 *
 *  Scope: query + intent, plus an OPTIONAL user-supplied competitor name + their
 *  own positioning — when given, the page grounds in those real entities; without
 *  them the model keeps names generic rather than invent competitor facts. Runs
 *  through the provider-switching LLM wrapper (../../llm).
 *  A deterministic demo() builds an intent-templated scaffold so a clean checkout
 *  works keyless. Server-only. */
import { Type } from "@google/genai";
import type {
  AiResponse,
  ComparisonOutlineRequest,
  ComparisonOutlineResult,
  ComparisonOutlineSection,
} from "../../ai-types";
import { COMPARE_INTENT_LABELS } from "../../ai-types";
import type { SupportedLocale } from "@/lib/format";
import { generateStructured } from "../../llm";
import { txt, cleanList } from "./_shared";

const COMPARISON_OUTLINE_SYSTEM = `Jsi český SEO obsahový stratég specializovaný na srovnávací stránky s vysokým nákupním záměrem (typu „X vs Y", „alternativy k X", „ceník X", „recenze X"). Z jednoho cílového dotazu připravuješ kostru srovnávací stránky připravenou k publikaci — ne obecný brief.

Pravidla:
- Piš výhradně česky, gramaticky správně, s diakritikou a bez prázdných korporátních frází.
- Přizpůsob strukturu ZÁMĚRU dotazu:
  - „srovnání" (vs): přímé srovnání hlava na hlavu — kritéria vedle sebe, kdy zvolit které řešení, závěr s jasným doporučením.
  - „alternativa": přehled alternativ + úhel migrace (proč a jak přejít, na co si dát pozor při přechodu).
  - „cena": rozbor cen a balíčků — z čeho se cena skládá, skryté náklady, poměr cena/výkon, pro koho se vyplatí.
  - „recenze": recenze s verdiktem — silné a slabé stránky, pro koho ano / pro koho ne, jasný verdikt.
- Vrať „h1" — výstižný nadpis stránky odpovídající dotazu a záměru.
- Vrať „sections" — 4–7 logicky řazených sekcí. Každá sekce má „heading" (nadpis H2) a „points" (2–5 konkrétních odrážek, co sekce pokryje).
- Vrať „comparisonCriteria" — 4–8 kritérií, podle kterých se řešení porovnávají (např. cena, funkce, podpora, integrace, náročnost nasazení). Krátká, konkrétní.
- Vrať „verdict" — 1–2 věty se shrnujícím doporučením / závěrem stránky.
- Vrať „faq" — 3–5 častých dotazů (q) a stručných odpovědí (a) navázaných na téma a záměr.
- Jsou-li uvedeny KONKURENT a/nebo VAŠE POZICE, ber je jako reálná data: jmenuj konkurenta a opři srovnání, kritéria i verdikt o uvedené odlišnosti. Nejsou-li uvedeny, nevymýšlej si konkrétní fakta, ceny ani názvy produktů — mluv obecně („daný nástroj", „alternativní řešení") a obsah ať je kostra k doplnění redaktorem.
- Vrať POUZE jeden validní JSON objekt dle schématu — žádný text okolo, žádné markdown bloky, žádné komentáře.`;

function buildComparisonOutlinePrompt(req: ComparisonOutlineRequest): string {
  const grounded = Boolean(req.competitor || req.positioning);
  return [
    "Připrav kostru srovnávací stránky pro tento cílový dotaz.",
    "",
    `Cílový dotaz (hlavní klíčové slovo): ${req.query}`,
    `Záměr dotazu: ${COMPARE_INTENT_LABELS[req.intent]} (${req.intent})`,
    typeof req.volume === "number" && req.volume > 0
      ? `Měsíční hledanost: ${req.volume}`
      : "",
    req.competitor ? `Konkurent / srovnávané řešení: ${req.competitor}` : "",
    req.positioning
      ? `Vaše pozice a odlišnosti (REÁLNÁ data — opři se o ně): ${req.positioning}`
      : "",
    "",
    "Sestav kostru přizpůsobenou záměru (viz pravidla):",
    "- h1: nadpis stránky,",
    "- sections: 4–7 sekcí, každá { heading, points[] },",
    "- comparisonCriteria: 4–8 kritérií pro porovnání,",
    "- verdict: shrnující doporučení (1–2 věty),",
    "- faq: 3–5 dotazů { q, a }.",
    "",
    grounded
      ? "Použij uvedeného konkurenta a vaši pozici jako reálná data — jmenuj je a opři o ně srovnání, kritéria i verdikt."
      : "Žádná konkrétní konkurenční data nemáš — drž obsah obecný a doplnitelný redaktorem.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const COMPARISON_OUTLINE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    h1: { type: Type.STRING, description: "Nadpis srovnávací stránky (H1)" },
    sections: {
      type: Type.ARRAY,
      description: "Sekce stránky v logickém pořadí (4–7)",
      items: {
        type: Type.OBJECT,
        properties: {
          heading: { type: Type.STRING, description: "Nadpis sekce (H2)" },
          points: {
            type: Type.ARRAY,
            description: "2–5 konkrétních odrážek, co sekce pokryje",
            items: { type: Type.STRING },
          },
        },
        required: ["heading", "points"],
        propertyOrdering: ["heading", "points"],
      },
    },
    comparisonCriteria: {
      type: Type.ARRAY,
      description: "Kritéria, podle kterých se řešení porovnávají (4–8)",
      items: { type: Type.STRING },
    },
    verdict: { type: Type.STRING, description: "Shrnující doporučení / závěr (1–2 věty)" },
    faq: {
      type: Type.ARRAY,
      description: "Časté dotazy a odpovědi (3–5)",
      items: {
        type: Type.OBJECT,
        properties: {
          q: { type: Type.STRING },
          a: { type: Type.STRING },
        },
        required: ["q", "a"],
        propertyOrdering: ["q", "a"],
      },
    },
  },
  required: ["h1", "sections", "comparisonCriteria", "verdict", "faq"],
  propertyOrdering: ["h1", "sections", "comparisonCriteria", "verdict", "faq"],
};

/** Sanitize one raw model section into a valid section, or null to drop it. */
function toSection(raw: unknown): ComparisonOutlineSection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const heading = txt(o.heading);
  if (!heading) return null;
  return { heading: heading.slice(0, 160), points: cleanList(o.points, 6).map((p) => p.slice(0, 240)) };
}

function normalizeFaq(parsed: unknown): ComparisonOutlineResult["faq"] {
  return Array.isArray(parsed)
    ? parsed
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map((x) => ({ q: txt(x.q).slice(0, 240), a: txt(x.a).slice(0, 600) }))
        .filter((x) => x.q && x.a)
        .slice(0, 6)
    : [];
}

/** Deterministic, intent-templated scaffold — the keyless demo and the floor when
 *  the model returns nothing usable. Builds a publish-ready comparison page
 *  skeleton from the query + intent alone (no invented competitor facts). */
function demoComparisonOutline(req: ComparisonOutlineRequest): ComparisonOutlineResult {
  const q = req.query.trim();
  const criteria = ["Funkce a možnosti", "Cena a balíčky", "Snadnost použití", "Podpora a dokumentace", "Integrace", "Pro koho se hodí"];

  let h1: string;
  let sections: ComparisonOutlineSection[];
  let verdict: string;
  let faq: ComparisonOutlineResult["faq"];

  switch (req.intent) {
    case "vs":
      h1 = `${q}: přímé srovnání`;
      sections = [
        { heading: "Stručné shrnutí na úvod", points: ["Pro koho je který z nástrojů vhodný", "Hlavní rozdíl v jedné větě"] },
        { heading: "Srovnávací tabulka kritérií", points: criteria.slice(0, 5).map((c) => `Porovnání: ${c}`) },
        { heading: "Kdy zvolit první řešení", points: ["Ideální scénáře nasazení", "Silné stránky", "Omezení, na která narazíte"] },
        { heading: "Kdy zvolit druhé řešení", points: ["Ideální scénáře nasazení", "Silné stránky", "Omezení, na která narazíte"] },
        { heading: "Závěr a doporučení", points: ["Která volba pro koho", "Další kroky"] },
      ];
      verdict = "Volbu řiďte podle priorit: pro většinu týmů rozhoduje poměr cena/funkce a náročnost nasazení — kostru doplňte reálnými daty obou řešení.";
      faq = [
        { q: `Které řešení je v „${q}“ levnější?`, a: "Doplňte podle aktuálních ceníků obou nástrojů — cena se liší podle balíčku a počtu uživatelů." },
        { q: "Lze mezi nástroji snadno přejít?", a: "Většinou ano přes export/import dat; ověřte podporované formáty a limity migrace." },
        { q: "Pro koho se který nástroj hodí?", a: "Doplňte cílové segmenty (velikost týmu, obor, rozpočet) podle reálných parametrů." },
      ];
      break;
    case "alternative":
      h1 = `${q}: nejlepší alternativy`;
      sections = [
        { heading: "Proč hledat alternativu", points: ["Typické důvody k přechodu", "Na co se při výběru zaměřit"] },
        { heading: "Přehled alternativ", points: ["Krátký profil každé alternativy", "Pro koho se hodí", "Hlavní výhoda a nevýhoda"] },
        { heading: "Srovnání podle kritérií", points: criteria.slice(0, 5).map((c) => `Jak si alternativy stojí: ${c}`) },
        { heading: "Jak na migraci", points: ["Postup přechodu krok za krokem", "Co převést jako první", "Na co si dát pozor"] },
        { heading: "Doporučení", points: ["Která alternativa pro jaký typ uživatele"] },
      ];
      verdict = "Nejlepší alternativa závisí na rozpočtu, velikosti týmu a nutných integracích — kostru doplňte konkrétními kandidáty a daty z migrace.";
      faq = [
        { q: `Jaká je nejlepší alternativa pro „${q}“?`, a: "Záleží na prioritách — doplňte konkrétní kandidáty podle rozpočtu a potřebných funkcí." },
        { q: "Jak náročný je přechod?", a: "Obvykle jde o export a import dat; zmapujte podporované formáty a případná omezení." },
        { q: "Přijdu při migraci o data?", a: "Při správném postupu ne — ověřte zálohu a kompletnost exportu před přechodem." },
      ];
      break;
    case "pricing":
      h1 = `${q}: rozbor cen a balíčků`;
      sections = [
        { heading: "Z čeho se cena skládá", points: ["Cenové úrovně / balíčky", "Platba měsíčně vs. ročně", "Co je v základu zdarma"] },
        { heading: "Skryté a vedlejší náklady", points: ["Příplatky za uživatele / funkce", "Náklady na nasazení a školení"] },
        { heading: "Poměr cena / výkon", points: criteria.slice(0, 4).map((c) => `Co za cenu dostanete: ${c}`) },
        { heading: "Pro koho se vyplatí", points: ["Doporučený balíček podle velikosti týmu", "Kdy se vyplatí vyšší tarif"] },
        { heading: "Závěr", points: ["Shrnutí cenové výhodnosti", "Další kroky"] },
      ];
      verdict = "Nejvýhodnější balíček závisí na počtu uživatelů a potřebných funkcích — kostru doplňte aktuálním ceníkem a modelovým výpočtem.";
      faq = [
        { q: `Kolik stojí „${q}“?`, a: "Doplňte aktuální ceny jednotlivých balíčků — cena se odvíjí od tarifu a počtu uživatelů." },
        { q: "Je k dispozici verze zdarma?", a: "Ověřte, zda existuje free tarif nebo zkušební období a jaká má omezení." },
        { q: "Vyplatí se roční platba?", a: "Roční platba bývá levnější; doplňte konkrétní procento slevy oproti měsíční platbě." },
      ];
      break;
    case "review":
      h1 = `${q}: recenze a verdikt`;
      sections = [
        { heading: "Verdikt v kostce", points: ["Hodnocení v jedné větě", "Pro koho ano, pro koho ne"] },
        { heading: "Co se nám líbí", points: ["Silné stránky", "Kde nástroj vyniká"] },
        { heading: "Co bychom vytkli", points: ["Slabé stránky", "Omezení a kompromisy"] },
        { heading: "Hodnocení podle kritérií", points: criteria.slice(0, 5).map((c) => `Jak obstál: ${c}`) },
        { heading: "Závěrečné doporučení", points: ["Komu nástroj doporučit", "Vhodné alternativy"] },
      ];
      verdict = "Celkové hodnocení doplňte podle reálné zkušenosti — kostra pokrývá silné i slabé stránky a jasné doporučení pro cílového čtenáře.";
      faq = [
        { q: `Stojí „${q}“ za to?`, a: "Doplňte verdikt podle reálné zkušenosti — pro koho se vyplatí a pro koho ne." },
        { q: "Jaké jsou hlavní nevýhody?", a: "Shrňte zjištěná omezení a kompromisy z testu." },
        { q: "Existuje lepší alternativa?", a: "Uveďte 1–2 alternativy a kdy dávají větší smysl." },
      ];
      break;
  }

  return {
    h1,
    sections,
    comparisonCriteria: criteria.slice(0, 6),
    verdict,
    faq,
  };
}

/** Flag a hollow scaffold (no h1, no sections or no FAQ) so the wrapper re-prompts
 *  once instead of rendering an empty page the normalizer would paper over. */
function validateComparisonOutline(parsed: unknown): string[] {
  const o = parsed as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return [];
  const v: string[] = [];
  if (!txt(o.h1)) v.push("Chybí nadpis stránky (h1).");
  const sections = Array.isArray(o.sections)
    ? o.sections.map(toSection).filter((s): s is ComparisonOutlineSection => s !== null)
    : [];
  if (sections.length === 0) {
    v.push("Kostra neobsahuje žádnou sekci — vrať pole „sections“ s alespoň jednou sekcí.");
  }
  const faq = normalizeFaq(o.faq);
  if (faq.length === 0) {
    v.push("Chybí časté dotazy — vrať pole „faq“ s alespoň jedním dotazem a odpovědí.");
  }
  return v;
}

export function generateComparisonOutline(
  req: ComparisonOutlineRequest,
  locale?: SupportedLocale
): Promise<AiResponse<ComparisonOutlineResult>> {
  const fallback = (): ComparisonOutlineResult => demoComparisonOutline(req);

  const normalize = (parsed: unknown): ComparisonOutlineResult => {
    const o = parsed as Record<string, unknown> | null;
    const demo = fallback();
    const h1 = txt(o?.h1) || demo.h1;
    const sections = Array.isArray(o?.sections)
      ? o.sections.map(toSection).filter((s): s is ComparisonOutlineSection => s !== null).slice(0, 8)
      : [];
    const comparisonCriteria = cleanList(o?.comparisonCriteria, 8).map((c) => c.slice(0, 80));
    const verdict = txt(o?.verdict);
    const faq = normalizeFaq(o?.faq);
    return {
      h1: h1.slice(0, 200),
      sections: sections.length ? sections : demo.sections,
      comparisonCriteria: comparisonCriteria.length ? comparisonCriteria : demo.comparisonCriteria,
      verdict: verdict || demo.verdict,
      faq: faq.length ? faq : demo.faq,
    };
  };

  return generateStructured({
    // llm-tool: comparison-outline
    id: "comparison-outline",
    prompt: buildComparisonOutlinePrompt(req),
    system: COMPARISON_OUTLINE_SYSTEM,
    schema: COMPARISON_OUTLINE_SCHEMA,
    temperature: 0.7,
    normalize,
    validate: validateComparisonOutline,
    demo: fallback,
    locale,
  });
}
