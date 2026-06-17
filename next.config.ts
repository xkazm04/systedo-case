import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project lives alongside other apps in a parent folder that also has a
  // lockfile. Pin the Turbopack root to this directory so module resolution and
  // output tracing stay scoped to the app.
  turbopack: {
    root: import.meta.dirname,
  },

  // Loosen caching so the authed product always reflects the latest version.
  // staleTimes=0 disables reuse of the client-side Router Cache, so every
  // navigation refetches fresh RSC instead of replaying a stale snapshot.
  experimental: {
    staleTimes: { dynamic: 0, static: 0 },
  },

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

export default nextConfig;
