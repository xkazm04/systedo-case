import { CLAUDE_MODEL, GEMINI_MODEL } from "@/lib/llm/models";

/** Canonical site origin, resolved from the deploy environment so OG tags,
 *  canonical links and share URLs are correct regardless of the Vercel project
 *  or custom domain. Shared by the root metadata and any component that needs
 *  an absolute URL (e.g. the article ShareBar). */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://systedo-case.vercel.app");

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
  "Adamant je AI pracovní prostor pro reklamu — vzácný druh v adtech. Výkonnostní dashboardy, kampaňová inteligence a generování reklam napříč Google Ads, Sklik a dalšími.";
export const SITE_DESCRIPTION_EN =
  "Adamant is the AI workspace for advertising — a rare breed in adtech. Performance dashboards, campaign intelligence and AI ad generation across Google Ads, Sklik and more.";
/** The description the static, non-locale-aware metadata + manifest use. */
export const SITE_DESCRIPTION = SITE_DESCRIPTION_CS;

/** Stack facts shown in the footer "O projektu" column — a single source of
 *  truth so the footer can't contradict the rest of the app. The model line is
 *  imported from the LLM wrapper (not hand-typed) so it can never drift from the
 *  models actually in play; the data line names each store's real backing. */
export const STACK_FACTS: string[] = [
  "Next.js 16 · App Router",
  "Data: JSON (obsah) + Firestore (kampaně) · node:sqlite (rate-limit)",
  `LLM · ${CLAUDE_MODEL} (dev) · ${GEMINI_MODEL} (prod)`,
  "Nasaditelné na Vercel",
];
