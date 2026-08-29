/** The cadence cap at the ONE write chokepoint.
 *
 *  `POST /api/social/posts` is where the week planner, the content-plan board's
 *  hand-off and the Distribuce variant card all create a scheduled post — which is
 *  the only reason a cap written once in the kanály wizard can bind all three. Two
 *  things have to be true at the same time, and they pull against each other:
 *
 *   • A post that would break the operator's own "max n× týdně" promise is REFUSED,
 *     with a machine-readable body the three callers can render a cap message from.
 *   • A project that has set no cap must be COMPLETELY unaffected — same response,
 *     and not one extra store read. That is the byte-identity pin below, and it is
 *     the reason the route resolves the rules before it resolves anything else.
 *
 *  Plus the override: a human click, re-posted with `overrideCadence`, which
 *  creates the post AND leaves the exception on the audit timeline. Nothing here
 *  auto-reschedules.
 *
 *  Runs with --experimental-test-module-mocks: session, ownership, the write rail
 *  and all five stores are doubles, so the route is reachable with no auth and no
 *  database. */
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const UID = "u-owner";
const PID = "p-1";
const TENANT = `u_${UID}_proj_${PID}`;

/** A day inside the SAME local week, comfortably in the future so the route's
 *  past-schedule guard never fires: next Monday + `d` days at 10:00 local. */
function nextWeek(d = 0, h = 10) {
  const at = new Date();
  at.setHours(h, 0, 0, 0);
  at.setDate(at.getDate() + (8 - ((at.getDay() + 6) % 7)) + d);
  return at.toISOString();
}

const world = {
  posts: [],
  channels: null,
  created: [],
  activity: [],
  listPostsCalls: 0,
};

mock.module("@/lib/session", { namedExports: { currentUserId: async () => UID } });
mock.module("@/lib/projects/store", {
  namedExports: { getProject: async (uid, id) => (uid === UID && id === PID ? { id: PID, name: "Mionelo", type: "eshop" } : null) },
});
mock.module("@/app/api/social/guard", {
  namedExports: {
    socialTenant: async () => TENANT,
    guardSocialWrite: async () => null,
  },
});
mock.module("@/lib/campaigns/activity", { namedExports: { recordActivity: async () => {} } });
mock.module("@/lib/i18n/locale", { namedExports: { getServerLocale: async () => "cs" } });
mock.module("@/lib/activity/emit", {
  namedExports: {
    emitProjectActivity: async (uid, pid, entry) => {
      world.activity.push({ uid, pid, entry });
    },
  },
});
mock.module("@/lib/campaigns/connector", { namedExports: { resolveTenant: async () => TENANT } });
mock.module("@/lib/social/store", {
  namedExports: {
    createPost: async (tenant, input) => {
      world.created.push({ tenant, input });
      return { id: `new-${world.created.length}`, ...input, createdAt: "2026-08-24T00:00:00.000Z" };
    },
    listPosts: async () => {
      world.listPostsCalls += 1;
      return world.posts;
    },
    updatePost: async () => {},
    deletePost: async () => true,
  },
});
mock.module("@/lib/organic-channels/store", {
  namedExports: { getOrganicChannels: async () => world.channels },
});
mock.module("@/lib/twin/store", { namedExports: { getTwin: async () => null } });
mock.module("@/lib/distribution/variants-store", { namedExports: { getVariants: async () => null } });
mock.module("@/lib/project-state/store", { namedExports: { getProjectState: async () => null } });

const route = await import("@/app/api/social/posts/route");

const post = (body) =>
  route.POST(
    new Request("http://localhost/api/social/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

const scheduled = (platform, scheduledAt) => ({
  platform,
  content: "Nová zimní směs ořechů — ochutnejte.",
  scheduledAt,
  projectId: PID,
});

/** n instagram posts already scheduled in the same week as `at`. */
const fill = (n, at) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    platform: "instagram",
    content: `Existing ${i}`,
    status: "scheduled",
    scheduledAt: at,
    createdAt: at,
  }));

beforeEach(() => {
  world.posts = [];
  world.channels = null;
  world.created = [];
  world.activity = [];
  world.listPostsCalls = 0;
});

/* -------------------------------------------------------------------------- */
/*  Byte identity: a project with no cap must not notice this feature exists    */
/* -------------------------------------------------------------------------- */

test("no tracked cap → the scheduled post is created exactly as before", async () => {
  const at = nextWeek(0);
  const res = await post(scheduled("instagram", at));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.post, {
    id: "new-1",
    platform: "instagram",
    content: "Nová zimní směs ořechů — ochutnejte.",
    status: "scheduled",
    scheduledAt: at,
    createdAt: "2026-08-24T00:00:00.000Z",
  });
  assert.deepEqual(world.created[0].input, {
    platform: "instagram",
    content: "Nová zimní směs ořechů — ochutnejte.",
    status: "scheduled",
    scheduledAt: at,
  });
});

