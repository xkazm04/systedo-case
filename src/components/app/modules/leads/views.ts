/** The module's VIEW REGISTRY — one typed list the tab strip, the URL parser and
 *  the renderer all read, so adding a view is one entry rather than four edits in
 *  three files.
 *
 *  `mapa` is declared and NOT enabled on purpose: an aggregate/map overview is the
 *  next view this module gets, and leaving the seam typed (rather than "we'll add a
 *  tab later") is what stops the third view from being bolted on beside a hardcoded
 *  ternary. A disabled view is never rendered and never reachable from the URL —
 *  `parseView` degrades an unknown or disabled value to the default. */
import type { TDict } from "@/lib/i18n/interpolate";

export const LEAD_VIEWS = ["vse", "fronta", "mapa"] as const;
export type LeadView = (typeof LEAD_VIEWS)[number];

/** The database is the landing view: it is the one that scales past a few hundred
 *  contacts, and it is what an operator opening the module is usually looking for. */
export const DEFAULT_VIEW: LeadView = "vse";

export interface LeadViewDef {
  key: LeadView;
  /** false ⇒ registered but not built; hidden from the tab strip and the URL */
  enabled: boolean;
}

export const LEAD_VIEW_DEFS: LeadViewDef[] = [
  { key: "vse", enabled: true },
  { key: "fronta", enabled: true },
  { key: "mapa", enabled: false },
];

export const VIEW_T: TDict<LeadView> = {
  cs: { vse: "Databáze", fronta: "Fronta", mapa: "Mapa" },
  en: { vse: "Database", fronta: "Queue", mapa: "Map" },
};

export function enabledViews(): LeadViewDef[] {
  return LEAD_VIEW_DEFS.filter((v) => v.enabled);
}

/** Coerce a `?view=` value to a view that actually exists and is built. */
export function parseView(raw: string | null): LeadView {
  const hit = LEAD_VIEW_DEFS.find((v) => v.key === raw && v.enabled);
  return hit ? hit.key : DEFAULT_VIEW;
}
