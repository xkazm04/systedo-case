/** Headless grounding dump for the /outreach skill (docs/headless-outreach/design.md).
 *
 *  Reads a project's business context straight from the LOCAL_DB sqlite stores —
 *  the same catalog/competitor spine kanaly/page.tsx assembles for channel-research —
 *  plus the twin's trained-voice status, and prints one JSON object to stdout.
 *
 *    node --conditions react-server scripts/outreach/grounding.mjs            # list projects
 *    node --conditions react-server scripts/outreach/grounding.mjs <projectId>
 *
 *  The react-server condition is required (same as test:llm) so `server-only`
 *  imports in the store graph resolve. Never run against production data: the
 *  script forces LOCAL_DB and refuses NODE_ENV=production.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

if (process.env.NODE_ENV === "production") {
  console.error("grounding.mjs is a local-dev tool; refusing to run in production.");
  process.exit(1);
}
process.env.NODE_ENV = "development";
process.env.LOCAL_DB = "true";
process.env.DEV_AUTH = "true";

register(
  pathToFileURL(resolve(process.cwd(), "test-llm/resolve-hooks.mjs")).href,
  pathToFileURL(`${process.cwd()}/`).href,
);

const userId = process.env.DEV_AUTH_USER_ID || "dev-user";
const projectId = process.argv[2];

const { listProjects, getProject } = await import("@/lib/projects/store.ts");

if (!projectId) {
  const projects = await listProjects(userId);
  console.log(
    JSON.stringify(
      projects.map((p) => ({ id: p.id, name: p.name, type: p.type })),
      null,
      2,
    ),
  );
  process.exit(0);
}

const project = await getProject(userId, projectId);
if (!project) {
  console.error(`Project ${projectId} not found for user ${userId}. Run without args to list.`);
  process.exit(1);
}

const [
  { getProjectCatalog, localitiesFor },
  { listOfferings },
  { isDemoProject },
  { getCompetitors },
  { curatedCompetitors },
  { channelPlanForProject },
  { resolveOrganicChannels },
  { resolveTwin },
  { getOnboarding },
] = await Promise.all([
  import("@/lib/catalog/resolve.ts"),
  import("@/lib/catalog/store.ts"),
  import("@/lib/projects/demo.ts"),
  import("@/lib/competitors/store.ts"),
  import("@/lib/competitors/types.ts"),
  import("@/lib/organic-channels/sample.ts"),
  import("@/lib/organic-channels/resolve.ts"),
  import("@/lib/twin/resolve.ts"),
  import("@/lib/onboarding/store.ts"),
]);

// Mirror src/lib/catalog/load.ts loadProjectCatalog without its `@/lib/session`
// import (next-auth won't load under plain Node): demo → seed; stored ?? seed.
async function loadCatalog() {
  if (isDemoProject(project)) return getProjectCatalog(project, new Date());
  const stored = await listOfferings(userId, project.id);
  return stored ?? getProjectCatalog(project, new Date());
}

const [catalog, competitorSet, onboarding] = await Promise.all([
  loadCatalog(),
  getCompetitors(project.id).catch(() => null),
  getOnboarding(project.id).catch(() => null),
]);

const categories = [...new Set(catalog.map((o) => o.category).filter(Boolean))];
const localities = localitiesFor(project).map((l) => l.name);
const competitors = curatedCompetitors(competitorSet?.competitors).map((c) => ({
  name: c.name,
  ...(c.url ? { url: c.url } : {}),
}));
const keywords = [...new Set(catalog.map((o) => o.name).filter(Boolean))].slice(0, 8);

const sample = channelPlanForProject(project, {
  category: categories[0],
  locality: localities[0],
});
const channels = await resolveOrganicChannels(project.id, sample);
const twin = await resolveTwin(project.id, project.type);

const scan = onboarding?.scan;
console.log(
  JSON.stringify(
    {
      project: { id: project.id, name: project.name, type: project.type },
      offering: categories.slice(0, 4).join(", "),
      localities,
      competitors,
      keywords,
      profile: scan
        ? {
            summary: scan.summary,
            audience: scan.audience,
            toneOfVoice: scan.toneOfVoice,
            ...(scan.url ? { url: scan.url } : {}),
          }
        : null,
      // The pinned channel plan: hypotheses the researchers may deepen (design
      // decision: research is open-ended; linkage to a channel is optional).
      channelPlan: {
        source: channels.source,
        channels: channels.channels.map((ch) => ({
          id: ch.id,
          name: ch.name,
          category: ch.category,
          fit: ch.fit,
          status: channels.statuses[ch.id] ?? "idea",
        })),
      },
      // Which voice scopes are trained (non-empty directives) — dispatch readiness.
      twinVoices: twin.state.voices
        .filter((v) => v.directives.trim().length > 0)
        .map((v) => ({ scope: v.scope, traits: v.traits, lengthHint: v.lengthHint })),
    },
    null,
    2,
  ),
);
