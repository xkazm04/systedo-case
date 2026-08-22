/** The module's VIEW REGISTRY — one typed list the tab strip, the URL parser and
 *  the renderer all read, so adding a view is one entry rather than four edits in
 *  three files.
 *
 *  A disabled view is never rendered and never reachable from the URL —
 *  `parseView` degrades an unknown or disabled value to the default. The aggregate
 *  views receive the shared `AggregateViewProps` (see view-props.ts) so they stay
 *  swappable without the module knowing their internals. */
import type { TDict } from "@/lib/i18n/interpolate";

export const LEAD_VIEWS = ["vse", "fronta", "segmenty", "krajina"] as const;
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
  // Two competing aggregate overviews, built as separate prototypes so the owner
  // can pick the winner in the app; the loser is removed, not kept disabled.
  { key: "segmenty", enabled: true },
  { key: "krajina", enabled: true },
];

export const VIEW_T: TDict<LeadView> = {
  cs: { vse: "Databáze", fronta: "Fronta", segmenty: "Segmenty", krajina: "Krajina" },
  en: { vse: "Database", fronta: "Queue", segmenty: "Segments", krajina: "Landscape" },
};

export function enabledViews(): LeadViewDef[] {
  return LEAD_VIEW_DEFS.filter((v) => v.enabled);
}

/** Coerce a `?view=` value to a view that actually exists and is built. */
export function parseView(raw: string | null): LeadView {
  const hit = LEAD_VIEW_DEFS.find((v) => v.key === raw && v.enabled);
  return hit ? hit.key : DEFAULT_VIEW;
}
