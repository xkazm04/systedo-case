/** AI tool — onboarding website scan. From the text of a new user's own homepage
 *  (fetched + injected server-side, SSRF-guarded) it extracts a structured business
 *  profile: what they sell, to whom, in what voice, plus seed keywords and likely
 *  competitors. One click then applies it — seeding the competitor set + the profile
 *  every grounded module reads — so the whole app speaks the user's real business
 *  instead of the Mionelo/Dentalis sample.
 *
 *  Grounded strictly in the supplied page text: the model must not invent facts the
 *  page doesn't support; competitors are explicitly SUGGESTIONS the user confirms.
 *  normalize() coerces fields, caps the arrays and constrains suggestedType to the
 *  known set; a deterministic demo() builds a generic profile from the brand/type so
 *  the keyless path still returns something usable. Runs through the provider-
 *  switching LLM wrapper (../../llm). Server-only. */
import { Type } from "@google/genai";
import type {
  AiResponse,
  OnboardingScanRequest,
  OnboardingScanResult,
} from "../../ai-types";
import type { SupportedLocale } from "@/lib/format";
import { generateStructured } from "../../llm";
import { cleanList, digest, txt } from "./_shared";
import { refineLines } from "./refine";

const ONBOARDING_SCAN_SYSTEM = `Jsi český business analytik pro marketingový nástroj. Z textu domovské stránky webu vytáhneš stručný, věcný profil firmy, kterým se pak naplní celý nástroj.

Pravidla:
- Vycházej VÝHRADNĚ z předaného textu stránky. Nevymýšlej si nic, co v textu není.
- Urči:
  - „businessName" = název firmy / značky (z textu nebo titulku stránky),
  - „summary" = 1–2 věty, čím se firma zabývá,
  - „offering" = co konkrétně prodává nebo nabízí (hlavní kategorie / produkty / služby),
  - „audience" = pro koho to je (cílové publikum),
  - „toneOfVoice" = krátký popis tónu komunikace (např. „přátelský a odborný"),
  - „keywords" = 4–8 klíčových slov, která by publikum reálně hledalo,
  - „competitors" = 0–5 pravděpodobných konkurentů. TOTO JSOU NÁVRHY k potvrzení uživatelem — pokud si nejsi jistý, vrať prázdné pole. Nikdy netvrď o konkurenci žádná fakta ani čísla.
  - „suggestedType" = nejvhodnější typ projektu, jedna z hodnot: eshop (prodej fyzického zboží), app (SaaS / aplikace), leadgen (poptávky po službách), content (obsahový web), local (lokální podnik s provozovnou).
- Piš česky, věcně, bez marketingových frází, a vracej POUZE jeden validní JSON objekt dle schématu — žádný text okolo.`;

const TYPE_HINT: Record<string, string> = {
  eshop: "e-shop (prodej fyzického zboží)",
  app: "digitální produkt / SaaS aplikace",
  leadgen: "generování poptávek (leadgen) pro služby",
  content: "obsahový web / publisher",
  local: "lokální podnik / služby s provozovnou",
};

function buildOnboardingScanPrompt(req: OnboardingScanRequest): string {
  const lines = [
    "Vytáhni profil firmy z textu její domovské stránky.",
    "",
    `URL: ${req.url}`,
  ];
  if (req.siteTitle) lines.push(`Titulek stránky: ${req.siteTitle}`);
  if (req.siteDescription) lines.push(`Popis stránky: ${req.siteDescription}`);
  if (req.brand) lines.push(`Název projektu (nápověda): ${req.brand}`);
  if (req.projectType && TYPE_HINT[req.projectType]) {
    lines.push(`Typ projektu (nápověda): ${TYPE_HINT[req.projectType]}`);
  }
  lines.push(
    "",
    "TEXT STRÁNKY:",
    digest(txt(req.pageText), 6000) || "(stránka neobsahovala čitelný text)",
    "",
    "Vrať profil firmy dle schématu: businessName, summary, offering, audience, toneOfVoice, keywords, competitors (návrhy k potvrzení — když si nejsi jistý, prázdné pole) a suggestedType."
  );
  lines.push(...refineLines(req.refine));
  return lines.filter((l) => l !== "").join("\n");
}

