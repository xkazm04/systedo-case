/** Module registry — the single declarative source that composes the authed
 *  experience per project type. The sidebar is just this list filtered by the
 *  active project's `type`; the overview reads `KPI_PRESETS` for the same type.
 *  Adding/retargeting a module is one edit here. Framework-free (no React). */
import type { IconKey } from "./icon-keys";
import type { ProjectType } from "./types";
import type { SupportedLocale } from "@/lib/format";

/** Sidebar grouping. Order here defines render order. */
export type ModuleSection = "main" | "growth" | "studio" | "insights" | "system";

export const SECTION_ORDER: ModuleSection[] = ["main", "growth", "studio", "insights", "system"];

/** Section headers (cs). `system` is unlabeled — it sits pinned at the bottom. */
export const SECTION_LABELS: Record<ModuleSection, string> = {
  main: "Přehled",
  growth: "Akvizice",
  studio: "Tvorba",
  insights: "Analýza",
  system: "",
};

/** Section headers (en). */
export const SECTION_LABELS_EN: Record<ModuleSection, string> = {
  main: "Overview",
  growth: "Acquisition",
  studio: "Studio",
  insights: "Insights",
  system: "",
};

export interface ModuleDef {
  /** route segment under /app/[projectId]/ ("" = the project overview/home) */
  key: string;
  /** sidebar label (cs) */
  label: string;
  /** sidebar label (en) */
  labelEn: string;
  icon: IconKey;
  section: ModuleSection;
  /** project types this module is available for */
  availableFor: ProjectType[];
  /** short description for tooltips / empty states (cs) */
  blurb: string;
  /** short description for tooltips / empty states (en) */
  blurbEn: string;
}

const ALL: ProjectType[] = ["eshop", "app", "leadgen", "content", "local"];

/** The full registry. `availableFor` is what differentiates the four types — see
 *  the matrix in the redesign plan. */
