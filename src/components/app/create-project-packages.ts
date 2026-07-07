/** PROTOTYPE-LOCAL package model for the create-project variants.
 *
 *  Encodes each module's status per project type — core (locked on), on (in the
 *  type's package), add (proposed to extend the package — the review outcome), no
 *  (not applicable). The `add` set is the review's proposed additions and is NOT
 *  wired into the real registry: flip these into `MODULES.availableFor` (modules.ts)
 *  once the review is approved. Framework-free so both variants can import it. */
import { MODULES, type ModuleDef } from "@/lib/projects/modules";
import type { ProjectType } from "@/lib/projects/types";

export type ModuleStatus = "core" | "on" | "add" | "no";

/** Present in every workspace, locked on: overview, performance, settings. */
const CORE_KEYS = new Set(["", "vykon", "nastaveni"]);

/** The package-review proposals: modules that should become available for a type
 *  on top of today's `availableFor`. Marked "+ navrženo" in the UI. */
export const PROPOSED_ADDS: Record<ProjectType, string[]> = {
  eshop: ["experimenty-lp"],
  app: ["kreativa"],
  leadgen: ["socialni", "kreativa", "experimenty-lp", "ltv"],
  content: ["kampane", "knihovna"],
  local: ["kreativa", "knihovna"],
};

export function moduleStatus(m: ModuleDef, type: ProjectType): ModuleStatus {
  const inType = m.availableFor.includes(type);
  if (inType && CORE_KEYS.has(m.key)) return "core";
  if (inType) return "on";
  if (PROPOSED_ADDS[type].includes(m.key)) return "add";
  return "no";
}

/** Default-enabled module keys for a type (core + in-package). */
export function defaultModules(type: ProjectType): Set<string> {
  const s = new Set<string>();
  for (const m of MODULES) {
    const st = moduleStatus(m, type);
    if (st === "core" || st === "on") s.add(m.key);
  }
  return s;
}

/** Size of the default package for a type (used in the type headers/cards). */
export function packageSize(type: ProjectType): number {
  return defaultModules(type).size;
}
