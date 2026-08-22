/** The module's VIEW REGISTRY — one typed list the tab strip, the URL parser and
 *  the renderer all read, so adding a view is one entry rather than four edits in
 *  three files.
 *
 *  Two views only. Segmenty stopped being one on 2026-08-22: the segment map now
 *  sits ON the landing view, above the table it filters, because a map you have to
 *  leave in order to act on it is a map nobody uses twice.
 *
 *  A disabled view is never rendered and never reachable from the URL —
 *  `parseView` degrades an unknown or disabled value to the default. */
import type { TDict } from "@/lib/i18n/interpolate";

export const LEAD_VIEWS = ["prehled", "fronta"] as const;
export type LeadView = (typeof LEAD_VIEWS)[number];

/** The overview is the landing view: segment map on top, the database beneath it. */
export const DEFAULT_VIEW: LeadView = "prehled";

export interface LeadViewDef {
  key: LeadView;
  /** false ⇒ registered but not built; hidden from the tab strip and the URL */
  enabled: boolean;
}

export const LEAD_VIEW_DEFS: LeadViewDef[] = [
  { key: "prehled", enabled: true },
  { key: "fronta", enabled: true },
];

export const VIEW_T: TDict<LeadView> = {
  cs: { prehled: "Přehled", fronta: "Fronta" },
  en: { prehled: "Overview", fronta: "Queue" },
};

export function enabledViews(): LeadViewDef[] {
  return LEAD_VIEW_DEFS.filter((v) => v.enabled);
}

/** Coerce a `?view=` value to a view that actually exists and is built. */
export function parseView(raw: string | null): LeadView {
  const hit = LEAD_VIEW_DEFS.find((v) => v.key === raw && v.enabled);
  return hit ? hit.key : DEFAULT_VIEW;
}
