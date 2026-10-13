/** Module registry — the single declarative source that composes the authed
 *  experience per project type. The sidebar is just this list filtered by the
 *  active project's `type`; the overview reads `KPI_PRESETS` for the same type.
 *  Adding/retargeting a module is one edit here. Framework-free (no React). */
import type { IconKey } from "./icon-keys";
import { PROJECT_TYPES, type ProjectType } from "./types";
import { AREAS, type AreaKey } from "./areas";
import type { SupportedLocale } from "@/lib/format";

/** Where a module lives (ADR-0013): one of the six areas, or the settings
 *  utility menu (workspace configuration and operational tools — not a roof).
 *  Order here defines render order. */
export type ModuleArea = AreaKey | "settings";

export const AREA_ORDER: ModuleArea[] = [...AREAS.map((a) => a.key), "settings"];

/** Area headers (cs). */
export const AREA_LABELS: Record<ModuleArea, string> = {
  ...(Object.fromEntries(AREAS.map((a) => [a.key, a.label])) as Record<AreaKey, string>),
  settings: "Nastavení",
};

/** Area headers (en). */
export const AREA_LABELS_EN: Record<ModuleArea, string> = {
  ...(Object.fromEntries(AREAS.map((a) => [a.key, a.labelEn])) as Record<AreaKey, string>),
  settings: "Settings",
};

/** The module whose page IS its area's roof rather than a room under it. */
export const ROOF_MODULE: Partial<Record<AreaKey, string>> = { home: "", performance: "vykon" };

export interface ModuleDef {
  /** route segment under /app/[projectId]/ ("" = the project overview/home) */
  key: string;
  /** Explicit render position — the module's canonical registry index, used as the
   *  intra-area tiebreak in `modulesFor`'s sort. Making order a value (not merely
   *  "wherever the entry sits in the array") means a reorder is an `order` edit, and a
   *  test can pin the exact rendered sequence. Monotonic across the array, so within
   *  any one area these values reproduce registry appearance order exactly. */
  order: number;
  /** sidebar label (cs) */
  label: string;
  /** sidebar label (en) */
  labelEn: string;
  icon: IconKey;
  area: ModuleArea;
  /** project types this module is available for */
  availableFor: ProjectType[];
  /** short description for tooltips / empty states (cs) */
  blurb: string;
  /** short description for tooltips / empty states (en) */
  blurbEn: string;
}

/** Every project type — the canonical list from `types.ts`, not a local copy, so
 *  a new ProjectType (already a compile error in the exhaustive `PROJECT_TYPE_META`
 *  / `KPI_PRESETS` records) flows into every all-types module instead of silently
 *  dropping out of the sidebar. */
const ALL: ProjectType[] = PROJECT_TYPES;

/** The full registry. `availableFor` is what differentiates the project types
 *  (every entry of `PROJECT_TYPES`) — see the matrix in the redesign plan. */
