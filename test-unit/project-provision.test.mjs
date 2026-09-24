/** One provisioning seam — `provisionProject()` is the only way a project is born.
 *
 *  Before it existed, three places decided what "a new project" means: POST
 *  /api/projects, POST /api/sken/redeem and the /onboard skill's
 *  scripts/outreach/apply-onboarding.mjs. They had already drifted — the activity
 *  log was fatal in one route and best-effort in the other, and the script created
 *  projects with no starter catalog at all. What is pinned here is the contract the
 *  copies disagreed on:
 *
 *   - the project row is the ONE part that may fail the call (and is created once);
 *   - the starter catalog and the activity entry are best-effort and REPORTED, so a
 *     log hiccup can never turn a created project into a 500 the client re-submits;
 *   - the script cannot grow a third copy back (a source fence).
 *
 *  Stores are module-mocked (in-memory). Run with --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let projects = [];
let createCalls = 0;
let offerings = [];
let starterArgs = [];
let activity = [];
let failActivity = false;
let failCatalog = false;
let failCreate = false;
let currentUser = null;

mock.module("@/lib/session", { namedExports: { currentUserId: async () => currentUser } });

mock.module("@/lib/projects/store", {
  namedExports: {
    createProject: async (userId, input) => {
      createCalls += 1;
      if (failCreate) throw new Error("projects store down");
      const project = {
        id: `p${projects.length + 1}`,
        userId,
        name: input.name,
        type: input.type,
        accentColor: input.accentColor ?? "#123456",
        ...(input.domain ? { domain: input.domain } : {}),
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z",
      };
      projects.push(project);
      return project;
    },
    listProjects: async () => projects,
  },
});

mock.module("@/lib/catalog/store", {
  namedExports: {
    saveOfferings: async (uid, projectId, items) => {
      if (failCatalog) throw new Error("catalog store down");
      offerings.push({ uid, projectId, count: items.length });
    },
  },
});

mock.module("@/lib/catalog/starter", {
  namedExports: {
    defaultNatureFor: () => "online",
    starterCatalog: (projectId, type, nature) => {
      starterArgs.push({ projectId, type, nature });
      return [{ id: "o1" }];
    },
  },
});

mock.module("@/lib/activity/emit", {
  namedExports: {
    emitProjectActivity: async (uid, projectId, entry) => {
      if (failActivity) throw new Error("activity log down");
      activity.push({ uid, projectId, ...entry });
    },
  },
});

const { provisionProject } = await import("@/lib/projects/provision");
const { POST: createRoute } = await import("@/app/api/projects/route");

function reset() {
  projects = [];
  createCalls = 0;
  offerings = [];
  starterArgs = [];
  activity = [];
  failActivity = false;
  failCatalog = false;
  failCreate = false;
  currentUser = null;
}

const post = (body) =>
  createRoute(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

test("provision: an activity-log failure is reported, never thrown — and the project is created once", async () => {
  reset();
  failActivity = true;
  const out = await provisionProject("u1", { name: "X", type: "eshop" }, { activityTitle: "Projekt vytvořen" });
  assert.equal(out.project.name, "X");
  assert.equal(out.catalogSeeded, true, "the starter catalog still lands");
  assert.equal(out.activityLogged, false, "the log failure is visible in the result");
  assert.equal(createCalls, 1, "createProject was called exactly once");
});

test("provision: a catalog failure is reported too, and the activity still lands", async () => {
  reset();
  failCatalog = true;
  const out = await provisionProject("u1", { name: "X", type: "eshop" }, { activityTitle: "Projekt vytvořen" });
  assert.equal(out.catalogSeeded, false);
  assert.equal(out.activityLogged, true);
  assert.equal(activity[0].title, "Projekt vytvořen", "the caller names its own activity line");
});

test("provision: the project row is the one part that fails the call", async () => {
  reset();
  failCreate = true;
  await assert.rejects(provisionProject("u1", { name: "X", type: "eshop" }, { activityTitle: "t" }));
  assert.equal(offerings.length, 0, "nothing is seeded for a project that does not exist");
  assert.equal(activity.length, 0);
});

test("POST /api/projects: an activity-log failure after creation is still a 201 with one project", async () => {
  reset();
  currentUser = "u1";
  failActivity = true;
  const res = await post({ name: "Nový", type: "eshop" });
  assert.equal(res.status, 201, "a created project must not answer 500 (the client would re-submit)");
  const body = await res.json();
  assert.equal(body.project?.id, "p1");
  assert.equal(projects.length, 1, "one project row");
});

test("POST /api/projects: the requested offering nature reaches the starter catalog", async () => {
  reset();
  currentUser = "u1";
  assert.equal((await post({ name: "Lokál", type: "local", nature: "local" })).status, 201);
  assert.equal(starterArgs[0].nature, "local");
  assert.equal((await post({ name: "Bez", type: "eshop", nature: "bogus" })).status, 201);
  assert.equal(starterArgs[1].nature, "online", "an unknown nature falls back to the type's default");
});

test("source fence: the /onboard script applies a scan through the two lib seams, never a copy", () => {
  const src = readFileSync(join(ROOT, "scripts/outreach/apply-onboarding.mjs"), "utf8");
  assert.ok(src.includes("applyScanToProject"), "the script applies the scan through applyScanToProject");
  assert.ok(src.includes("provisionProject"), "the script creates a project through provisionProject");
  for (const copy of ["saveOnboarding(", "saveKeywordList(", "buildTenantKey", "createProject("]) {
    assert.ok(!src.includes(copy), `the script must not re-implement the apply (${copy})`);
  }
});