const ONBOARDING_SCAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    businessName: { type: Type.STRING, description: "Název firmy / značky" },
    summary: { type: Type.STRING, description: "1–2 věty, čím se firma zabývá" },
    offering: { type: Type.STRING, description: "Co firma prodává / nabízí" },
    audience: { type: Type.STRING, description: "Cílové publikum" },
    toneOfVoice: { type: Type.STRING, description: "Krátký popis tónu komunikace" },
    keywords: {
      type: Type.ARRAY,
      description: "4–8 klíčových slov, která by publikum hledalo",
      items: { type: Type.STRING },
    },
    competitors: {
      type: Type.ARRAY,
      description: "0–5 pravděpodobných konkurentů (návrhy k potvrzení)",
      items: { type: Type.STRING },
    },
    suggestedType: {
      type: Type.STRING,
      description: "Nejvhodnější typ projektu: eshop | app | leadgen | content | local",
    },
  },
  required: ["businessName", "summary", "offering", "audience", "toneOfVoice", "keywords", "competitors"],
  propertyOrdering: [
    "businessName",
    "summary",
    "offering",
    "audience",
    "toneOfVoice",
    "keywords",
    "competitors",
    "suggestedType",
  ],
};

const KNOWN_TYPES = new Set(["eshop", "app", "leadgen", "content", "local"]);

/** Best-effort host name from a URL, for the demo's business-name fallback. */
function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A generic, deterministic profile from the brand/type — the keyless demo and the
 *  floor for empty fields. Deliberately modest (it invents no specifics). */
export function demoOnboardingScan(req: OnboardingScanRequest): OnboardingScanResult {
  const name = txt(req.brand) || hostOf(req.url);
  const type = req.projectType && KNOWN_TYPES.has(req.projectType) ? req.projectType : undefined;
  const offering =
    type === "eshop"
      ? "prodej zboží online"
      : type === "local"
        ? "služby s provozovnou"
        : type === "leadgen"
          ? "služby na poptávku"
          : type === "content"
            ? "obsah a publikace"
            : "produkt nebo služba";
  const result: OnboardingScanResult = {
    businessName: name,
    summary: `Ukázkový profil pro ${name}. Připojte LLM (Claude v devu, Gemini v produkci) pro sken na míru z vašeho webu.`,
    offering,
    audience: "zákazníci hledající tuto nabídku",
    toneOfVoice: "přátelský a věcný",
    keywords: [name.toLowerCase()].filter(Boolean),
    competitors: [],
  };
  if (type) result.suggestedType = type;
  return result;
}

function normalizeOnboardingScan(
  parsed: unknown,
  req: OnboardingScanRequest
): OnboardingScanResult {
  const o = parsed as Record<string, unknown> | null;
  const fallback = demoOnboardingScan(req);

  const result: OnboardingScanResult = {
    businessName: txt(o?.businessName) || fallback.businessName,
    summary: txt(o?.summary) || fallback.summary,
    offering: txt(o?.offering) || fallback.offering,
    audience: txt(o?.audience) || fallback.audience,
    toneOfVoice: txt(o?.toneOfVoice) || fallback.toneOfVoice,
    // Cap: seed keywords stay a short, usable set; competitor suggestions bounded.
    keywords: cleanList(o?.keywords, 10),
    competitors: cleanList(o?.competitors, 6),
  };
  const type = txt(o?.suggestedType).toLowerCase();
  if (KNOWN_TYPES.has(type)) result.suggestedType = type;
  else if (fallback.suggestedType) result.suggestedType = fallback.suggestedType;
  return result;
}

/** Flag a hollow profile (no summary / offering) so the wrapper re-prompts once. */
function validateOnboardingScan(parsed: unknown): string[] {
  const o = parsed as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return [];
  const v: string[] = [];
  if (!txt(o.summary)) v.push("Chybí shrnutí (summary).");
  if (!txt(o.offering)) v.push("Chybí popis nabídky (offering).");
  return v;
}

export function generateOnboardingScan(
  req: OnboardingScanRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<OnboardingScanResult>> {
  return generateStructured({
    // llm-tool: onboarding-scan
    id: "onboarding-scan",
    prompt: buildOnboardingScanPrompt(req),
    system: ONBOARDING_SCAN_SYSTEM,
    schema: ONBOARDING_SCAN_SCHEMA,
    temperature: 0.4,
    normalize: (parsed) => normalizeOnboardingScan(parsed, req),
    validate: (parsed) => validateOnboardingScan(parsed),
    demo: () => demoOnboardingScan(req),
    locale,
    signal,
  });
}
