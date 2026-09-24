/** Headless onboarding apply for the /onboard skill (docs/headless-outreach/design.md).
 *
 *  Takes a marketing-profile JSON (produced by a repo scan in a Claude Code
 *  session) and applies it to the LOCAL_DB stores through the SAME two functions
 *  the app uses — not a copy of them:
 *    - a new project is born through `provisionProject` (src/lib/projects/provision.ts),
 *      exactly like POST /api/projects: the row, a starter catalog, an activity entry;
 *    - the scan is applied through `applyScanToProject` (src/lib/onboarding/apply.ts),
 *      exactly like the in-app onboarding apply: profile saved, competitors MERGED as
 *      unconfirmed scan suggestions, the scan keyword list seeded idempotently under
 *      the tenant the keyword-lists route reads (resolveTenant, so a connected
 *      Ads/Sklik account is honoured);
 *    - optionally, the profile's own offerings replace the starter catalog.
 *  test-unit/project-provision.test.mjs fences this file against re-growing a copy.
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
  { getProject },
  { coerceProjectType },
  { provisionProject },
  { sanitizeScanProfile },
  { applyScanToProject },
  { sanitizeOfferings },
  { saveOfferings },
] = await Promise.all([
  import("@/lib/projects/store.ts"),
  import("@/lib/projects/types.ts"),
  import("@/lib/projects/provision.ts"),
  import("@/lib/onboarding/types.ts"),
  import("@/lib/onboarding/apply.ts"),
  import("@/lib/catalog/validate.ts"),
  import("@/lib/catalog/store.ts"),
]);

const receipt = { userId };

// The scan is validated BEFORE anything is created, so a bad profile never leaves
// an empty project behind.
const scan = sanitizeScanProfile(profile.scan);
if (!scan) {
  console.error("profile.scan failed sanitizeScanProfile — invalid or missing required fields.");
  process.exit(1);
}

// 1. Project: reuse or provision.
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
  ({ project } = await provisionProject(
    userId,
    {
      name: String(p.name),
      type: coerceProjectType(p.type),
      ...(p.domain ? { domain: String(p.domain) } : {}),
    },
    { activityTitle: "Projekt vytvořen" },
  ));
  receipt.created = true;
}
receipt.projectId = project.id;

// 2. Scan profile + competitor merge + keyword seed — one call, the app's own.
const applied = await applyScanToProject(userId, project, scan);
receipt.scanApplied = true;
if (applied.competitors) {
  const w = applied.competitors.warning;
  receipt.competitors = {
    suggested: applied.competitors.suggested ?? 0,
    skipped: applied.competitors.skipped ?? 0,
    dropped: w && w.code === "competitors-truncated" ? w.dropped : 0,
    ...(w && w.code === "competitors-merge-failed" ? { failed: true } : {}),
  };
}
if ("seeded" in applied.keywords) receipt.keywordsSeeded = applied.keywords.seeded;
else if ("failed" in applied.keywords) receipt.keywordsFailed = true;

// 3. Optional catalog write — only when the profile carries offerings.
if (Array.isArray(profile.offerings) && profile.offerings.length > 0) {
  const offerings = sanitizeOfferings(profile.offerings, project.id);
  if (offerings.length > 0) {
    await saveOfferings(userId, project.id, offerings);
    receipt.offerings = offerings.length;
  }
}

console.log(JSON.stringify(receipt, null, 2));