export const MODULES: ModuleDef[] = [
  {
    key: "",
    order: 0,
    label: "Přehled",
    labelEn: "Overview",
    icon: "overview",
    area: "home",
    availableFor: ALL,
    blurb: "Souhrn výkonu projektu a rychlé akce.",
    blurbEn: "Project performance summary and quick actions.",
  },
  {
    key: "vykon",
    order: 1,
    label: "Výkon",
    labelEn: "Performance",
    icon: "dashboard",
    area: "performance",
    availableFor: ALL,
    blurb: "Návštěvy, náklady, konverze, obrat a PNO s historií a kanály.",
    blurbEn: "Visits, cost, conversions, revenue and PNO with history and channels.",
  },
  {
    key: "start",
    order: 2,
    label: "Start",
    labelEn: "Get started",
    icon: "start",
    area: "home",
    availableFor: ALL,
    blurb: "Naskenujte svůj web, naplňte aplikaci vaší firmou a připojte data.",
    blurbEn: "Scan your website, seed the app with your business and connect your data.",
  },
  {
    key: "kampane",
    order: 3,
    label: "Kampaně",
    labelEn: "Campaigns",
    icon: "campaigns",
    area: "reach",
    availableFor: ["eshop", "app", "leadgen", "local"],
    blurb: "Kampaně z Google Ads a Skliku, triáž, AI vyhodnocení a přesuny rozpočtu.",
    blurbEn: "Campaigns from Google Ads and Sklik, triage, AI evaluation and budget moves.",
  },
  {
    key: "klicova-slova",
    order: 4,
    label: "Klíčová slova",
    labelEn: "Keywords",
    icon: "keywords",
    area: "reach",
    availableFor: ALL,
    blurb: "Výzkum klíčových slov se záměrem a uloženými seznamy.",
    blurbEn: "Keyword research with intent classification and saved lists.",
  },
  {
    key: "kanaly",
    order: 5,
    label: "Kanály zdarma",
    labelEn: "Free channels",
    icon: "channels",
    area: "channels",
    availableFor: ALL,
    blurb: "Kde se zviditelnit bez rozpočtu na reklamu: katalogy, komunity, obsah a partnerství s plánem prvních kroků.",
    blurbEn: "Where to get seen without an ad budget: directories, communities, content and partnerships with a first-steps playbook.",
  },
  {
    key: "obsahovy-engine",
    order: 6,
    label: "Obsahový engine",
    labelEn: "Content engine",
    icon: "content",
    area: "studio",
    availableFor: ALL,
    blurb: "Tematické klastry a upadající obsah v přehledu; z každé mezery AI brief, koncept článku a distribuci.",
    blurbEn: "Topic clusters and decaying content at a glance; from every gap an AI brief, article draft and distribution.",
  },
  {
    key: "recenze",
    order: 7,
    label: "Recenze",
    labelEn: "Reviews",
    icon: "reviews",
    area: "local",
    availableFor: ["local"],
    blurb: "Schránka recenzí: filtrování, sentiment, AI návrh odpovědi, označení majiteli a šablony.",
    blurbEn: "Review inbox: filtering, sentiment, AI reply drafts, flag-for-owner and saved-reply macros.",
  },
  {
    key: "obsah-plan",
    order: 8,
    label: "Plán obsahu",
    labelEn: "Content schedule",
    icon: "schedule",
    area: "local",
    availableFor: ["local"],
    blurb: "Plánovač příspěvků na Google Business Profile: náměty z katalogu a kalendář na 4 týdny.",
    blurbEn: "Google Business Profile post planner: catalog-grounded ideas and a 4-week calendar.",
  },
  {
    key: "socialni",
    order: 9,
    label: "Sociální sítě",
    labelEn: "Social media",
    icon: "social",
    area: "channels",
    availableFor: ["eshop", "app", "content", "local"],
    blurb: "Návrh příspěvků, plánování publikace a schránka zpráv.",
    blurbEn: "Post drafting, publication scheduling and message inbox.",
  },
  {
    key: "kreativa",
    order: 10,
    label: "Kreativa",
    labelEn: "Creative",
    icon: "creative",
    area: "studio",
    availableFor: ["eshop", "content"],
    blurb: "Generování vizuálů s hodnocením kvality a odstraněním pozadí.",
    blurbEn: "Visual generation with quality scoring and background removal.",
  },
  {
    key: "knihovna",
    order: 11,
    label: "Knihovna vzorů",
    labelEn: "Patterns library",
    icon: "patterns",
    area: "performance",
    availableFor: ["eshop", "app", "leadgen"],
    blurb: "Osvědčené vzory odvozené z vašich výsledků, které ladí AI.",
    blurbEn: "Proven patterns derived from your results that fine-tune the AI.",
  },
  {
    key: "reporty",
    order: 12,
    label: "Reporty",
    labelEn: "Reports",
    icon: "reports",
    area: "performance",
    availableFor: ALL,
    blurb: "Sdílené reporty pro klienty a white-label microsite.",
    blurbEn: "Shared client reports and white-label microsite.",
  },
  {
    key: "zisk",
    order: 13,
    label: "Zisk",
    labelEn: "Profit",
    icon: "profit",
    area: "performance",
    availableFor: ["eshop"],
    blurb: "Marže a POAS: optimalizace na zisk z reklamy, ne jen na ROAS.",
    blurbEn: "Margins and POAS: optimize for ad profit, not just ROAS.",
  },
  {
    key: "produktova-kreativa",
    order: 14,
    label: "Produktová kreativa",
    labelEn: "Product creative",
    icon: "catalog",
    area: "studio",
    availableFor: ["eshop"],
    blurb: "Z produktového feedu generujte inzeráty a sestavte PMax asset group.",
    blurbEn: "Generate ads from the product feed and build a PMax asset group.",
  },
  {
    key: "sklad-sezonnost",
    order: 15,
    label: "Sklad & sezónnost",
    labelEn: "Stock & seasonality",
    icon: "season",
    area: "reach",
    availableFor: ["eshop"],
    blurb: "Pacing rozpočtu podle sezónnosti a skladu, pauza u docházejících SKU.",
    blurbEn: "Budget pacing by seasonality and stock, pause on low-inventory SKUs.",
  },
  {
    key: "ltv",
    order: 16,
    label: "CAC → LTV",
    labelEn: "CAC → LTV",
    icon: "ltv",
    area: "performance",
    // E-shops care about repeat-purchase / CAC-payback economics too — the module
    // is project-type-aware (customer / repeat-purchase framing for eshop).
    availableFor: ["app", "eshop"],
    blurb: "Kohorty: CAC, doba návratnosti a poměr LTV:CAC napříč akvizičními kohortami.",
    blurbEn: "Cohorts: CAC, payback period and LTV:CAC ratio across acquisition cohorts.",
  },
  {
    key: "experimenty-lp",
    order: 17,
    label: "LP experimenty",
    labelEn: "LP experiments",
    icon: "experiment",
    area: "studio",
    availableFor: ["app"],
    blurb: "A/B testy landing pages podle klastrů klíčových slov, vítěz dle CVR.",
    blurbEn: "A/B tests for landing pages by keyword cluster, winner chosen by CVR.",
  },
  {
    key: "srovnani-seo",
    order: 18,
    label: "Srovnání & SEO",
    labelEn: "Compare & SEO",
    icon: "compare",
    area: "reach",
    availableFor: ["app"],
    blurb: "High-intent obsah: dotazy typu alternativa, vs a cena seřazené dle příležitosti.",
    blurbEn: "High-intent content: alternative, vs and pricing queries ranked by opportunity.",
  },
  {
    key: "kvalita-leadu",
    order: 19,
    label: "Kvalita leadů",
    labelEn: "Lead quality",
    icon: "quality",
    area: "performance",
    availableFor: ["leadgen"],
    blurb: "Zpětná vazba z CRM: cena za kvalifikovaný lead, ne za levný lead.",
    blurbEn: "CRM feedback: cost per qualified lead, not just the cheapest lead.",
  },
  // The twin is three modules, not one module with three tabs: you TRAIN it (twin),
  // you decide where it may speak and how autonomously (sprava-kanalu), and you
  // review what it wrote (schranka). All three read and write one persisted blob.
  {
    key: "twin",
    order: 20,
    label: "Twin",
    labelEn: "Twin",
    icon: "twin",
    area: "channels",
    availableFor: ALL,
    blurb:
      "Komunikační dvojče firmy: natrénujte hlas z reálných zpráv, které jste poslali. Tímto hlasem pak píše ve schránce, na sítích i v distribuci.",
    blurbEn:
      "Your business's communication double: train a voice from the real messages you've sent. It then writes in that voice in the outbox, on social and in distribution.",
  },
  {
    key: "sprava-kanalu",
    order: 21,
    label: "Správa kanálů",
    labelEn: "Channel management",
    icon: "autonomy",
    area: "channels",
    availableFor: ALL,
    blurb:
      "Kde smí twin mluvit, jak samostatně a čím se zpráva doručí (včetně hranice jistoty, nad kterou schvaluje sám).",
    blurbEn:
      "Where the twin may speak, how autonomously, and what delivers the message (including the confidence bar above which it self-approves).",
  },
  {
    key: "schranka",
    order: 22,
    label: "Schránka zpráv",
    labelEn: "Message box",
    icon: "inbox",
    area: "channels",
    // The old `rychla-reakce` speed-to-lead inbox lives on here as the `leads`
    // channel (SLA clock + BANT qualification intact), and the Socials inbox hands
    // its replies in too — one review surface for everything the twin writes.
    availableFor: ALL,
    blurb:
      "Jedno místo, kde schvalujete vše, co twin napsal: poptávky se SLA, e-maily, chaty i odpovědi ze sítí.",
    blurbEn:
      "One place to approve everything the twin wrote: enquiries with an SLA clock, emails, chats and social replies.",
  },
  {
    key: "lokalni",
    order: 23,
    label: "Lokální dominance",
    labelEn: "Local dominance",
    icon: "local",
    area: "local",
    availableFor: ["leadgen", "local"],
    blurb: "Pokrytí služba×oblast, mezery ve stránkách a reputace z recenzí.",
    blurbEn: "Service × area coverage, page gaps and reputation from reviews.",
  },
  {
    key: "mapa",
    order: 24,
    label: "Mapa & pozice",
    labelEn: "Map & rankings",
    icon: "map",
    area: "local",
    availableFor: ["local"],
    blurb: "Pozice v mapách (vy vs. konkurence) na reálné mapě, podíl na proklicích a žebříček pozic klíčových slov.",
    blurbEn: "Map pack (you vs. competitors) on a real map, share of clicks and a keyword ranking ladder.",
  },
  {
    key: "distribuce",
    order: 25,
    label: "Distribuce",
    labelEn: "Distribution",
    icon: "distribute",
    area: "channels",
    availableFor: ["content"],
    blurb: "Jeden článek → varianty na sítě a newsletter s atribucí podle kanálu.",
    blurbEn: "One article → variants for social networks and newsletter with channel attribution.",
  },
  {
    key: "publikum",
    order: 26,
    label: "Publikum & výnos",
    labelEn: "Audience & revenue",
    icon: "audience",
    area: "performance",
    availableFor: ["content"],
    blurb: "Trychtýř odběratelů, segmenty a výnos (RPM / sponzoring).",
    blurbEn: "Subscriber funnel, segments and revenue (RPM / sponsorship).",
  },
  {
    key: "katalog",
    order: 27,
    label: "Katalog",
    labelEn: "Catalog",
    icon: "store",
    area: "settings",
    availableFor: ALL,
    blurb: "Produkty, plány nebo služby: ceny, marže, dostupnost a povaha (online/lokální). Zdroj, ze kterého čerpají ostatní moduly.",
    blurbEn: "Products, plans or services: prices, margins, availability and nature (online/local). The source the other modules read from.",
  },
  {
    key: "ucet",
    order: 28,
    label: "Účet & zabezpečení",
    labelEn: "Account & security",
    icon: "account",
    area: "settings",
    availableFor: ALL,
    blurb: "Profil, přehled zabezpečení, odhlášení a žádost o smazání účtu.",
    blurbEn: "Profile, a security overview, sign-out and an account-deletion request.",
  },
  {
    key: "branding",
    order: 29,
    label: "Branding",
    labelEn: "Branding",
    icon: "creative",
    area: "settings",
    availableFor: ALL,
    blurb: "Brand accent a logo pro klientské reporty a web (s živým náhledem hlavičky).",
    blurbEn: "Brand accent and logo for client reports and the microsite (with a live header preview).",
  },
  {
    key: "spotreba",
    order: 30,
    label: "Spotřeba",
    labelEn: "Usage",
    icon: "usage",
    area: "settings",
    availableFor: ALL,
    blurb: "Spotřeba AI podle operace a modelu za období: náklady, tokeny, podíl a export CSV.",
    blurbEn: "AI usage by operation and model over a period: cost, tokens, share and CSV export.",
  },
  {
    key: "mesicni-report",
    order: 31,
    label: "Měsíční report",
    labelEn: "Monthly report",
    icon: "reports",
    area: "performance",
    availableFor: ALL,
    blurb: "Klientský souhrn výkonu za období: KPI dlaždice, AI narativ, tisk a export.",
    blurbEn: "A client-ready performance recap: KPI tiles, an AI narrative, print and export.",
  },
  {
    key: "aktivita",
    order: 32,
    label: "Aktivita",
    labelEn: "Activity",
    icon: "activity",
    area: "settings",
    availableFor: ALL,
    blurb: "Sjednocená časová osa akcí napříč moduly a AI: filtr podle modulu, závažnosti a období, export CSV.",
    blurbEn: "A unified timeline of module + AI actions: filter by module, severity and window, export CSV.",
  },
  {
    key: "integrace",
    order: 33,
    label: "Integrace",
    labelEn: "Integrations",
    icon: "integrations",
    area: "settings",
    availableFor: ALL,
    blurb: "Stav napojení: připravenost konektorů (reklama, AI, recenze, reporty, infrastruktura) pro nasazení.",
    blurbEn: "Integration status: connector readiness (advertising, AI, reviews, reports, infrastructure) for deployment.",
  },
  {
    key: "nastaveni",
    order: 34,
    label: "Nastavení",
    labelEn: "Settings",
    icon: "settings",
    area: "settings",
    availableFor: ALL,
    blurb: "Název, branding, napojení Google Ads a typ projektu.",
    blurbEn: "Name, branding, Google Ads connection and project type.",
  },
  {
    // The home for what the Obsahový engine actually produced. Appended (rather than
    // slotted next to the engine) so every existing `order` value — and the pinned
    // sidebar sequence per project type — stays exactly as it was; it renders last
    // within Tvorba/Studio. Distinct from "knihovna" (Knihovna vzorů), which keeps
    // its own home, label and behaviour: that one holds winning ad patterns, this
    // one holds your saved briefs and article drafts.
    key: "ulozeny-obsah",
    order: 35,
    label: "Uložený obsah",
    labelEn: "Saved content",
    icon: "library",
    area: "studio",
    availableFor: ALL,
    blurb: "Uložené briefy a koncepty článků z Obsahového enginu: u projektu, ne jen v prohlížeči.",
    blurbEn: "Saved briefs and article drafts from the Content engine: kept with the project, not just in your browser.",
  },
  {
    // Lead management over the row-based `lib/leads` store (docs/leads/design.md).
    // Appended with the next `order` so no existing sidebar sequence shifts; renders
    // last within Komunikace. Every project type gets enquiries, hence ALL.
    key: "leady",
    order: 36,
    label: "Leady",
    labelEn: "Leads",
    icon: "leads",
    area: "channels",
    availableFor: ALL,
    blurb: "Kontakty a poptávky s fází, skóre a SLA odpočtem: co vyřídit teď, celá databáze a časová osa.",
    blurbEn: "Contacts and enquiries with stage, score and an SLA clock: what to handle now, the full database and a timeline.",
  },
];

