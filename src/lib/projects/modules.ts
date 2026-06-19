/** Module registry — the single declarative source that composes the authed
 *  experience per project type. The sidebar is just this list filtered by the
 *  active project's `type`; the overview reads `KPI_PRESETS` for the same type.
 *  Adding/retargeting a module is one edit here. Framework-free (no React). */
import type { IconKey } from "./icon-keys";
import type { ProjectType } from "./types";

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

export interface ModuleDef {
  /** route segment under /app/[projectId]/ ("" = the project overview/home) */
  key: string;
  /** sidebar label (cs) */
  label: string;
  icon: IconKey;
  section: ModuleSection;
  /** project types this module is available for */
  availableFor: ProjectType[];
  /** short description for tooltips / empty states */
  blurb: string;
}

const ALL: ProjectType[] = ["eshop", "app", "leadgen", "content"];

/** The full registry. `availableFor` is what differentiates the four types — see
 *  the matrix in the redesign plan. */
export const MODULES: ModuleDef[] = [
  {
    key: "",
    label: "Přehled",
    icon: "overview",
    section: "main",
    availableFor: ALL,
    blurb: "Souhrn výkonu projektu a rychlé akce.",
  },
  {
    key: "vykon",
    label: "Výkon",
    icon: "dashboard",
    section: "main",
    availableFor: ALL,
    blurb: "Návštěvy, náklady, konverze, obrat a PNO s historií a kanály.",
  },
  {
    key: "kampane",
    label: "Kampaně",
    icon: "campaigns",
    section: "growth",
    availableFor: ["eshop", "app", "leadgen"],
    blurb: "Google Ads kampaně, triáž, AI vyhodnocení a přesuny rozpočtu.",
  },
  {
    key: "klicova-slova",
    label: "Klíčová slova",
    icon: "keywords",
    section: "growth",
    availableFor: ALL,
    blurb: "Výzkum klíčových slov se záměrem a uloženými seznamy.",
  },
  {
    key: "obsah",
    label: "Obsah & SEO",
    icon: "content",
    section: "studio",
    availableFor: ALL,
    blurb: "AI obsahový brief a publikované články se strukturou a prolinkováním.",
  },
  {
    key: "socialni",
    label: "Sociální sítě",
    icon: "social",
    section: "studio",
    availableFor: ["eshop", "app", "content"],
    blurb: "Návrh příspěvků, plánování publikace a schránka zpráv.",
  },
  {
    key: "kreativa",
    label: "Kreativa",
    icon: "creative",
    section: "studio",
    availableFor: ["eshop", "content"],
    blurb: "Generování vizuálů s hodnocením kvality a odstraněním pozadí.",
  },
  {
    key: "knihovna",
    label: "Knihovna vzorů",
    icon: "patterns",
    section: "insights",
    availableFor: ["eshop", "app", "leadgen"],
    blurb: "Osvědčené vzory odvozené z vašich výsledků, které ladí AI.",
  },
  {
    key: "reporty",
    label: "Reporty",
    icon: "reports",
    section: "insights",
    availableFor: ALL,
    blurb: "Sdílené reporty pro klienty a white-label microsite.",
  },
  {
    key: "zisk",
    label: "Zisk",
    icon: "profit",
    section: "insights",
    availableFor: ["eshop"],
    blurb: "Marže a POAS — optimalizace na zisk z reklamy, ne jen na ROAS.",
  },
  {
    key: "produktova-kreativa",
    label: "Produktová kreativa",
    icon: "catalog",
    section: "studio",
    availableFor: ["eshop"],
    blurb: "Z produktového feedu generujte inzeráty a sestavte PMax asset group.",
  },
  {
    key: "sklad-sezonnost",
    label: "Sklad & sezónnost",
    icon: "season",
    section: "growth",
    availableFor: ["eshop"],
    blurb: "Pacing rozpočtu podle sezónnosti a skladu, pauza u docházejících SKU.",
  },
  {
    key: "ltv",
    label: "CAC → LTV",
    icon: "ltv",
    section: "insights",
    // E-shops care about repeat-purchase / CAC-payback economics too — the module
    // is project-type-aware (customer / repeat-purchase framing for eshop).
    availableFor: ["app", "eshop"],
    blurb: "Kohorty: CAC, doba návratnosti a poměr LTV:CAC napříč akvizičními kohortami.",
  },
  {
    key: "experimenty-lp",
    label: "LP experimenty",
    icon: "experiment",
    section: "studio",
    availableFor: ["app"],
    blurb: "A/B testy landing pages podle klastrů klíčových slov, vítěz dle CVR.",
  },
  {
    key: "srovnani-seo",
    label: "Srovnání & SEO",
    icon: "compare",
    section: "growth",
    availableFor: ["app"],
    blurb: "High-intent obsah: dotazy typu alternativa, vs a cena seřazené dle příležitosti.",
  },
  {
    key: "kvalita-leadu",
    label: "Kvalita leadů",
    icon: "quality",
    section: "insights",
    availableFor: ["leadgen"],
    blurb: "Zpětná vazba z CRM: cena za kvalifikovaný lead, ne za levný lead.",
  },
  {
    key: "rychla-reakce",
    label: "Rychlá reakce",
    icon: "speed",
    section: "studio",
    availableFor: ["leadgen"],
    blurb: "Schránka poptávek s AI návrhem odpovědi, kvalifikací a SLA časovačem.",
  },
  {
    key: "lokalni",
    label: "Lokální dominance",
    icon: "local",
    section: "growth",
    availableFor: ["leadgen"],
    blurb: "Pokrytí služba×lokalita, mezery ve stránkách a reputace z recenzí.",
  },
  {
    key: "obsahovy-engine",
    label: "Obsahový engine",
    icon: "clusters",
    section: "growth",
    availableFor: ["content"],
    blurb: "Tematické klastry (pilíř + podpůrné) a obnova upadajícího obsahu.",
  },
  {
    key: "distribuce",
    label: "Distribuce",
    icon: "distribute",
    section: "studio",
    availableFor: ["content"],
    blurb: "Jeden článek → varianty na sítě a newsletter s atribucí podle kanálu.",
  },
  {
    key: "publikum",
    label: "Publikum & výnos",
    icon: "audience",
    section: "insights",
    availableFor: ["content"],
    blurb: "Trychtýř odběratelů, segmenty a výnos (RPM / sponzoring).",
  },
  {
    key: "nastaveni",
    label: "Nastavení",
    icon: "settings",
    section: "system",
    availableFor: ALL,
    blurb: "Název, branding, napojení Google Ads a typ projektu.",
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
  /** type-specific label (e.g. conversions → "Leady" for lead-gen) */
  label: string;
  metric: KpiMetric;
  format: KpiFormat;
}

export const KPI_PRESETS: Record<ProjectType, KpiDef[]> = {
  eshop: [
    { label: "Obrat", metric: "revenue", format: "czk" },
    { label: "ROAS", metric: "roas", format: "multiple" },
    { label: "PNO", metric: "pno", format: "pct" },
    { label: "Konverze", metric: "conversions", format: "int" },
  ],
  app: [
    { label: "Registrace", metric: "conversions", format: "int" },
    { label: "CAC", metric: "cpa", format: "czk" },
    { label: "Náklady", metric: "cost", format: "czk" },
    { label: "Návštěvy", metric: "visits", format: "int" },
  ],
  leadgen: [
    { label: "Leady", metric: "conversions", format: "int" },
    { label: "Cena za lead", metric: "cpa", format: "czk" },
    { label: "Konverzní poměr", metric: "convRate", format: "pct" },
    { label: "Náklady", metric: "cost", format: "czk" },
  ],
  content: [
    { label: "Návštěvy", metric: "visits", format: "int" },
    { label: "Konverze", metric: "conversions", format: "int" },
    { label: "Konverzní poměr", metric: "convRate", format: "pct" },
    { label: "Náklady", metric: "cost", format: "czk" },
  ],
};
