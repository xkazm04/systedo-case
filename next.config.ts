import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project lives alongside other apps in a parent folder that also has a
  // lockfile. Pin the Turbopack root to this directory so module resolution and
  // output tracing stay scoped to the app.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
