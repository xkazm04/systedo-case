/** Single source of truth for the primary navigation, shared by the header,
 *  footer and the home page so links never drift out of sync. */
export interface NavItem {
  href: string;
  label: string;
  /** short description used on the home page cards */
  blurb: string;
  /** the assignment task number this page fulfils (0 = overview) */
  task: number;
}

/** One step in a breadcrumb trail. The final crumb (current page) omits `href`. */
export interface Crumb {
  label: string;
  href?: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Přehled",
    blurb: "Rozcestník případové studie a zdůvodnění zvoleného stacku.",
    task: 0,
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    blurb: "Výkonnostní přehled klienta — návštěvy, náklady, konverze, obrat a PNO.",
    task: 1,
  },
  {
    href: "/clanek",
    label: "Článek",
    blurb: "Publikovaný článek pro web mionelo.cz se správnou strukturou a prolinkováním.",
    task: 2,
  },
  {
    href: "/ai-asistent",
    label: "AI asistent",
    blurb: "Tři marketingové nástroje na Gemini — PPC inzeráty, SEO obsahový brief a analýza výkonu.",
    task: 3,
  },
  {
    href: "/kampane",
    label: "Kampaně",
    blurb: "Bonus: přehled kampaní z Google Ads se srovnáním podle typů, AI vyhodnocením a uložením do SQLite.",
    task: 4,
  },
];

/** Label of a nav item by its href, so breadcrumbs reuse the same wording as
 *  the header/footer instead of hard-coding strings that can drift. */
export function navLabel(href: string, fallback = ""): string {
  return NAV_ITEMS.find((i) => i.href === href)?.label ?? fallback;
}

/** All routes for the sitemap, derived from the one nav model plus the meta
 *  pages, so adding a page is a single edit away from the sitemap. */
export function sitemapEntries(): string[] {
  return [...NAV_ITEMS.map((i) => i.href), "/mapa", "/clanek/vykon", "/design-system"];
}

/** Diacritics-aware slug ("Zdravý jídelníček" → "zdravy-jidelnicek"). */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Path to the (future) blog hub filtered by a category. The article page lives
 *  at /clanek today; once it grows into a listing hub the same URL filters by
 *  category — so the visible breadcrumb link and the BreadcrumbList JSON-LD stay
 *  pointed at one consistent address. */
export function categoryHubPath(category: string): string {
  return `/clanek?kategorie=${slugify(category)}`;
}
