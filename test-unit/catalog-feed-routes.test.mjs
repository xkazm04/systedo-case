/** WP W2-D — the two feed routes, driven end-to-end through the real handlers.
 *
 *  The PUBLIC one (`GET /api/feed/{token}`) is the interesting half: it is deliberately
 *  anonymous, so what has to be pinned is that the ONLY thing it trusts is the stored
 *  token row (ADR-0002), that an unknown or revoked token is a 404, and that an empty
 *  catalog is still a valid feed rather than the 404 that would de-list a merchant.
 *
 *  The token store, the catalog store, the project store, the ownership guard and the
 *  activity emitter are mocked (no auth, no Firestore, no sqlite); the serializer is the
 *  real one. Run with --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const UID = "u1";
const PID = "p1";
const OTHER_PID = "p2";
const TOKEN = "0123456789abcdef0123456789abcdef"; // gitleaks:allow — test fixture, not a credential

/** An in-memory stand-in for the token store, keyed exactly like the real one. */
const rows = new Map();
let minted = 0;
const ownerKey = (u, p) => `${u}::${p}`;

const ACTIVITY = [];
let catalog = [];
const project = {
  id: PID, name: "Mionelo", type: "eshop", accentColor: "#fff",
  domain: "mionelo.cz", createdAt: "x", updatedAt: "x",
};

mock.module("@/lib/catalog/feed-token-store", {
  namedExports: {
    isFeedTokenShape: (t) => typeof t === "string" && /^[0-9a-f]{32}$/.test(t),
    getFeedToken: async (t) => (/^[0-9a-f]{32}$/.test(t) ? (rows.get(t) ?? null) : null),
    getProjectFeedToken: async (u, p) =>
      [...rows.values()].find((r) => ownerKey(r.userId, r.projectId) === ownerKey(u, p)) ?? null,
    mintFeedToken: async (u, p) => {
      for (const [k, r] of rows) if (ownerKey(r.userId, r.projectId) === ownerKey(u, p)) rows.delete(k);
      const row = {
        token: String(++minted).padStart(32, "a"),
        userId: u,
        projectId: p,
        createdAt: "2026-08-29T10:00:00.000Z",
      };
      rows.set(row.token, row);
      return row;
    },
    revokeFeedToken: async (u, p) => {
      let n = 0;
      for (const [k, r] of rows) if (ownerKey(r.userId, r.projectId) === ownerKey(u, p)) { rows.delete(k); n++; }
      return n > 0;
    },
    clearFeedTokens: async () => {},
  },
});

mock.module("@/lib/catalog/store", {
  namedExports: {
    listOfferings: async () => catalog,
    saveOfferings: async () => {},
    deleteCatalog: async () => {},
  },
});

mock.module("@/lib/projects/store", {
  namedExports: { getProject: async (_u, p) => (p === PID ? project : null) },
});

mock.module("@/lib/projects/api-guard", {
  namedExports: {
    requireOwnedProject: async (id) =>
      id === PID
        ? { uid: UID, project }
        : { error: Response.json({ error: "Projekt nenalezen.", code: "not-found" }, { status: 404 }) },
  },
});

mock.module("@/lib/activity/emit", {
  namedExports: {
    emitProjectActivity: async (_u, _p, entry) => {
      ACTIVITY.push(entry);
    },
  },
});

const { GET: feedGet } = await import("@/app/api/feed/[token]/route.ts");
const {
  GET: tokenGet,
  POST: tokenPost,
  DELETE: tokenDelete,
} = await import("@/app/api/projects/[id]/feed-token/route.ts");

const PRODUCT = {
  kind: "product",
  id: "p1:SKU-1",
  projectId: PID,
  name: "Kešu ořechy, 500 g",
  category: "Ořechy",
  active: true,
  nature: "online",
  price: 249,
  currency: "CZK",
  channels: [],
  tags: [],
  source: "manual",
  updatedAt: "2026-08-01T00:00:00.000Z",
  sku: "SKU-1",
  stock: 40,
  dailyVelocity: 1,
};

const pullFeed = (token, format) =>
  feedGet(new Request(`http://t/api/feed/${token}${format ? `?format=${format}` : ""}`), {
    params: Promise.resolve({ token }),
  });

const idParams = (id) => ({ params: Promise.resolve({ id }) });

// ---------------------------------------------------------------------------
// The public feed route
// ---------------------------------------------------------------------------

test("GET /api/feed/{token}: 404 for an unknown token, and for a malformed one", async () => {
  assert.equal((await pullFeed(TOKEN)).status, 404, "unknown token");
  assert.equal((await pullFeed("not-a-token")).status, 404, "malformed token never reaches the store");
  assert.equal((await pullFeed(TOKEN)).headers.get("cache-control"), "no-store", "a 404 is never cached");
});

