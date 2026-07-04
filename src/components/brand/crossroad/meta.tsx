/** Shared model for the homepage crossroad — the four case-study destinations
 *  that used to live in the header nav (Task 1–4). Client-safe: maps each nav
 *  href to its icon + the subtle Leonardo background illustration, keyed by href
 *  so the (server-resolved, localized) nav items can be merged on the client
 *  without passing non-serializable icon components across the boundary. */
import type { ComponentType, SVGProps } from "react";
import { Gauge, Document, Sparkles, Target } from "@/components/icons";
import type { NavItem } from "@/lib/nav";

export interface CrossroadMeta {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** subtle ambient illustration (public/brand/crossroad/*.png) */
  image: string;
}

/** The four destinations moved out of the header, in journey order. */
export const CROSSROAD_HREFS = ["/dashboard", "/clanek", "/ai-asistent", "/kampane"] as const;

export const CROSSROAD_META: Record<string, CrossroadMeta> = {
  "/dashboard": { icon: Gauge, image: "/brand/crossroad/dashboard.png" },
  "/clanek": { icon: Document, image: "/brand/crossroad/clanek.png" },
  "/ai-asistent": { icon: Sparkles, image: "/brand/crossroad/ai-asistent.png" },
  "/kampane": { icon: Target, image: "/brand/crossroad/kampane.png" },
};

/** Card = a localized nav item (serializable — passed server→client). The icon +
 *  illustration are resolved on the client from CROSSROAD_META by href, since an
 *  icon component can't cross the server/client boundary as a prop. */
export type CrossroadItem = NavItem;
