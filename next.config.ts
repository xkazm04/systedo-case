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

  // Belt-and-suspenders: forbid any browser/CDN from caching the authed app's
  // HTML/RSC, so a deploy never serves a previous app version behind /app.
  async headers() {
    return [
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
