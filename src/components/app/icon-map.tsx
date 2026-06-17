/** Resolves the framework-free `IconKey`s used by the project model + module
 *  registry to actual icon components. Kept in the UI layer so `types.ts` /
 *  `modules.ts` stay free of React/SVG imports. */
import { createElement, type SVGProps } from "react";
import type { IconKey } from "@/lib/projects/icon-keys";
import {
  AppWindow,
  Beaker,
  Bookmark,
  Box,
  Calendar,
  Cog,
  Coins,
  Compare,
  Document,
  Edit,
  Folder,
  Gauge,
  Grid,
  Inbox,
  Megaphone,
  Palette,
  Plus,
  Pulse,
  Search,
  Store,
  Users,
} from "@/components/icons";

type Icon = (props: SVGProps<SVGSVGElement>) => React.ReactElement;

export const MODULE_ICONS: Record<IconKey, Icon> = {
  overview: Grid,
  dashboard: Gauge,
  campaigns: Megaphone,
  keywords: Search,
  content: Edit,
  social: Users,
  creative: Palette,
  patterns: Bookmark,
  reports: Document,
  settings: Cog,
  store: Store,
  app: AppWindow,
  leads: Inbox,
  plus: Plus,
  folder: Folder,
  profit: Coins,
  catalog: Box,
  season: Calendar,
  ltv: Pulse,
  experiment: Beaker,
  compare: Compare,
};

/** Renders the icon for a key. Use this (not `const Icon = MODULE_ICONS[k]`)
 *  inside render: it indexes a stable, module-level component map via
 *  createElement, so React keeps a stable component type across renders (no
 *  remount churn / "component created during render"). */
export function ModuleIcon({
  icon,
  ...props
}: { icon: IconKey } & SVGProps<SVGSVGElement>) {
  return createElement(MODULE_ICONS[icon] ?? Grid, props);
}