/** Modules available for a project type, grouped by area then by explicit
 *  intra-area `order`. Sorting on `order` (not relying on a stable sort over the
 *  raw array) makes the sequence explicit and testable; because `order` is the
 *  canonical registry index it reproduces the previous registry-order output byte
 *  for byte. */
export function modulesFor(type: ProjectType): ModuleDef[] {
  return MODULES.filter((m) => m.availableFor.includes(type)).sort(
    (a, b) => AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area) || a.order - b.order
  );
}

/** The areas a project type actually has: an area with no available module is
 *  not shown (ADR-0013 — `local` sees Local, `eshop` does not). Home always is. */
export function areasFor(type: ProjectType): AreaKey[] {
  const present = new Set(modulesFor(type).map((m) => m.area));
  return AREAS.map((a) => a.key).filter((k) => k === "home" || present.has(k));
}

/** The URL segment of a module under /app/[projectId] (ADR-0013). Home and
 *  settings modules stay flat; a roof module is its area's slug; every other
 *  module is a room nested under its area. */
export function moduleSegment(m: Pick<ModuleDef, "key" | "area">): string {
  if (m.area === "home" || m.area === "settings") return m.key;
  const area = AREAS.find((a) => a.key === m.area)!;
  if (ROOF_MODULE[m.area] === m.key) return area.slug;
  return `${area.slug}/${m.key}`;
}

