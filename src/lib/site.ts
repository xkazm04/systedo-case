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