test("GET /api/feed/{token}: serves XML for a live token, from the ROW's owner pair", async () => {
  rows.clear();
  rows.set(TOKEN, { token: TOKEN, userId: UID, projectId: PID, createdAt: "2026-08-29T10:00:00.000Z" });
  catalog = [PRODUCT];

  const res = await pullFeed(TOKEN);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "public, max-age=0, s-maxage=1800");

  const body = await res.text();
  assert.match(body, /base\.google\.com\/ns\/1\.0/, "no ?format defaults to Google Merchant");
  assert.match(body, /<g:id>SKU-1<\/g:id>/);
  assert.match(body, /<link>https:\/\/mionelo\.cz<\/link>/, "a bare domain is normalised to an absolute URL");
});

test("GET /api/feed/{token}?format=…: all three formats, unknown falls back to google", async () => {
  assert.match(await (await pullFeed(TOKEN, "heureka")).text(), /<SHOPITEM>/);
  assert.match(await (await pullFeed(TOKEN, "zbozi")).text(), /<PRODUCT>/);
  assert.match(await (await pullFeed(TOKEN, "csv")).text(), /<rss version="2\.0"/);
});

test("GET /api/feed/{token}: an EMPTY catalog is a valid empty feed, not a 404", async () => {
  catalog = [];
  const res = await pullFeed(TOKEN);
  assert.equal(res.status, 200, "a robot must not see an error and de-list the shop");
  const body = await res.text();
  assert.match(body, /<\/rss>/);
  assert.equal(/<item>/.test(body), false);

  // null (the project never saved a catalog) is the same fact as an empty array.
  catalog = null;
  assert.equal((await pullFeed(TOKEN)).status, 200);
  catalog = [PRODUCT];
});

test("GET /api/feed/{token}: a token whose project is gone 404s", async () => {
  rows.set("ffffffffffffffffffffffffffffffff", {
    token: "ffffffffffffffffffffffffffffffff",
    userId: UID,
    projectId: OTHER_PID,
    createdAt: "2026-08-29T10:00:00.000Z",
  });
  assert.equal((await pullFeed("ffffffffffffffffffffffffffffffff")).status, 404);
  rows.delete("ffffffffffffffffffffffffffffffff");
});

// ---------------------------------------------------------------------------
// The authed management route
// ---------------------------------------------------------------------------

test("GET /feed-token: null before a mint, the row after", async () => {
  rows.clear();
  const before = await (await tokenGet(new Request("http://t"), idParams(PID))).json();
  assert.equal(before.ok, true);
  assert.equal(before.token, null);

  const posted = await (await tokenPost(new Request("http://t", { method: "POST" }), idParams(PID))).json();
  assert.equal(posted.replaced, false, "the first mint replaces nothing");
  assert.match(posted.token.token, /^[a-z0-9]{32}$/);

  const after = await (await tokenGet(new Request("http://t"), idParams(PID))).json();
  assert.equal(after.token.token, posted.token.token, "the capability URL is re-readable, unlike a signing secret");
});

test("POST /feed-token again re-mints, reports `replaced` and warns in the activity feed", async () => {
  ACTIVITY.length = 0;
  const first = await (await tokenGet(new Request("http://t"), idParams(PID))).json();
  const again = await (await tokenPost(new Request("http://t", { method: "POST" }), idParams(PID))).json();

  assert.equal(again.replaced, true);
  assert.notEqual(again.token.token, first.token.token);
  assert.equal(ACTIVITY.at(-1).module, "katalog");
  assert.equal(ACTIVITY.at(-1).severity, "warning", "breaking a live feed URL is not an `info` event");
});

test("DELETE /feed-token revokes once, then honestly reports nothing to revoke", async () => {
  ACTIVITY.length = 0;
  const first = await (await tokenDelete(new Request("http://t", { method: "DELETE" }), idParams(PID))).json();
  assert.deepEqual({ ok: first.ok, revoked: first.revoked, token: first.token }, { ok: true, revoked: true, token: null });
  assert.equal(ACTIVITY.length, 1);

  const second = await (await tokenDelete(new Request("http://t", { method: "DELETE" }), idParams(PID))).json();
  assert.equal(second.revoked, false);
  assert.equal(ACTIVITY.length, 1, "a no-op revoke writes no activity row");
});

test("every verb is behind requireOwnedProject — a foreign project id 404s", async () => {
  for (const [name, handler] of [["GET", tokenGet], ["POST", tokenPost], ["DELETE", tokenDelete]]) {
    const res = await handler(new Request("http://t", { method: name }), idParams(OTHER_PID));
    assert.equal(res.status, 404, `${name} is guarded`);
  }
  assert.equal(rows.size, 0, "a rejected call never reached the store");
});
