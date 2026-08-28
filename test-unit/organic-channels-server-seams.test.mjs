/** The two SERVER seams of Kanály zdarma that nothing reached:
 *
 *   1. `POST` / `DELETE /api/projects/[id]/organic-channels` — the only door through
 *      which a tenant's tracked lifecycle and pinned plan are written or dropped;
 *   2. `resolveOrganicChannels`'s DEGRADED path — the branch that decides whether the
 *      module is showing a sample because there is nothing saved, or because the read
 *      of what IS saved just failed.
 *
 *  Both were listed as untested seams in the ship record (gap T3), and both are the
 *  kind of code that looks obviously correct and is load-bearing anyway:
 *
 *   • The route is 20 lines, and every one of them is a security or integrity
 *     decision — ownership before the write, sanitize-the-wire before the store, the
 *     project id coming from the GUARD's resolved project rather than the path
 *     parameter (the store is keyed by project id ALONE, so an unverified id is a
 *     cross-tenant write by construction — see store.ts's keying invariant).
 *   • `degraded` is the difference between "you have nothing yet" and "we cannot see
 *     what you have", and the whole UI hangs off it: the banner, the disabled quick
 *     win, and `saveTracks`' refusal to write. It cannot be exercised without making
 *     the store throw, which is why nothing ever did.
 *
 *  Runs with --experimental-test-module-mocks: session + project store + channel
 *  store are mocked so both seams are reachable without auth or a database. */
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const NOW = "2026-08-28T00:00:00.000Z";
const OWNER = "u-owner";

/** Mutable test doubles — each test sets the world it needs. */
const world = {
  uid: OWNER,
  /** projects the signed-in user owns, by id */
  projects: new Map(),
  /** saved channel state per project id */
  saved: new Map(),
  /** when set, getOrganicChannels throws it (the degraded path) */
  readThrows: null,
  /** every saveOrganicChannels call, in order */
  writes: [],
  /** every clearOrganicChannels call, in order */
  clears: [],
};

const project = (id) => ({
  id,
  name: "Mionelo",
  type: "eshop",
  accentColor: "#0891b2",
  createdAt: NOW,
  updatedAt: NOW,
});

mock.module("@/lib/session", { namedExports: { currentUserId: async () => world.uid } });
mock.module("@/lib/projects/store", {
  namedExports: {
    getProject: async (uid, id) => (uid === OWNER ? world.projects.get(id) ?? null : null),
  },
});
mock.module("@/lib/organic-channels/store", {
  namedExports: {
    getOrganicChannels: async (id) => {
      if (world.readThrows) throw world.readThrows;
      return world.saved.get(id) ?? null;
    },
    saveOrganicChannels: async (id, state) => {
      world.writes.push({ id, state });
      world.saved.set(id, state);
    },
    clearOrganicChannels: async (id) => {
      world.clears.push(id);
      world.saved.delete(id);
    },
  },
});

const route = await import("@/app/api/projects/[id]/organic-channels/route");
const { resolveOrganicChannels } = await import("@/lib/organic-channels/resolve");

const params = (id) => ({ params: Promise.resolve({ id }) });
const post = (body) =>
  new Request("http://localhost/api/projects/p1/organic-channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const SAMPLE = [
  { id: "gbp", name: "Google Business Profile", category: "directory", fit: 90, effort: "low", rationale: "r", payoff: "p", firstActions: ["a", "b"] },
  { id: "reddit", name: "Reddit", category: "community", fit: 60, effort: "medium", rationale: "r", payoff: "p", firstActions: ["a", "b"] },
];

beforeEach(() => {
  world.uid = OWNER;
  world.projects = new Map([["p1", project("p1")]]);
  world.saved = new Map();
  world.readThrows = null;
  world.writes = [];
  world.clears = [];
});

// --- 1. the route: ownership ------------------------------------------------

test("POST by an anonymous caller is 401 and writes nothing", async () => {
  world.uid = null;
  const res = await route.POST(post({ tracks: {} }), params("p1"));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { ok: false, code: "unauthorized", error: "Nepřihlášeno." });
  assert.deepEqual(world.writes, [], "an unauthenticated POST must not reach the store");
});

test("POST against someone else's project is 404 and writes nothing", async () => {
  // The store is keyed by project id ALONE, so a write that got past the guard would
  // land on the OWNER's row. 404 (not 403) is deliberate: it does not confirm the id.
  world.projects = new Map(); // p1 is not this user's
  const res = await route.POST(post({ tracks: {} }), params("p1"));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, "not-found");
  assert.deepEqual(world.writes, []);
});

test("DELETE is ownership-checked on the same terms and clears nothing when it fails", async () => {
  world.uid = null;
  assert.equal((await route.DELETE(new Request("http://x"), params("p1"))).status, 401);
  world.uid = OWNER;
  world.projects = new Map();
  assert.equal((await route.DELETE(new Request("http://x"), params("p1"))).status, 404);
  assert.deepEqual(world.clears, []);
});

// --- 1b. the route: never trust the wire ------------------------------------