export const MODULES: ModuleDef[] = [
  {
    key: "",
    label: "Přehled",
    labelEn: "Overview",
    icon: "overview",
    section: "main",
    availableFor: ALL,
    blurb: "Souhrn výkonu projektu a rychlé akce.",
    blurbEn: "Project performance summary and quick actions.",
  },
  {
    key: "vykon",
    label: "Výkon",
    labelEn: "Performance",
    icon: "dashboard",
    section: "main",
    availableFor: ALL,
    blurb: "Návštěvy, náklady, konverze, obrat a PNO s historií a kanály.",
    blurbEn: "Visits, cost, conversions, revenue and PNO with history and channels.",
  },
  {
    key: "pobocky",
    label: "Pobočky",
    labelEn: "Locations",
    icon: "locations",
    section: "main",
    availableFor: ["local"],
    blurb: "Správa poboček — stav Google profilu, recenze, pozice v mapě a úkoly na jednom místě.",
    blurbEn: "Manage your locations — Google profile status, reviews, map rank and tasks in one place.",
  },
  {
    key: "kampane",
    label: "Kampaně",
    labelEn: "Campaigns",
    icon: "campaigns",
    section: "growth",
    availableFor: ["eshop", "app", "leadgen", "local"],
    blurb: "Google Ads kampaně, triáž, AI vyhodnocení a přesuny rozpočtu.",
    blurbEn: "Google Ads campaigns, triage, AI evaluation and budget shifts.",
  },
  {
    key: "klicova-slova",
    label: "Klíčová slova",
    labelEn: "Keywords",
    icon: "keywords",
    section: "growth",
    availableFor: ALL,
    blurb: "Výzkum klíčových slov se záměrem a uloženými seznamy.",
    blurbEn: "Keyword research with intent classification and saved lists.",
  },
  {
    key: "obsahovy-engine",
    label: "Obsahový engine",
    labelEn: "Content engine",
    icon: "content",
    section: "studio",
    availableFor: ALL,
    blurb: "Tematické klastry a upadající obsah v přehledu; z každé mezery AI brief, koncept článku a distribuci.",
    blurbEn: "Topic clusters and decaying content at a glance; from every gap an AI brief, article draft and distribution.",
  },
  {
    key: "recenze",
    label: "Recenze",
    labelEn: "Reviews",
    icon: "reviews",
    section: "studio",
    availableFor: ["local"],
    blurb: "Schránka recenzí — filtrování, sentiment, AI návrh odpovědi, označení majiteli a šablony.",
    blurbEn: "Review inbox — filtering, sentiment, AI reply drafts, flag-for-owner and saved-reply macros.",
  },
  {
    key: "obsah-plan",
    label: "Obsah — plán",
    labelEn: "Content schedule",
    icon: "schedule",
    section: "studio",
    availableFor: ["local"],
    blurb: "Plánovač příspěvků na Google Business Profile — náměty z katalogu a kalendář na 4 týdny.",
    blurbEn: "Google Business Profile post planner — catalog-grounded ideas and a 4-week calendar.",
  },
  {
    key: "socialni",
    label: "Sociální sítě",
    labelEn: "Social media",
    icon: "social",
    section: "studio",
    availableFor: ["eshop", "app", "content", "local"],
    blurb: "Návrh příspěvků, plánování publikace a schránka zpráv.",
    blurbEn: "Post drafting, publication scheduling and message inbox.",
  },
  {
    key: "kreativa",
    label: "Kreativa",
    labelEn: "Creative",
    icon: "creative",
    section: "studio",
    availableFor: ["eshop", "content"],
    blurb: "Generování vizuálů s hodnocením kvality a odstraněním pozadí.",
    blurbEn: "Visual generation with quality scoring and background removal.",
  },
  {
    key: "knihovna",
    label: "Knihovna vzorů",
    labelEn: "Patterns library",
    icon: "patterns",
    section: "insights",
    availableFor: ["eshop", "app", "leadgen"],
    blurb: "Osvědčené vzory odvozené z vašich výsledků, které ladí AI.",
    blurbEn: "Proven patterns derived from your results that fine-tune the AI.",
  },
  {
    key: "reporty",
    label: "Reporty",
    labelEn: "Reports",
    icon: "reports",
    section: "insights",
    availableFor: ALL,
    blurb: "Sdílené reporty pro klienty a white-label microsite.",
    blurbEn: "Shared client reports and white-label microsite.",
  },
  {
    key: "zisk",
    label: "Zisk",
    labelEn: "Profit",
    icon: "profit",
    section: "insights",
    availableFor: ["eshop"],
    blurb: "Marže a POAS — optimalizace na zisk z reklamy, ne jen na ROAS.",
    blurbEn: "Margins and POAS — optimise for ad profit, not just ROAS.",
  },
  {
    key: "produktova-kreativa",
    label: "Produktová kreativa",
    labelEn: "Product creative",
    icon: "catalog",
    section: "studio",
    availableFor: ["eshop"],
    blurb: "Z produktového feedu generujte inzeráty a sestavte PMax asset group.",
    blurbEn: "Generate ads from the product feed and build a PMax asset group.",
  },
  {
    key: "sklad-sezonnost",
    label: "Sklad & sezónnost",
    labelEn: "Stock & seasonality",
    icon: "season",
    section: "growth",
    availableFor: ["eshop"],
    blurb: "Pacing rozpočtu podle sezónnosti a skladu, pauza u docházejících SKU.",
    blurbEn: "Budget pacing by seasonality and stock, pause on low-inventory SKUs.",
  },
  {
    key: "ltv",
    label: "CAC → LTV",
    labelEn: "CAC → LTV",
    icon: "ltv",
    section: "insights",
    // E-shops care about repeat-purchase / CAC-payback economics too — the module
    // is project-type-aware (customer / repeat-purchase framing for eshop).
    availableFor: ["app", "eshop"],
    blurb: "Kohorty: CAC, doba návratnosti a poměr LTV:CAC napříč akvizičními kohortami.",
    blurbEn: "Cohorts: CAC, payback period and LTV:CAC ratio across acquisition cohorts.",
  },
  {
    key: "experimenty-lp",
    label: "LP experimenty",
    labelEn: "LP experiments",
    icon: "experiment",
    section: "studio",
    availableFor: ["app"],
    blurb: "A/B testy landing pages podle klastrů klíčových slov, vítěz dle CVR.",
    blurbEn: "A/B tests for landing pages by keyword cluster, winner chosen by CVR.",
  },
  {
    key: "srovnani-seo",
    label: "Srovnání & SEO",
    labelEn: "Compare & SEO",
    icon: "compare",
    section: "growth",
    availableFor: ["app"],
    blurb: "High-intent obsah: dotazy typu alternativa, vs a cena seřazené dle příležitosti.",
    blurbEn: "High-intent content: alternative, vs and pricing queries ranked by opportunity.",
  },
  {
    key: "kvalita-leadu",
    label: "Kvalita leadů",
    labelEn: "Lead quality",
    icon: "quality",
    section: "insights",
    availableFor: ["leadgen"],
    blurb: "Zpětná vazba z CRM: cena za kvalifikovaný lead, ne za levný lead.",
    blurbEn: "CRM feedback: cost per qualified lead, not just the cheapest lead.",
  },
  {
    key: "rychla-reakce",
    label: "Rychlá reakce",
    labelEn: "Quick response",
    icon: "speed",
    section: "studio",
    availableFor: ["leadgen"],
    blurb: "Schránka poptávek s AI návrhem odpovědi, kvalifikací a SLA časovačem.",
    blurbEn: "Enquiry inbox with AI reply suggestion, qualification and SLA timer.",
  },
  {
    key: "lokalni",
    label: "Lokální dominance",
    labelEn: "Local dominance",
    icon: "local",
    section: "growth",
    availableFor: ["leadgen", "local"],
    blurb: "Pokrytí služba×lokalita, mezery ve stránkách a reputace z recenzí.",
    blurbEn: "Service × location coverage, page gaps and reputation from reviews.",
  },
  {
    key: "mapa",
    label: "Mapa & pozice",
    labelEn: "Map & rankings",
    icon: "map",
    section: "growth",
    availableFor: ["local"],
    blurb: "Mapový balíček (vy vs. konkurence) na reálné mapě, podíl na proklicích a žebříček pozic klíčových slov.",
    blurbEn: "Map pack (you vs. competitors) on a real map, share of clicks and a keyword ranking ladder.",
  },
  {
    key: "distribuce",
    label: "Distribuce",
    labelEn: "Distribution",
    icon: "distribute",
    section: "studio",
    availableFor: ["content"],
    blurb: "Jeden článek → varianty na sítě a newsletter s atribucí podle kanálu.",
    blurbEn: "One article → variants for social networks and newsletter with channel attribution.",
  },
  {
    key: "publikum",
    label: "Publikum & výnos",
    labelEn: "Audience & revenue",
    icon: "audience",
    section: "insights",
    availableFor: ["content"],
    blurb: "Trychtýř odběratelů, segmenty a výnos (RPM / sponzoring).",
    blurbEn: "Subscriber funnel, segments and revenue (RPM / sponsorship).",
  },
  {
    key: "katalog",
    label: "Katalog",
    labelEn: "Catalog",
    icon: "store",
    section: "system",
    availableFor: ALL,
    blurb: "Produkty, plány nebo služby — ceny, marže, dostupnost a povaha (online/lokální). Zdroj, ze kterého čerpají ostatní moduly.",
    blurbEn: "Products, plans or services — prices, margins, availability and nature (online/local). The source the other modules read from.",
  },
  {
    key: "ucet",
    label: "Účet & zabezpečení",
    labelEn: "Account & security",
    icon: "account",
    section: "system",
    availableFor: ALL,
    blurb: "Profil, přehled zabezpečení, odhlášení a žádost o smazání účtu.",
    blurbEn: "Profile, a security overview, sign-out and an account-deletion request.",
  },
  {
    key: "branding",
    label: "Branding",
    labelEn: "Branding",
    icon: "creative",
    section: "system",
    availableFor: ALL,
    blurb: "Brand accent a logo pro klientské reporty a web — s živým náhledem hlavičky.",
    blurbEn: "Brand accent and logo for client reports and the microsite — with a live header preview.",
  },
  {
    key: "spotreba",
    label: "Spotřeba",
    labelEn: "Usage",
    icon: "usage",
    section: "system",
    availableFor: ALL,
    blurb: "Spotřeba AI podle operace a modelu za období — náklady, tokeny, podíl a export CSV.",
    blurbEn: "AI usage by operation and model over a period — cost, tokens, share and CSV export.",
  },
  {
    key: "mesicni-report",
    label: "Měsíční report",
    labelEn: "Monthly report",
    icon: "reports",
    section: "system",
    availableFor: ALL,
    blurb: "Klientský souhrn výkonu za období — KPI dlaždice, AI narativ, tisk a export.",
    blurbEn: "A client-ready performance recap — KPI tiles, an AI narrative, print and export.",
  },
  {
    key: "aktivita",
    label: "Aktivita",
    labelEn: "Activity",
    icon: "activity",
    section: "system",
    availableFor: ALL,
    blurb: "Sjednocená časová osa akcí napříč moduly a AI — filtr podle modulu, závažnosti a období, export CSV.",
    blurbEn: "A unified timeline of module + AI actions — filter by module, severity and window, export CSV.",
  },
  {
    key: "integrace",
    label: "Integrace",
    labelEn: "Integrations",
    icon: "integrations",
    section: "system",
    availableFor: ALL,
    blurb: "Stav napojení — připravenost konektorů (reklama, AI, recenze, reporty, infrastruktura) pro nasazení.",
    blurbEn: "Integration status — connector readiness (advertising, AI, reviews, reports, infrastructure) for deployment.",
  },
  {
    key: "nastaveni",
    label: "Nastavení",
    labelEn: "Settings",
    icon: "settings",
    section: "system",
    availableFor: ALL,
    blurb: "Název, branding, napojení Google Ads a typ projektu.",
    blurbEn: "Name, branding, Google Ads connection and project type.",
  },
];

