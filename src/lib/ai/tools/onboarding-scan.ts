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
 *  known set; a deterministic demo() derives a starter profile from the entered
 *  domain + site metadata (title / meta description) and marks it
 *  `source: "fallback"` so the keyless path completes with something honest the UI
 *  can label. Runs through the provider-switching LLM wrapper (../../llm). Server-only. */
import { Type } from "@google/genai";
import type {
  AiResponse,
  OnboardingScanRequest,
  OnboardingScanResult,
} from "../../ai-types";
import type { SupportedLocale } from "@/lib/format";
import { PROJECT_TYPES, type ProjectType } from "@/lib/projects/types";
import { generateStructured } from "../../llm";
import { cleanList, digest, txt } from "./_shared";
import { antiFabrication, demoTail } from "./_fragments";
import { withObjectGuard, missingStrFields } from "./_validate";
import { refineLines } from "./refine";

const ONBOARDING_SCAN_SYSTEM = `Jsi český business analytik pro marketingový nástroj. Z textu domovské stránky webu vytáhneš stručný, věcný profil firmy, kterým se pak naplní celý nástroj.

Pravidla:
- ${antiFabrication("předaného textu stránky")}
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

const TYPE_HINT: Record<ProjectType, string> = {
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
  if (req.projectType && KNOWN_TYPES.has(req.projectType)) {
    lines.push(`Typ projektu (nápověda): ${TYPE_HINT[req.projectType as ProjectType]}`);
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

const KNOWN_TYPES = new Set<string>(PROJECT_TYPES);

/** Best-effort host name from a URL, for the demo's business-name fallback. */
function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Split a page <title> on the separators CMSes put between the brand and the
 *  tagline ("Dentalis — zubní ordinace Brno" → ["Dentalis", "zubní ordinace Brno"]).
 *  Pure string work — deterministic, no model. */
function titleSegments(title: string): string[] {
  return title
    .split(/\s*(?:[|•·—–]|::|-{2,})\s*|\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Deterministic seed keywords from the site metadata: the brand name plus the
 *  meaningful words of the title's tagline segments — words that literally appear
 *  on the user's own homepage title, never invented. Lowercased, deduped, bounded. */
function metadataKeywords(name: string, segments: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const k = raw.trim().toLowerCase();
    if (k.length < 3 || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  push(name);
  // Tagline segments (everything after the brand segment) as whole phrases — a
  // segment like "zubní ordinace Brno" is closer to a real query than its words.
  for (const seg of segments.slice(1)) {
    if (seg.toLowerCase() === name.toLowerCase()) continue;
    push(seg);
    if (out.length >= 6) break;
  }
  return out.slice(0, 6);
}

/** A deterministic profile derived from the entered domain + the fetched site
 *  metadata (title / meta description) — TAIL-FREE, so it is safe as the per-field
 *  floor for a live scan (backfilling only the summary must not carry the keyless
 *  "připojte LLM" disclaimer into a real result). Everything here is honestly
 *  traceable to the request: the brand, the URL host, the page <title> and the
 *  meta description. It invents no facts. The demo entry point appends the tail
 *  and the machine-readable `source: "fallback"` marker. */
export function baseOnboardingScan(req: OnboardingScanRequest): OnboardingScanResult {
  const segments = titleSegments(txt(req.siteTitle));
  const name = txt(req.brand) || segments[0] || hostOf(req.url);
  const type = req.projectType && KNOWN_TYPES.has(req.projectType) ? req.projectType : undefined;
  // The title's tagline (what the site says about itself) beats the per-type generic.
  const tagline = segments.slice(1).join(", ");
  const offering =
    tagline ||
    (type === "eshop"
      ? "prodej zboží online"
      : type === "local"
        ? "služby s provozovnou"
        : type === "leadgen"
          ? "služby na poptávku"
          : type === "content"
            ? "obsah a publikace"
            : "produkt nebo služba");
  const description = txt(req.siteDescription).slice(0, 400);
  const result: OnboardingScanResult = {
    businessName: name,
    summary: description || `Profil firmy „${name}".`,
    offering,
    audience: "zákazníci hledající tuto nabídku",
    toneOfVoice: "přátelský a věcný",
    keywords: metadataKeywords(name, segments),
    competitors: [],
  };
  if (type) result.suggestedType = type;
  return result;
}

/** The keyless fallback: the tail-free base plus the honest "ukázkový výstup —
 *  připojte LLM" disclaimer on the summary AND the machine-readable
 *  `source: "fallback"` marker, so the UI can label the degraded (but still
 *  domain-derived) starter profile instead of presenting it as a full AI scan. */
export function demoOnboardingScan(req: OnboardingScanRequest): OnboardingScanResult {
  const base = baseOnboardingScan(req);
  return {
    ...base,
    summary: base.summary + demoTail("sken na míru z vašeho webu"),
    source: "fallback",
  };
}

function normalizeOnboardingScan(
  parsed: unknown,
  req: OnboardingScanRequest
): OnboardingScanResult {
  const o = parsed as Record<string, unknown> | null;
  // Per-field floor is the TAIL-FREE base — a backfilled summary must not carry the
  // keyless "připojte LLM" disclaimer into a real model scan.
  const fallback = baseOnboardingScan(req);

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

/** Flag a hollow profile so the wrapper re-prompts once. Covers every required
 *  string field plus a non-empty keyword list, so a truncated scan (missing
 *  businessName / audience / tone / keywords) fails here instead of silently
 *  falling to the demo floor. */
function validateOnboardingScan(parsed: unknown): string[] {
  return withObjectGuard((o) => {
    const v = missingStrFields(o, [
      ["businessName", "Chybí název firmy (businessName)."],
      ["summary", "Chybí shrnutí (summary)."],
      ["offering", "Chybí popis nabídky (offering)."],
      ["audience", "Chybí cílové publikum (audience)."],
      ["toneOfVoice", "Chybí tón komunikace (toneOfVoice)."],
    ]);
    if (cleanList(o.keywords, 10).length === 0) {
      v.push("Chybí klíčová slova (keywords) — vrať 4–8 slov, která by publikum hledalo.");
    }
    return v;
  })(parsed);
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
