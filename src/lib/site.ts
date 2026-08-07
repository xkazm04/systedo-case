/** Canonical site origin, resolved from the deploy environment so OG tags,
 *  canonical links and share URLs are correct regardless of the Vercel project
 *  or custom domain. Shared by the root metadata and any component that needs
 *  an absolute URL (e.g. the article ShareBar). The literal is the LAST-RESORT
 *  fallback (a non-Vercel build with no NEXT_PUBLIC_SITE_URL): the canonical
 *  adamant host per docs/deploy.md ("Host rename", decision 2026-08-04) — never
 *  the retired systedo-case name. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://adamant.vercel.app");

/** Absolute canonical URL for a path (leading slash optional). */
export function canonical(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}

/** Product/brand name, shared by the root metadata and the web app manifest so
 *  an installed/pinned instance can never drift from the browser tab. */
export const SITE_NAME = "Adamant";

/** Canonical contact addresses — one brand, one domain, everywhere (E1). A buyer
 *  doing due diligence must never see two company names or two support domains. */
export const SUPPORT_EMAIL = "podpora@adamant.app";
export const SALES_EMAIL = "obchod@adamant.app";

/** One-line product description for the STATIC share surface (root <meta
 *  description>, OpenGraph, web app manifest).
 *
 *  DECISION: the static share/install surface speaks CZECH. The site is
 *  Czech-first — `lang="cs"` is the SSR default, the opengraph-image renders Czech
 *  copy, the nav/footer are Czech; English is an opt-in cookie upgrade applied to
 *  page CONTENT, not to this static card (which is generated once, before any
 *  cookie). Using the English string here produced English text over a Czech OG
 *  image under a `lang: "cs"` manifest — three languages for one brand surface.
 *  The `_EN` variant is kept for any future locale-aware (generateMetadata) use. */
export const SITE_DESCRIPTION_CS =
  "Adamant je AI pracovní prostor pro reklamu, vzácný druh v adtech. Výkonnostní dashboardy, kampaňová inteligence a generování reklam napříč Google Ads, Sklik a dalšími.";
export const SITE_DESCRIPTION_EN =
  "Adamant is the AI workspace for advertising, a rare breed in adtech. Performance dashboards, campaign intelligence and AI ad generation across Google Ads, Sklik and more.";
/** The description the static, non-locale-aware metadata + manifest use. */
export const SITE_DESCRIPTION = SITE_DESCRIPTION_CS;