/** Modules available for a project type, in section + registry order. */
export function modulesFor(type: ProjectType): ModuleDef[] {
  return MODULES.filter((m) => m.availableFor.includes(type)).sort(
    (a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section)
  );
}

/** Whether a route segment is a valid module for the given type (for 404s). */
export function isModuleAvailable(type: ProjectType, key: string): boolean {
  return MODULES.some((m) => m.key === key && m.availableFor.includes(type));
}

/* -------------------------------------------------------------------------- */
/*  KPI presets — how the overview's headline figures adapt per type.          */
/*  All four pull from the same metrics engine (the only dataset in v1) but    */
/*  relabel + reformat so the meaning fits the business: an e-shop sells        */
/*  (revenue/ROAS), an app acquires users (signups/CAC), lead-gen books leads.  */
/* -------------------------------------------------------------------------- */

/** A derived figure computable from the dashboard totals/ratios. */
export type KpiMetric =
  | "revenue"
  | "roas"
  | "pno"
  | "conversions"
  | "cost"
  | "visits"
  | "cpa"
  | "convRate";

export type KpiFormat = "czk" | "multiple" | "pct" | "int";

export interface KpiDef {
  /** type-specific label (e.g. conversions → "Leady" for lead-gen) (cs) */
  label: string;
  /** type-specific label (en) */
  labelEn: string;
  metric: KpiMetric;
  format: KpiFormat;
}