/** Absolute href of a module for a project. Unknown keys fall back to the flat
 *  path, which the redirects in next.config.ts still resolve. */
export function moduleHref(projectId: string, key: string): string {
  const m = MODULES.find((x) => x.key === key);
  const seg = m ? moduleSegment(m) : key;
  return `/app/${projectId}${seg ? `/${seg}` : ""}`;
}

/** Absolute href of an area roof for a project. */
export function areaHref(projectId: string, area: AreaKey): string {
  const slug = AREAS.find((a) => a.key === area)!.slug;
  return `/app/${projectId}${slug ? `/${slug}` : ""}`;
}

/** Old flat URL → nested URL, for every module that moved (the 308s in
 *  next.config.ts are generated from this, so a new room redirects for free). */
export function movedModuleRoutes(): Array<{ from: string; to: string }> {
  return MODULES.filter((m) => m.key && moduleSegment(m) !== m.key).map((m) => ({ from: m.key, to: moduleSegment(m) }));
}

/** Whether a route segment is a valid module for the given type (for 404s). */
export function isModuleAvailable(type: ProjectType, key: string): boolean {
  return MODULES.some((m) => m.key === key && m.availableFor.includes(type));
}

/* -------------------------------------------------------------------------- */
/*  KPI presets — how the overview's headline figures adapt per type.          */
/*  Every type pulls from the same metrics engine (the only dataset in v1) but */
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

