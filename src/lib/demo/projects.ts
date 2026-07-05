/** Demo workspace projects — the mock tenants the public /dashboard demo renders
 *  every module against. No auth, no Firestore: these are plain in-memory Project
 *  objects with fixed timestamps (nothing reaches for Date.now during render, so
 *  it stays deterministic under Cache Components / the React compiler).
 *
 *  Each module is shown on a project whose *type* fits it, so type-specific
 *  modules (profit → eshop, lead-quality → leadgen, audience → content) get
 *  coherent sample data instead of a mismatched shape. The eshop project mirrors
 *  the case-study client (Mionelo) so the demo agrees with the homepage proof
 *  band and the authed dashboard. Framework-free (no React) — importable from both
 *  the server dispatcher and the client shell. */
import { MODULES, type ModuleDef } from "@/lib/projects/modules";
import { PROJECT_TYPE_META, PROJECT_TYPES, type Project, type ProjectType } from "@/lib/projects/types";

/** Fixed instant — the demo never needs a live clock. */
const DEMO_TS = "2026-01-01T00:00:00.000Z";

/** One representative brand per business type. */
const DEMO_SEEDS: Record<ProjectType, { name: string; domain: string }> = {
  eshop: { name: "Mionelo", domain: "mionelo.cz" },
  app: { name: "Flowbase", domain: "flowbase.io" },
  leadgen: { name: "Klimatherm", domain: "klimatherm.cz" },
  content: { name: "Reflektor", domain: "reflektor.cz" },
};

function toProject(type: ProjectType): Project {
  const seed = DEMO_SEEDS[type];
  return {
    id: `demo-${type}`,
    name: seed.name,
    type,
    accentColor: PROJECT_TYPE_META[type].defaultAccent,
    domain: seed.domain,
    createdAt: DEMO_TS,
    updatedAt: DEMO_TS,
  };
}

/** All four demo projects, in type order. */
export const DEMO_PROJECTS: Project[] = PROJECT_TYPES.map(toProject);

/** The demo project for a business type. */
export function demoProjectFor(type: ProjectType): Project {
  return DEMO_PROJECTS.find((p) => p.type === type) ?? DEMO_PROJECTS[0]!;
}

/** Pick the fitting demo project for a module: e-shop when the module supports it
 *  (the flagship / default), otherwise the module's first supported type. */
export function demoProjectForModule(m: ModuleDef): Project {
  const type: ProjectType = m.availableFor.includes("eshop") ? "eshop" : m.availableFor[0]!;
  return demoProjectFor(type);
}

/** Retired module keys → their successor, so old deep links still resolve. */
const MODULE_ALIASES: Record<string, string> = {
  // "Obsah & SEO" was merged into the unified "Obsahový engine" (Tvorba).
  obsah: "obsahovy-engine",
};

/** Resolve a `?m=` value (possibly an array) to a real module — defaults to the
 *  overview when absent or unknown; retired keys map to their successor. */
export function demoModuleFor(key: string | string[] | undefined): ModuleDef {
  const raw = (Array.isArray(key) ? key[0] : key) ?? "";
  const k = MODULE_ALIASES[raw] ?? raw;
  return MODULES.find((m) => m.key === k) ?? MODULES[0]!;
}

/** Href for a module inside the demo (the overview drops the query param). */
export function demoHref(key: string): string {
  return key ? `/dashboard?m=${key}` : "/dashboard";
}
