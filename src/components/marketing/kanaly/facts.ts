/** Every number the free-channels marketing surfaces state, DERIVED from the code
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
 *  on the marketing page and the table in the live demo cannot disagree — and the
 *  grounding it is built from comes from `buildKanalyGrounding`, the app's own
 *  pure, unit-tested builder that `/app/[projectId]/kanaly` uses, rather than a
 *  marketing-side re-implementation of "what the module knows about a business".
 *
 *  Pure: no I/O, no React, no locale. */
import { channelPlanForProject, baseChannelPlan } from "@/lib/organic-channels/sample";
import { CHANNEL_CATEGORIES, type OrganicChannel } from "@/lib/organic-channels/types";
import {
  buildKanalyGrounding,
  kanalyGroundingInput,
  type ChannelGrounding,
} from "@/lib/organic-channels/grounding";
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
    /** exactly what the module knows about this business before it ranks anything:
     *  the offering line, the localities and the keywords the plan speaks from.
     *  Built by the APP's builder, so the walkthrough cannot narrate a grounding
     *  step the product does not actually perform. */
    grounding: ChannelGrounding;
  };
}

/** Grounding + seeded plan for the demo fixture, assembled the way the real page
 *  assembles them: catalog rows and localities through `kanalyGroundingInput`
 *  (no competitor read — the demo has no tenant competitor store, and the
 *  competitor leg only grounds AI REGENERATION, never the seeded fill) and then
 *  `buildKanalyGrounding`, whose `sample` result carries the `{category}` /
 *  `{locality}` fill the seeded plan interpolates. */
function demoRead(project: Project): { plan: OrganicChannel[]; grounding: ChannelGrounding } {
  const { grounding, sample } = buildKanalyGrounding(
    kanalyGroundingInput({
      catalog: getProjectCatalog(project, DEMO_NOW),
      localities: localitiesFor(project),
    })
  );
  return { plan: channelPlanForProject(project, sample), grounding };
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
    demo: { project, ...demoRead(project) },
  };
}
