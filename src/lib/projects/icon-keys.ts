/** Stable string keys for the icons used by the project model + module registry.
 *  Kept separate (and framework-free) so `types.ts` / `modules.ts` stay free of
 *  React/SVG imports; the UI resolves a key to a component via the `MODULE_ICONS`
 *  map in `@/components/app/icon-map`. */
export type IconKey =
  | "overview"
  | "dashboard"
  | "campaigns"
  | "keywords"
  | "content"
  | "social"
  | "creative"
  | "patterns"
  | "reports"
  | "settings"
  | "store"
  | "app"
  | "leads"
  | "plus"
  | "folder"
  | "profit"
  | "catalog"
  | "season"
  | "ltv"
  | "experiment"
  | "compare"
  | "quality"
  | "speed"
  | "local"
  | "locations"
  | "map"
  | "clusters"
  | "distribute"
  | "audience";
