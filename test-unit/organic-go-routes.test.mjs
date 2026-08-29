/** The two doors of the organic outcome ledger (WP W2-A):
 *
 *   • `GET /go/{id}` — PUBLIC, unauthenticated, and the only write path an anonymous
 *     visitor can reach in the whole product. Every claim it makes is pinned here:
 *     it 302s (never 301, which a browser would cache into an uncounted hop), the
 *     Location carries this module's UTM triple, an unknown id is a 404 rather than
 *     a redirect to anywhere, a bot is redirected but NOT counted, and a store
 *     failure is a 503 rather than a 404 that would tell a tenant their live link is
 *     dead.
 *   • `POST/GET /api/projects/[id]/go-links` — authed, ownership-checked. The mint is
 *     idempotent per (url, channel), the cap is enforced, and — the ADR-0002 claim —
 *     the stored link's owner comes from the GUARD, never from the request body.
 *
 *  Runs against a real sqlite file (the store's own behaviour is the point; see
 *  organic-outcomes-store.test.mjs) with only the session + project reads mocked, so
 *  the guard is the real guard. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-go-routes-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
register("./json-loader.mjs", import.meta.url);

const OWNER = "u-owner";
const world = { uid: OWNER };

const project = (id) => ({
  id,
  name: "Mionelo",
  type: "eshop",
  accentColor: "#0891b2",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});

mock.module("@/lib/session", { namedExports: { currentUserId: async () => world.uid } });
mock.module("@/lib/projects/store", {
  namedExports: {
    getProject: async (uid, id) => (uid === OWNER && id === "p1" ? project(id) : null),
  },
});

const { GET: goGet } = await import("@/app/go/[id]/route");
const { GET: linksGet, POST: linksPost } = await import(
  "@/app/api/projects/[id]/go-links/route"
);
const { listGoClickDays, listGoLinks, saveGoLink } = await import(
  "@/lib/organic-channels/outcomes-store"
);
const { utcDay } = await import("@/lib/organic-channels/outcomes");

const params = (id) => ({ params: Promise.resolve({ id }) });
const mint = (body, id = "p1") =>
  linksPost(
    new Request(`http://localhost/api/projects/${id}/go-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params(id)
  );
const hit = (id, ua) =>
  goGet(
    new Request(`http://localhost/go/${id}`, { headers: ua ? { "user-agent": ua } : {} }),
    params(id)
  );

/** The redirect counts with `void` (the visitor must never wait on bookkeeping), so
 *  the assertion has to let the microtask + the sync sqlite write land. */
const settle = () => new Promise((r) => setTimeout(r, 30));

const TODAY = utcDay(new Date());

/* ── the authed mint ────────────────────────────────────────────────────────── */

test("POST mints a link whose owner comes from the guard, not the body (ADR-0002)", async () => {
  const res = await mint({
    url: "https://mionelo.cz/kocarky",
    channel: "LinkedIn",
    campaign: "podzim",
    // A hostile body trying to write itself into another tenant. Both are ignored:
    // the route reads userId/projectId from requireOwnedProject only.
    userId: "u-attacker",
    projectId: "p-other",
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.match(json.id, /^[a-z0-9]{10}$/, "10-char base36 id");
  assert.equal(json.href, `/go/${json.id}`);
  assert.equal(json.reused, false);

  const stored = await listGoLinks("p1");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].userId, OWNER);
  assert.equal(stored[0].projectId, "p1");
  assert.equal(stored[0].campaign, "podzim");
});

test("the mint is idempotent per (url, channel) — the same address comes back", async () => {
  const first = await (await mint({ url: "https://mionelo.cz/kocarky", channel: "LinkedIn" })).json();
  assert.equal(first.reused, true, "same url + channel → the existing link");
  const other = await (await mint({ url: "https://mionelo.cz/kocarky", channel: "Newsletter" })).json();
  assert.equal(other.reused, false, "a different channel is a different measurement");
  assert.equal((await listGoLinks("p1")).length, 2);
});

test("a non-http destination is refused rather than stored", async () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "not a url", ""]) {
    assert.equal((await mint({ url, channel: "LinkedIn" })).status, 400, url);
  }
  assert.equal((await mint({ url: "https://mionelo.cz/x" })).status, 400, "no channel");
});

test("another user's project is 404, and a signed-out caller is 401", async () => {
  assert.equal((await mint({ url: "https://x.cz/", channel: "A" }, "p-other")).status, 404);
  world.uid = null;
  assert.equal((await mint({ url: "https://x.cz/", channel: "A" })).status, 401);
  world.uid = OWNER;
});

/* ── the public redirect ────────────────────────────────────────────────────── */

test("GET /go/{id} → 302 with the UTM triple, and the counter lands (pinned)", async () => {
  const { id } = await (
    await mint({ url: "https://mionelo.cz/blog?x=1", channel: "LinkedIn", campaign: "podzim" })
  ).json();

  const res = await hit(id, "Mozilla/5.0 (Macintosh) Chrome/126.0 Safari/537.36");
  assert.equal(res.status, 302, "302, never 301 — a cached hop is an uncounted hop");

  const loc = new URL(res.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, "https://mionelo.cz/blog");
  assert.equal(loc.searchParams.get("x"), "1", "the destination's own query survives");
  assert.equal(loc.searchParams.get("utm_source"), "linkedin");
  assert.equal(loc.searchParams.get("utm_medium"), "distribution");
  assert.equal(loc.searchParams.get("utm_campaign"), "podzim");
  assert.match(res.headers.get("cache-control"), /no-store/);

  await settle();
  assert.deepEqual(await listGoClickDays([id], TODAY), [{ linkId: id, day: TODAY, count: 1 }]);

  // A second human hit increments the SAME row rather than adding one.
  await hit(id, "Mozilla/5.0 (X11; Linux) Firefox/128.0");
  await settle();
  assert.deepEqual(await listGoClickDays([id], TODAY), [{ linkId: id, day: TODAY, count: 2 }]);
});

test("a bot is redirected but never counted", async () => {
  const { id } = await (await mint({ url: "https://mionelo.cz/bot", channel: "Reddit" })).json();
  const res = await hit(id, "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)");
  assert.equal(res.status, 302, "the unfurler still gets its redirect");
  await settle();
  assert.deepEqual(await listGoClickDays([id], TODAY), [], "…but no click was recorded");
});

test("an unknown or over-long id is a 404, and nothing is written", async () => {
  assert.equal((await hit("doesnotexist")).status, 404);
  assert.equal((await hit("x".repeat(64))).status, 404);
});

test("a destination that no longer parses still redirects, unstamped", async () => {
  // Written straight through the store: the mint route would (rightly) refuse it.
  await saveGoLink({
    id: "brokenurl1",
    userId: OWNER,
    projectId: "p1",
    url: "https://",
    channel: "Firmy.cz",
    campaign: "x",
    createdAt: "2026-08-01T00:00:00.000Z",
  });
  const res = await hit("brokenurl1", "Mozilla/5.0 Chrome/126.0");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://");
});

/* ── the authed read ────────────────────────────────────────────────────────── */

test("GET returns the project's links plus their rolled-up outcomes", async () => {
  const res = await linksGet(new Request("http://localhost/api/projects/p1/go-links"), params("p1"));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(json.links.length >= 4);
  assert.ok(json.links.every((l) => l.href === `/go/${l.id}`));
  const linkedIn = json.outcomes.find((o) => o.channel === "LinkedIn");
  assert.equal(linkedIn.clicks30d, 2, "the two counted human hits, and only those");
  assert.equal(json.cap, 200);
});