test("no tracked cap → not one extra store read (the rules short-circuit first)", async () => {
  // Ten posts already in the week: with no cap, the route must not even LOOK.
  world.posts = fill(10, nextWeek(0));
  await post(scheduled("instagram", nextWeek(1)));
  assert.equal(world.listPostsCalls, 0, "the calendar is never resolved when no cap is in force");
});

test("a cap on a DIFFERENT channel never refuses this one", async () => {
  world.channels = { tracks: { "linkedin-organic": { stage: "live", maxPerWeek: 1 } } };
  world.posts = fill(5, nextWeek(0));
  const res = await post(scheduled("instagram", nextWeek(1)));
  assert.equal(res.status, 200);
  assert.equal(world.created.length, 1);
});

/* -------------------------------------------------------------------------- */
/*  The refusal                                                                */
/* -------------------------------------------------------------------------- */

test("a post over the cap is refused with 409 cadence-exceeded, and nothing is written", async () => {
  world.channels = { tracks: { "instagram-organic": { stage: "live", maxPerWeek: 2 } } };
  const at = nextWeek(0);
  world.posts = fill(2, at);
  const res = await post(scheduled("instagram", nextWeek(2)));
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, "cadence-exceeded");
  assert.equal(body.channel, "instagram");
  assert.equal(body.cap, 2);
  assert.equal(body.count, 2);
  assert.match(body.weekStart, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(world.created.length, 0, "no post is created");
  assert.equal(world.activity.length, 0, "a refusal is not an override");
});

test("the cap binds on the item that BREAKS it, not the one that fills it", async () => {
  world.channels = { tracks: { "instagram-organic": { stage: "live", maxPerWeek: 3 } } };
  const at = nextWeek(0);
  world.posts = fill(2, at);
  const ok = await post(scheduled("instagram", nextWeek(1)));
  assert.equal(ok.status, 200, "the third post of three still fits");
});

test("a post in the NEXT week is not refused by this week's fill", async () => {
  world.channels = { tracks: { "instagram-organic": { stage: "live", maxPerWeek: 1 } } };
  world.posts = fill(3, nextWeek(0));
  const res = await post(scheduled("instagram", nextWeek(7)));
  assert.equal(res.status, 200);
});

/* -------------------------------------------------------------------------- */
/*  The override — a human click, on the record                                */
/* -------------------------------------------------------------------------- */

test("overrideCadence creates the post AND writes the exception to the audit timeline", async () => {
  world.channels = { tracks: { "instagram-organic": { stage: "live", maxPerWeek: 2 } } };
  world.posts = fill(2, nextWeek(0));
  const res = await post({ ...scheduled("instagram", nextWeek(3)), overrideCadence: true });
  assert.equal(res.status, 200);
  assert.equal(world.created.length, 1);
  assert.equal(world.activity.length, 1);
  const { uid, pid, entry } = world.activity[0];
  assert.equal(uid, UID);
  assert.equal(pid, PID);
  assert.equal(entry.module, "kanaly", "the audit sits with the module that owns the cap");
  assert.equal(entry.kind, "update");
  assert.equal(entry.severity, "warning");
  // Persisted prose follows the clicker's locale (the mock above says cs).
  assert.match(entry.title, /Limit kadence ručně překročen/);
  assert.match(entry.detail, /instagram · 3\/2/);
});

test("an override that was not needed writes no audit row", async () => {
  world.channels = { tracks: { "instagram-organic": { stage: "live", maxPerWeek: 5 } } };
  world.posts = fill(1, nextWeek(0));
  const res = await post({ ...scheduled("instagram", nextWeek(1)), overrideCadence: true });
  assert.equal(res.status, 200);
  assert.equal(world.activity.length, 0);
});

test("only the literal true overrides — a truthy string does not", async () => {
  world.channels = { tracks: { "instagram-organic": { stage: "live", maxPerWeek: 1 } } };
  world.posts = fill(1, nextWeek(0));
  const res = await post({ ...scheduled("instagram", nextWeek(2)), overrideCadence: "yes" });
  assert.equal(res.status, 409);
});

/* -------------------------------------------------------------------------- */
/*  Scope of the gate                                                          */
/* -------------------------------------------------------------------------- */

test("the gate governs SCHEDULING only — the existing 422s still come first", async () => {
  world.channels = { tracks: { "instagram-organic": { stage: "live", maxPerWeek: 1 } } };
  world.posts = fill(4, nextWeek(0));
  // An unparseable date is still a 422, not a 409: the gate never sees it.
  const bad = await post({ ...scheduled("instagram", "not-a-date") });
  assert.equal(bad.status, 422);
  // An empty caption is still a 422.
  const empty = await post({ platform: "instagram", content: "", scheduledAt: nextWeek(1), projectId: PID });
  assert.equal(empty.status, 422);
});
