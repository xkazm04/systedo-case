/** Headless onboarding apply for the /onboard skill (docs/headless-outreach/design.md).
 *
 *  Takes a marketing-profile JSON (produced by a repo scan in a Claude Code
 *  session) and applies it to the LOCAL_DB stores exactly the way the in-app
 *  onboarding apply route does (src/app/api/projects/[id]/onboarding/route.ts):
 *  save the scan profile, MERGE competitors as unconfirmed scan suggestions,
 *  seed the scan keyword list idempotently, and optionally write the catalog.
 *
 *    node --conditions react-server scripts/outreach/apply-onboarding.mjs <profile.json> [projectId]
 *
 *  Without projectId a new project is created from profile.project. Prints a
 *  JSON receipt (projectId + what was written) to stdout. Local-dev only.
 *
 *  Profile contract (the skill writes this file):
 *    {
 *      "project": { "name": "...", "type": "eshop|app|leadgen|content|local", "domain"?: "..." },
 *      "scan":    { OnboardingScanResult fields + "scannedUrl"? },
 *      "offerings"?: [ raw offerings — passed through sanitizeOfferings ]
 *    }
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

if (process.env.NODE_ENV === "production") {
  console.error("apply-onboarding.mjs is a local-dev tool; refusing to run in production.");
  process.exit(1);
}
process.env.NODE_ENV = "development";
process.env.LOCAL_DB = "true";
process.env.DEV_AUTH = "true";

register(
  pathToFileURL(resolve(process.cwd(), "test-llm/resolve-hooks.mjs")).href,
  pathToFileURL(`${process.cwd()}/`).href,
);

const [profilePath, projectIdArg] = process.argv.slice(2);
if (!profilePath) {
  console.error("Usage: apply-onboarding.mjs <profile.json> [projectId]");
  process.exit(1);
}
const profile = JSON.parse(readFileSync(resolve(profilePath), "utf8"));
const userId = process.env.DEV_AUTH_USER_ID || "dev-user";

const [
  { getProject, createProject },
  { coerceProjectType },
  { getOnboarding, saveOnboarding },
  { sanitizeScanProfile },
  { getCompetitors, saveCompetitors },
  { mergeScanSuggestions },
  { buildTenantKey },
  { listKeywordLists, saveKeywordList },
  { SCAN_LIST_SEED, SCAN_LIST_NAME, scanKeywordsToSaved, shouldSeedScanList },
  { sanitizeOfferings },
  { saveOfferings },
] = await Promise.all([
  import("@/lib/projects/store.ts"),
  import("@/lib/projects/types.ts"),
  import("@/lib/onboarding/store.ts"),
  import("@/lib/onboarding/types.ts"),
  import("@/lib/competitors/store.ts"),
  import("@/lib/competitors/merge.ts"),
  import("@/lib/campaigns/store-keys.ts"),
  import("@/lib/keywords/store.ts"),
  import("@/lib/onboarding/seed.ts"),
  import("@/lib/catalog/validate.ts"),
  import("@/lib/catalog/store.ts"),
]);

const receipt = { userId };

// 1. Project: reuse or create.
let project;
if (projectIdArg) {
  project = await getProject(userId, projectIdArg);
  if (!project) {
    console.error(`Project ${projectIdArg} not found for ${userId}.`);
    process.exit(1);
  }
} else {
  const p = profile.project ?? {};
  if (!p.name) {
    console.error("profile.project.name is required when creating a project.");
    process.exit(1);
  }
  project = await createProject(userId, {
    name: String(p.name),
    type: coerceProjectType(p.type),
    ...(p.domain ? { domain: String(p.domain) } : {}),
  });
  receipt.created = true;
}
receipt.projectId = project.id;

// 2. Scan profile → onboarding state (mirrors the route: merge over existing,
//    stamp appliedAt, flip scanApplied).
const scan = sanitizeScanProfile(profile.scan);
if (!scan) {
  console.error("profile.scan failed sanitizeScanProfile — invalid or missing required fields.");
  process.exit(1);
}
const now = new Date().toISOString();
const existing = await getOnboarding(project.id).catch(() => null);
await saveOnboarding(project.id, {
  ...(existing ?? {}),
  scan: { ...scan, appliedAt: now },
  scanApplied: true,
  updatedAt: now,
});
receipt.scanApplied = true;

// 3. Competitors: MERGE as unconfirmed scan suggestions — never replace curated.
if (scan.competitors.length > 0) {
  const stored = await getCompetitors(project.id).catch(() => null);
  const merged = mergeScanSuggestions(stored?.competitors ?? [], scan.competitors);
  if (!merged.unchanged) {
    await saveCompetitors(project.id, { competitors: merged.competitors, updatedAt: now });
  }
  receipt.competitors = { suggested: merged.added, skipped: merged.skipped, dropped: merged.dropped };
}

// 4. Keyword list seed — idempotent via SCAN_LIST_SEED. A fresh dev project has
//    no Ads/Sklik connection, so resolveTenant reduces to the pure key builder.
if (scan.keywords.length > 0) {
  const tenant = buildTenantKey(userId, project.id);
  const lists = await listKeywordLists(tenant);
  if (shouldSeedScanList(lists.map((l) => l.seed), scan.keywords.length)) {
    const keywords = scanKeywordsToSaved(scan.keywords, scan.businessName);
    if (keywords.length > 0) {
      await saveKeywordList(tenant, {
        name: SCAN_LIST_NAME,
        seed: SCAN_LIST_SEED,
        source: "sample",
        keywords,
      });
      receipt.keywordsSeeded = keywords.length;
    }
  }
}

// 5. Optional catalog write — only when the profile carries offerings.
if (Array.isArray(profile.offerings) && profile.offerings.length > 0) {
  const offerings = sanitizeOfferings(profile.offerings, project.id);
  if (offerings.length > 0) {
    await saveOfferings(userId, project.id, offerings);
    receipt.offerings = offerings.length;
  }
}

console.log(JSON.stringify(receipt, null, 2));
