import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/** Web app manifest: makes a pinned/installed instance (the /app workspace is
 *  a dashboard people revisit) carry the Adamant name, monolith icon and onyx
 *  background instead of a generic fallback. Name + description come from the
 *  same lib/site constants the root metadata uses; Next auto-links it from the
 *  root layout. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "cs",
    start_url: "/",
    display: "standalone",
    // Onyx from the viewport theme-color constants: the monolith icon art is
    // dark, so a dark splash/theme matches it under both color schemes.
    background_color: "#0a0f16",
    theme_color: "#0a0f16",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      {
        src: "/brand/logo-monolith.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