export const KPI_PRESETS: Record<ProjectType, KpiDef[]> = {
  eshop: [
    { label: "Obrat", labelEn: "Revenue", metric: "revenue", format: "czk" },
    { label: "ROAS", labelEn: "ROAS", metric: "roas", format: "multiple" },
    { label: "PNO", labelEn: "PNO", metric: "pno", format: "pct" },
    { label: "Konverze", labelEn: "Conversions", metric: "conversions", format: "int" },
  ],
  app: [
    { label: "Registrace", labelEn: "Signups", metric: "conversions", format: "int" },
    { label: "CAC", labelEn: "CAC", metric: "cpa", format: "czk" },
    { label: "Náklady", labelEn: "Cost", metric: "cost", format: "czk" },
    { label: "Návštěvy", labelEn: "Visits", metric: "visits", format: "int" },
  ],
  leadgen: [
    { label: "Leady", labelEn: "Leads", metric: "conversions", format: "int" },
    { label: "Cena za lead", labelEn: "Cost per lead", metric: "cpa", format: "czk" },
    { label: "Konverzní poměr", labelEn: "Conversion rate", metric: "convRate", format: "pct" },
    { label: "Náklady", labelEn: "Cost", metric: "cost", format: "czk" },
  ],
  content: [
    { label: "Návštěvy", labelEn: "Visits", metric: "visits", format: "int" },
    { label: "Konverze", labelEn: "Conversions", metric: "conversions", format: "int" },
    { label: "Konverzní poměr", labelEn: "Conversion rate", metric: "convRate", format: "pct" },
    { label: "Náklady", labelEn: "Cost", metric: "cost", format: "czk" },
  ],
  local: [
    { label: "Poptávky & hovory", labelEn: "Enquiries & calls", metric: "conversions", format: "int" },
    { label: "Cena za poptávku", labelEn: "Cost per enquiry", metric: "cpa", format: "czk" },
    { label: "Konverzní poměr", labelEn: "Conversion rate", metric: "convRate", format: "pct" },
    { label: "Návštěvy", labelEn: "Visits", metric: "visits", format: "int" },
  ],
};

/* -------------------------------------------------------------------------- */
/*  Locale resolvers — framework-free helpers keyed by SupportedLocale.        */
/* -------------------------------------------------------------------------- */

/** Resolve a module's sidebar label for the active locale. */
export function moduleLabel(m: ModuleDef, locale: SupportedLocale): string {
  return locale === "en" ? m.labelEn : m.label;
}

/** Resolve a module's blurb for the active locale. */
export function moduleBlurb(m: ModuleDef, locale: SupportedLocale): string {
  return locale === "en" ? m.blurbEn : m.blurb;
}

/** Resolve a section header for the active locale. */
export function sectionLabel(s: ModuleSection, locale: SupportedLocale): string {
  return locale === "en" ? SECTION_LABELS_EN[s] : SECTION_LABELS[s];
}

/** Resolve a KPI label for the active locale. */
export function kpiLabel(k: KpiDef, locale: SupportedLocale): string {
  return locale === "en" ? k.labelEn : k.label;
}