test("POST sanitizes the wire: unknown enums coerce, junk tracks drop, the blob is bounded", async () => {
  const res = await route.POST(
    post({
      tracks: {
        gbp: { stage: "live", mode: "twin", scope: "web" },
        bogus: { stage: "not-a-stage", mode: "not-a-mode" },
        "": { stage: "live" },
      },
      plan: [
        { id: "gbp", name: "GBP", category: "not-a-category", fit: 9999, effort: "extreme", rationale: "r", payoff: "p", firstActions: ["a"] },
      ],
      somethingElse: "ignored",
    }),
    params("p1")
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  const [write] = world.writes;
  assert.ok(write, "a valid owned POST reaches the store exactly once");
  assert.equal(write.id, "p1");
  assert.ok(!("somethingElse" in write.state), "an unknown wire field is not persisted");
  assert.ok(!("" in write.state.tracks), "a blank channel key is dropped");
  assert.equal(write.state.tracks.bogus, undefined, "a track with no usable field is dropped");
  assert.equal(write.state.tracks.gbp.stage, "live");
  const [channel] = write.state.plan;
  assert.ok(channel.fit <= 100 && channel.fit >= 0, "fit is clamped, not stored as 9999");
  assert.ok(
    ["directory", "marketplace", "community", "content", "social", "pr", "partnership"].includes(channel.category),
    "an unknown category is coerced to a known one"
  );
  assert.ok(["low", "medium", "high"].includes(channel.effort), "an unknown effort is coerced");
});

test("a stored plan is stamped `planSource: ai` — provenance is not taken from the wire", async () => {
  // The UI's sample/AI pill and the "generated at" disclosure both read planSource.
  // A client claiming `planSource` must not be able to relabel a plan.
  await route.POST(post({ tracks: {}, plan: SAMPLE, planSource: "sample" }), params("p1"));
  assert.equal(world.writes[0].state.planSource, "ai");
});

test("POST stamps updatedAt server-side, ignoring any the client sent", async () => {
  await route.POST(post({ tracks: { gbp: { stage: "live" } }, updatedAt: "1999-01-01T00:00:00.000Z" }), params("p1"));
  const { updatedAt } = world.writes[0].state;
  assert.notEqual(updatedAt, "1999-01-01T00:00:00.000Z");
  assert.ok(!Number.isNaN(Date.parse(updatedAt)), "updatedAt is a real timestamp");
});

test("a malformed body is not a crash — it saves an empty, valid state", async () => {
  // readJson catches the parse and hands back null; the sanitizer's contract is that
  // null coerces to a clean empty blob rather than throwing inside the route.
  const res = await route.POST(post("{not json"), params("p1"));
  assert.equal(res.status, 200);
  assert.deepEqual(world.writes[0].state.tracks, {});
});

test("DELETE by the owner clears that project's state and nothing else", async () => {
  world.saved.set("p1", { tracks: { gbp: { stage: "live" } }, updatedAt: NOW });
  const res = await route.DELETE(new Request("http://x"), params("p1"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.deepEqual(world.clears, ["p1"]);
  assert.deepEqual(world.writes, [], "reverting to the sample must not write a blob");
});

// --- 2. resolveOrganicChannels: the degraded path ---------------------------

test("nothing saved → the seeded sample, not degraded", async () => {
  const r = await resolveOrganicChannels("p1", SAMPLE);
  assert.deepEqual(r.channels, SAMPLE);
  assert.equal(r.source, "sample");
  assert.equal(r.degraded, false, "'never tracked' is not a failure");
  assert.deepEqual(r.tracks, {});
});

test("a FAILED store read → the sample as a stand-in, flagged degraded", async () => {
  world.readThrows = new Error("sqlite: no such table: organic_channels");
  const r = await resolveOrganicChannels("p1", SAMPLE);
  assert.equal(r.degraded, true, "the failure must survive to the UI, not read as 'empty'");
  assert.deepEqual(r.channels, SAMPLE, "the tenant still gets a usable page");
  assert.equal(r.source, "sample");
  assert.deepEqual(r.tracks, {}, "no track may be invented from a read that failed");
  assert.equal(r.updatedAt, undefined);
});

test("a successful read never claims degraded, pinned plan or not", async () => {
  world.saved.set("p1", { tracks: { gbp: { stage: "live" } }, updatedAt: NOW });
  assert.equal((await resolveOrganicChannels("p1", SAMPLE)).degraded, false);
  world.saved.set("p1", { tracks: {}, plan: SAMPLE, planSource: "ai", updatedAt: NOW });
  assert.equal((await resolveOrganicChannels("p1", SAMPLE)).degraded, false);
});

test("a pinned plan wins over the sample and carries its provenance + timestamp", async () => {
  const pinned = [{ ...SAMPLE[0], id: "product-hunt", name: "Product Hunt" }];
  world.saved.set("p1", { tracks: {}, plan: pinned, planSource: "ai", updatedAt: NOW });
  const r = await resolveOrganicChannels("p1", SAMPLE);
  assert.deepEqual(r.channels.map((c) => c.id), ["product-hunt"]);
  assert.equal(r.source, "ai");
  assert.equal(r.updatedAt, NOW);
});

test("saved tracks with an EMPTY plan still fall back to the sample, staying 'sample'", async () => {
  // A tenant who tracked channels but never pinned an AI plan. Reporting `ai` here
  // would put the "tailored plan" pill above the seeded sample.
  world.saved.set("p1", { tracks: { gbp: { stage: "planned" } }, plan: [], updatedAt: NOW });
  const r = await resolveOrganicChannels("p1", SAMPLE);
  assert.equal(r.source, "sample");
  assert.deepEqual(r.channels, SAMPLE);
  assert.equal(r.tracks.gbp.stage, "planned");
});

test("a legacy pre-lifecycle `statuses` blob is migrated on read", async () => {
  world.saved.set("p1", { statuses: { gbp: "active", reddit: "done" }, updatedAt: NOW });
  const r = await resolveOrganicChannels("p1", SAMPLE);
  assert.equal(r.tracks.gbp.stage, "live", "legacy 'active' maps onto the stage vocabulary");
  assert.equal(r.tracks.reddit.stage, "done");
  assert.equal(r.degraded, false);
});
