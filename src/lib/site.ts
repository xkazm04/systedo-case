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

/** Stack facts shown in the footer "O projektu" column — a single source of
 *  truth so the footer can't contradict the rest of the app. Note the data line:
 *  content (dashboard/article) is DB-free JSON, while the bonus campaigns page
 *  persists to local node:sqlite — so "JSON persistence (bez DB)" alone was wrong. */
export const STACK_FACTS: string[] = [
  "Next.js 16 · App Router",
  "Data: JSON (obsah) + node:sqlite (kampaně)",
  "LLM · claude-sonnet (dev) · gemini-3-flash-preview (prod)",
  "Nasaditelné na Vercel",
];
