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

/** One-line product description — the root metadata and the manifest read the
 *  same string. */
export const SITE_DESCRIPTION =
  "Adamant is the AI workspace for advertising — a rare breed in adtech. Performance dashboards, campaign intelligence and AI ad generation across Google Ads, Sklik and more.";

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
