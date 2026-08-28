/** Single source of truth for the primary navigation, shared by the header,
 *  footer and the home page so links never drift out of sync. */
import type { SupportedLocale } from "@/lib/format";
import { getMessages } from "@/lib/i18n/messages";

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
    blurb: "Výkonnostní přehled klienta: návštěvy, náklady, konverze, obrat a PNO.",
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
    blurb: "Tři marketingové nástroje na Gemini: PPC inzeráty, SEO obsahový brief a analýza výkonu.",
    task: 3,
  },
  {
    href: "/kampane",
    label: "Kampaně",
    blurb: "Bonus: přehled kampaní z Google Ads se srovnáním podle typů, AI vyhodnocením a uložením do SQLite.",
    task: 4,
  },
];

/** Public FEATURE pages — real product surfaces with their own page, which are
 *  NOT case-study assignment tasks. Kept separate from NAV_ITEMS on purpose: the
 *  task journey (TaskPager, /mapa, the 404's task list) orders by `task`, and a
 *  feature page has no place in that numbering. `task: -1` marks "outside the
 *  journey" for any consumer that still meets one of these items.
 *
 *  This is the single declaration: the footer, the sitemap, the quick-nav palette
 *  and the homepage crossroad all derive from it, so adding a feature page is one
 *  edit rather than four. */
export const FEATURE_NAV_ITEMS: NavItem[] = [
  {
    href: "/kanaly-zdarma",
    label: "Kanály zdarma",
    blurb: "Kde se zviditelnit bez rozpočtu na reklamu: katalogy, komunity, obsah a partnerství.",
    task: -1,
  },
];

/** Overlay label + blurb from the message dictionary for a non-cs locale, keeping
 *  href/task intact. cs is the authoring source, so it returns the items as-is. */
function localize(items: NavItem[], locale: SupportedLocale): NavItem[] {
  if (locale === "cs") return items;
  const copy = getMessages(locale).nav.items;
  return items.map((item) => {
    const c = copy[item.href];
    return c ? { ...item, label: c.label, blurb: c.blurb } : item;
  });
}

/** Nav items localized for the given locale. cs returns the source items
 *  unchanged (zero risk); other locales overlay label + blurb from the message
 *  dictionary, keeping href/task intact. */
export function localizedNavItems(locale: SupportedLocale): NavItem[] {
  return localize(NAV_ITEMS, locale);
}

/** {@link FEATURE_NAV_ITEMS}, localized the same way. */
export function localizedFeatureNavItems(locale: SupportedLocale): NavItem[] {
  return localize(FEATURE_NAV_ITEMS, locale);
}

/** Label of a nav item by its href, so breadcrumbs reuse the same wording as
 *  the header/footer instead of hard-coding strings that can drift. Locale-aware:
 *  pass the active locale so a non-cs breadcrumb gets the translated label rather
 *  than the raw cs source (matching localizedNavItems). `locale` is REQUIRED — a
 *  silent cs default made a forgotten argument render Czech labels with no error. */
export function navLabel(href: string, fallback: string, locale: SupportedLocale): string {
  const items = locale === "cs" ? NAV_ITEMS : localizedNavItems(locale);
  return items.find((i) => i.href === href)?.label ?? fallback;
}

/** Meta pages linked from the footer AND included in the sitemap — declared once
 *  here so the footer and sitemapEntries can't drift apart. Each carries the footer
 *  message key for its label. */
export const FOOTER_META_PAGES = [
  { href: "/cena", key: "pricing" },
  { href: "/socialni", key: "social" },
  { href: "/knihovna", key: "library" },
  { href: "/kvalita-modelu", key: "quality" },
  { href: "/lokalni-seo", key: "localSeo" },
  { href: "/mapa", key: "map" },
  { href: "/design-system", key: "design" },
  { href: "/ochrana-osobnich-udaju", key: "privacy" },
  { href: "/podminky", key: "terms" },
] as const;

/** All routes for the sitemap, derived from the one nav model plus the feature
 *  pages and the shared meta pages, so adding a page is a single edit away from
 *  both the footer and sitemap. */
export function sitemapEntries(): string[] {
  return [
    ...NAV_ITEMS.map((i) => i.href),
    ...FEATURE_NAV_ITEMS.map((i) => i.href),
    ...FOOTER_META_PAGES.map((p) => p.href),
    "/clanek/vykon",
  ];
}

/** One footer link. The feature pages reuse their nav label (so a rename is one
 *  edit); the meta pages carry their own footer message key. */
export interface FooterLink {
  href: string;
  label: string;
}

/** Every link the site footer renders, in order: the feature pages first (they
 *  are product surfaces), then the meta/legal pages. Derived from the same two
 *  declarations the sitemap and the palette read. */
export function footerLinks(locale: SupportedLocale): FooterLink[] {
  const messages = getMessages(locale).footer.links;
  return [
    ...localizedFeatureNavItems(locale).map((i) => ({ href: i.href, label: i.label })),
    ...FOOTER_META_PAGES.map((p) => ({ href: p.href, label: messages[p.key] })),
  ];
}

/** Diacritics-insensitive text normalization (NFD strip + lowercase), shared by
 *  `slugify` and the quick-nav matcher so "clanek" finds "Článek". */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Diacritics-aware slug ("Zdravý jídelníček" → "zdravy-jidelnicek"). */
export function slugify(value: string): string {
  return normalizeForSearch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** One destination the quick-nav (Cmd/Ctrl+K) palette can jump to. */
export interface NavSearchTarget {
  href: string;
  label: string;
  /** secondary search text shown as the row's hint (journey blurb / section name) */
  hint: string;
}

/** Every palette-reachable destination, derived from the same typed nav model
 *  the header/footer render (journey pages + feature pages + footer meta pages +
 *  `/app` when authed) — so the palette can't drift from the real navigation. Pure. */
export function navSearchTargets(locale: SupportedLocale, authed: boolean): NavSearchTarget[] {
  const messages = getMessages(locale);
  const targets: NavSearchTarget[] = [
    ...localizedNavItems(locale),
    ...localizedFeatureNavItems(locale),
  ].map((item) => ({
    href: item.href,
    label: item.label,
    hint: item.blurb,
  }));
  for (const page of FOOTER_META_PAGES) {
    targets.push({ href: page.href, label: messages.footer.links[page.key], hint: messages.footer.pages });
  }
  if (authed) targets.push({ href: "/app", label: messages.nav.openApp, hint: "" });
  return targets;
}

/** Filter + rank targets for a palette query, diacritics-insensitively:
 *  label prefix beats label substring beats hint substring (stable within a
 *  tier). An empty query returns everything in nav order. Pure. */
export function matchNavTargets(query: string, targets: NavSearchTarget[]): NavSearchTarget[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return targets;
  const scored: { target: NavSearchTarget; score: number }[] = [];
  for (const target of targets) {
    const label = normalizeForSearch(target.label);
    const score = label.startsWith(q)
      ? 0
      : label.includes(q)
        ? 1
        : normalizeForSearch(target.hint).includes(q)
          ? 2
          : -1;
    if (score >= 0) scored.push({ target, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.target);
}

/** Path to the article hub. The case study has a single article surface at
 *  /clanek; a `?kategorie=` filter would live here once a real listing hub
 *  exists, but until then we point at /clanek directly rather than emit a query
 *  that resolves to nothing — so the breadcrumb link and its JSON-LD aren't dead. */
export function categoryHubPath(): string {
  return "/clanek";
}
