/** Every number the free-channels marketing page states, DERIVED from the code
 *  that actually ships it — never typed into copy.
 *
 *  The rule this file exists to enforce: a marketing claim about the free-channel
 *  path is a claim about `src/lib/organic-channels/sample.ts` and
 *  `src/lib/organic-channels/types.ts`. Curating one more channel, retiring one,
 *  or adding a channel family moves the page the same day it moves the product,
 *  because the page reads the catalog rather than a snapshot of it.
 *
 *  The demo plan is the SAME call the public `/dashboard?m=kanaly` demo makes
 *  (`DemoModule`'s `kanaly` case) against the SAME fixture project, so the table
 *  on the marketing page and the table in the live demo cannot disagree.
 *
 *  Pure: no I/O, no React, no locale. */
import { channelPlanForProject, baseChannelPlan } from "@/lib/organic-channels/sample";
import { CHANNEL_CATEGORIES, type OrganicChannel } from "@/lib/organic-channels/types";
import { demoProjectFor } from "@/lib/demo/projects";
import { getProjectCatalog, localitiesFor } from "@/lib/catalog/resolve";
import { PROJECT_TYPES } from "@/lib/projects/types";
import type { Project } from "@/lib/projects/types";

/** Fixed instant for the catalog read. `getProjectCatalog` defaults to
 *  `new Date()`, and this page prerenders under Cache Components — a live clock
 *  in a prerendered tree is both a build-time error waiting to happen and a
 *  source of drift between the marketing table and the demo. The demo fixtures
 *  themselves are pinned to this instant (src/lib/demo/projects.ts). */
const DEMO_NOW = new Date("2026-01-01T00:00:00.000Z");

export interface FreeChannelFacts {
  /** channel families the model and the catalog share (types.ts CHANNEL_CATEGORIES) */
  families: number;
  /** business types with a curated plan (PROJECT_TYPES) */
  businessTypes: number;
  /** distinct curated channels across every type's plan */
  curatedChannels: number;
  /** the fixture the public demo runs on */
  demo: {
    project: Project;
    /** the seeded plan, fit-ranked — byte-identical to the /dashboard?m=kanaly table */
    plan: OrganicChannel[];
  };
}

/** Grounding for the demo plan, mirroring `DemoModule`'s `kanaly` case exactly:
 *  first catalog category + first locality, so the seeded copy names the real
 *  business instead of falling back to "vaší nabídky". */
function demoPlan(project: Project): OrganicChannel[] {
  const catalog = getProjectCatalog(project, DEMO_NOW);
  const categories = [...new Set(catalog.map((o) => o.category).filter(Boolean))];
  const localities = localitiesFor(project).map((l) => l.name);
  return channelPlanForProject(project, {
    ...(categories[0] ? { category: categories[0] } : {}),
    ...(localities[0] ? { locality: localities[0] } : {}),
  });
}

export function freeChannelFacts(): FreeChannelFacts {
  const project = demoProjectFor("eshop");
  // Union over every type's curated list. The seed key is constant so this count
  // is a property of the catalog, not of a project — the wobble only moves `fit`.
  const ids = new Set(
    PROJECT_TYPES.flatMap((type) => baseChannelPlan(type, {}, "facts").map((c) => c.id))
  );
  return {
    families: CHANNEL_CATEGORIES.length,
    businessTypes: PROJECT_TYPES.length,
    curatedChannels: ids.size,
    demo: { project, plan: demoPlan(project) },
  };
}
