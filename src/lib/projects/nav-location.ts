/** Where a pathname sits in a project's area tree (ADR-0013): which area, which
 *  module (room), and whether it is the area's roof itself. Pure — the sidebar,
 *  the demo shell and the tests all read the same answer. */
import { AREAS, type AreaKey } from "./areas";
import { MODULES, ROOF_MODULE, moduleSegment, type ModuleArea, type ModuleDef } from "./modules";

export interface NavLocation {
  area: ModuleArea;
  /** The module the path points at; null on a roof that is not itself a module. */
  module: ModuleDef | null;
  /** True when the path is the area's roof (including a roof that is a module). */
  isRoof: boolean;
}

/** Resolve `pathname` (e.g. `/app/p1/reach/kampane`) against `base` (`/app/p1`).
 *  The longest matching module segment wins, so `performance/report` beats the
 *  `performance` roof. An unknown path falls back to Home. */
export function navLocation(pathname: string, base: string, modules: ModuleDef[] = MODULES): NavLocation {
  const rest = pathname === base ? "" : pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : null;
  if (rest === null || rest === "") {
    return { area: "home", module: modules.find((m) => m.key === "") ?? null, isRoof: true };
  }
  let best: ModuleDef | null = null;
  let bestLen = -1;
  for (const m of modules) {
    const seg = moduleSegment(m);
    if (!seg) continue;
    if ((rest === seg || rest.startsWith(`${seg}/`)) && seg.length > bestLen) {
      best = m;
      bestLen = seg.length;
    }
  }
  const first = rest.split("/")[0]!;
  const roofArea = AREAS.find((a) => a.slug && a.slug === first);
  if (best) {
    const roofKey = best.area === "settings" ? undefined : ROOF_MODULE[best.area as AreaKey];
    return { area: best.area, module: best, isRoof: roofKey === best.key && rest === moduleSegment(best) };
  }
  if (roofArea) return { area: roofArea.key, module: null, isRoof: rest === roofArea.slug };
  return { area: "home", module: null, isRoof: false };
}
