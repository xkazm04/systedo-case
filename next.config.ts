import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // This project lives alongside other apps in a parent folder that also has a
  // lockfile. Pin the Turbopack root to this directory so module resolution and
  // output tracing stay scoped to the app.
  turbopack: {
    root: import.meta.dirname,
  },

  // Cache Components + Instant Navigations (Next 16.3). Dynamic-by-default with
  // no implicit caching: every route renders a static shell instantly, and any
  // per-request/per-user data (auth, locale, project data) streams in behind a
  // <Suspense> boundary. This supersedes the old `staleTimes: 0` freshness hack —
  // dynamic data is never part of the cached shell, so navigations stay fresh
  // *and* feel instant. partialPrefetching prefetches one reusable shell per
  // route (not one request per link) and caches it on the client for the session.
  cacheComponents: true,
  partialPrefetching: true,

  async headers() {
    // Content-Security-Policy in REPORT-ONLY mode — derived from what the app
    // actually loads, so the report stream is signal, not noise:
    //  - script/style 'unsafe-inline': Next injects inline scripts (hydration/RSC
    //    payload) and the root layout ships the theme/lang pre-paint snippets;
    //    styles are Tailwind chunks + inline style attributes (global-error,
    //    framer-motion, leaflet).
    //  - img https: + data: + blob:: leaflet basemap tiles (*.basemaps.cartocdn.com),
    //    Google OAuth avatars (lh3.googleusercontent.com), user-configured report
    //    logo URLs (arbitrary https), and Creative Studio data/blob previews.
    //  - font-src 'self': next/font self-hosts Geist at build time.
    //  - connect-src: own API routes plus the Sentry browser ingest endpoints
    //    (active only when NEXT_PUBLIC_SENTRY_DSN is set; Firestore/LLM calls are
    //    server-side only and never hit the browser).
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

    return [
      // Baseline security headers for every route (marketing site + /app + API).
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
      // Belt-and-suspenders: forbid any browser/CDN from caching the authed app's
      // HTML/RSC, so a deploy never serves a previous app version behind /app.
      {
        source: "/app/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

// DevInspector — dev-only source-location stamping (press `;` then `i`, then
// right-click a component to copy its `src/.../File.tsx:LINE`). Opt-in: the
// Turbopack loader is only registered when launched via `npm run dev:inspect`
// (which sets DEV_INSPECT=1), so a normal `npm run dev` and every production
// build are completely unaffected. See scripts/dev-inspector/.
if (process.env.DEV_INSPECT === "1") {
  const loader = path.join(process.cwd(), "scripts", "dev-inspector", "source-loc-loader.cjs");
  nextConfig.turbopack = {
    ...nextConfig.turbopack,
    rules: {
      ...nextConfig.turbopack?.rules,
      "*.tsx": { loaders: [{ loader, options: { rootDir: process.cwd() } }] },
      "*.jsx": { loaders: [{ loader, options: { rootDir: process.cwd() } }] },
    },
  };
}

export default nextConfig;