/** Resolve an area header for the active locale. */
export function areaLabel(a: ModuleArea, locale: SupportedLocale): string {
  return locale === "en" ? AREA_LABELS_EN[a] : AREA_LABELS[a];
}

/** Resolve a KPI label for the active locale. */
export function kpiLabel(k: KpiDef, locale: SupportedLocale): string {
  return locale === "en" ? k.labelEn : k.label;
}

/** Plain-language gloss for the jargon KPI abbreviations, so a non-marketer isn't
 *  lost on screen one (BM-L1-09). Keyed by metric — only the acronyms need it;
 *  plain metrics (revenue, visits, conversions…) resolve to "". */
const KPI_HINTS: Partial<Record<KpiMetric, { cs: string; en: string }>> = {
  roas: {
    cs: "ROAS = kolik korun tržeb připadá na 1 Kč výdajů na reklamu (vyšší je lepší).",
    en: "ROAS = revenue earned for every 1 unit spent on ads (higher is better).",
  },
  pno: {
    cs: "PNO = podíl nákladů na obratu: kolik % z tržeb padne na reklamu (nižší je lepší).",
    en: "Cost-to-revenue ratio: what share of revenue goes to ads (lower is better).",
  },
  cpa: {
    cs: "Kolik v průměru zaplatíte za jednu konverzi: získání zákazníka nebo leadu.",
    en: "The average cost to win one conversion: a customer or a lead.",
  },
  convRate: {
    cs: "Konverzní poměr = kolik procent návštěv skončí konverzí.",
    en: "Conversion rate = the share of visits that end in a conversion.",
  },
};

/** Resolve a KPI's plain-language hint for the active locale, or "" if the metric
 *  needs no gloss. Render as a tooltip so the abbreviation teaches on hover. */
export function kpiHint(k: KpiDef, locale: SupportedLocale): string {
  const h = KPI_HINTS[k.metric];
  return h ? (locale === "en" ? h.en : h.cs) : "";
}
