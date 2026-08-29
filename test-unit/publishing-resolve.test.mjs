/** The publishing calendar RESOLVER: four schedulers, one week, no fifth store.
 *
 *  Two properties are worth a test and cannot be reached without making the stores
 *  lie on demand (hence --experimental-test-module-mocks):
 *
 *   1. THE UNION IS REAL. An item from each of the four sources — a social post, a
 *      content-plan slot, a sent twin draft, a handed-off distribution variant —
 *      shows up in one sorted list, on the right channel. That is the whole point
 *      of the feature; without it the "one calendar" claim is decoration.
 *   2. A BROKEN SOURCE IS NOT AN EMPTY ONE. If the twin store throws, the week must
 *      say `sources.twin === "error"`, not render a blank column an operator would
 *      read as "nothing planned" and post over. Every other source must survive it.
 *
 *  Plus the fail-open direction of the cap derivation: an unreadable kanály store
 *  enforces NOTHING rather than refusing posts the operator is entitled to make. */
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const UID = "u-owner";
const PID = "p-1";

const iso = (y, m, d, h = 9) => new Date(y, m - 1, d, h, 0, 0, 0).toISOString();
const MONDAY = iso(2026, 8, 24);

/** Mutable world — each test sets exactly the stores it cares about. */
const world = {
  posts: [],
  board: null,
  twin: null,
  variants: null,
  channels: null,
  throws: { posts: null, board: null, twin: null, variants: null, channels: null },
};

const boom = (which) => {
  if (world.throws[which]) throw world.throws[which];
};

mock.module("@/lib/campaigns/connector", {
  namedExports: { resolveTenant: async (uid, pid) => `u_${uid}_proj_${pid}` },
});
mock.module("@/lib/social/store", {
  namedExports: {
    listPosts: async () => {
      boom("posts");
      return world.posts;
    },
  },
});
mock.module("@/lib/project-state/store", {
  namedExports: {
    getProjectState: async () => {
      boom("board");
      return world.board;
    },
  },
});
mock.module("@/lib/twin/store", {
  namedExports: {
    getTwin: async () => {
      boom("twin");
      return world.twin;
    },
  },
});
mock.module("@/lib/distribution/variants-store", {
  namedExports: {
    getVariants: async () => {
      boom("variants");
      return world.variants;
    },
  },
});
mock.module("@/lib/organic-channels/store", {
  namedExports: {
    getOrganicChannels: async () => {
      boom("channels");
      return world.channels;
    },
  },
});

const { resolvePublishingCalendar, resolveCadenceRules } = await import("@/lib/publishing/resolve");

beforeEach(() => {
  world.posts = [];
  world.board = null;
  world.twin = null;
  world.variants = null;
  world.channels = null;
  world.throws = { posts: null, board: null, twin: null, variants: null, channels: null };
});

/** One item from every source, all in the same local week. */
function seedAllFour() {
  world.channels = {
    tracks: { "linkedin-organic": { stage: "live", mode: "twin", twinScope: "social", maxPerWeek: 3 } },
  };
  world.posts = [
    {
      id: "p1",
      platform: "instagram",
      content: "  Nová zimní směs   ořechů  ",
      status: "scheduled",
      scheduledAt: iso(2026, 8, 25),
      createdAt: MONDAY,
    },
    { id: "p2", platform: "facebook", content: "Koncept", status: "draft", createdAt: MONDAY },
  ];
  world.board = [
    { id: "s1", title: "Nabídka: Servis v Brně", service: "Servis", area: "Brno", status: "queued", day: 2, channelPlatform: "facebook", channelSendAt: iso(2026, 8, 26) },
    { id: "s2", title: "Nápad", service: "Servis", area: "Brno", status: "idea", day: null },
  ];
  world.twin = {
    drafts: [
      { id: "d1", channel: "social", contact: "Jana", inbound: "", reply: "Díky za dotaz!", questions: [], confidence: 90, risks: [], status: "sent", autoApproved: false, createdAt: MONDAY, sentAt: iso(2026, 8, 27) },
      { id: "d2", channel: "social", contact: "Petr", inbound: "", reply: "Neodeslané", questions: [], confidence: 90, risks: [], status: "approved", autoApproved: false, createdAt: MONDAY },
    ],
  };
  world.variants = {
    updatedAt: MONDAY,
    articles: [
      {
        articleKey: "abc123",
        title: "Jak vybrat ořechy",
        updatedAt: MONDAY,
        variants: [
          { channel: "LinkedIn", text: "…", status: "handed_off", updatedAt: iso(2026, 8, 28) },
          { channel: "Newsletter", text: "…", status: "edited", updatedAt: iso(2026, 8, 28) },
        ],
      },
    ],
  };
}

test("the calendar is the UNION of all four schedulers, sorted by instant", async () => {
  seedAllFour();
  const { items, sources } = await resolvePublishingCalendar(UID, PID);
  assert.deepEqual(
    items.map((i) => [i.source, i.channel, i.status]),
    [
      ["social", "instagram", "scheduled"],
      ["content-plan", "facebook", "scheduled"],
      ["twin", "linkedin", "sent"],
      ["distribution", "linkedin", "sent"],
    ]
  );
  assert.deepEqual(sources, {
    social: "ok",
    "content-plan": "ok",
    twin: "ok",
    distribution: "ok",
  });
  // Ids are source-qualified, so two stores minting the same row id cannot collide.
  assert.deepEqual(items.map((i) => i.id), [
    "social:p1",
    "content-plan:s1",
    "twin:d1",
    "distribution:abc123:LinkedIn",
  ]);
});

test("only what actually occupies a slot becomes an item", async () => {
  seedAllFour();
  const { items } = await resolvePublishingCalendar(UID, PID);
  // A social DRAFT has no date and no promise; an `idea` slot has no day; an
  // unsent twin draft has no instant at all; a merely `edited` variant never left.
  const ids = items.map((i) => i.id);
  assert.ok(!ids.includes("social:p2"));
  assert.ok(!ids.includes("content-plan:s2"));
  assert.ok(!ids.includes("twin:d2"));
  assert.ok(!ids.includes("distribution:abc123:Newsletter"));
});

test("titles are chip-sized and whitespace-collapsed, and every item deep-links home", async () => {
  seedAllFour();
  const { items } = await resolvePublishingCalendar(UID, PID);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId["social:p1"].title, "Nová zimní směs ořechů");
  assert.equal(byId["social:p1"].href, `/app/${PID}/socialni`);
  assert.equal(byId["content-plan:s1"].href, `/app/${PID}/obsah-plan`);
  assert.equal(byId["twin:d1"].href, `/app/${PID}/schranka`);
  assert.equal(byId["distribution:abc123:LinkedIn"].href, `/app/${PID}/distribuce`);
});

test("a twin draft borrows its channel from the track that says who speaks there", async () => {
  seedAllFour();
  const { items, rules } = await resolvePublishingCalendar(UID, PID);
  assert.equal(rules[0].twinScope, "social");
  assert.equal(items.find((i) => i.source === "twin").channel, "linkedin");

  // Drop the twin-mode track: nothing bridges TwinChannel → a channel any more,
  // so the draft is "other" — visible, but never consuming someone else's cap.
  world.channels = { tracks: { "linkedin-organic": { stage: "live", maxPerWeek: 3 } } };
  const again = await resolvePublishingCalendar(UID, PID);
  assert.equal(again.items.find((i) => i.source === "twin").channel, "other");
});

test("a broken source is reported as broken — never as an empty week", async () => {
  seedAllFour();
  world.throws.twin = new Error("firestore unavailable");
  const { items, sources } = await resolvePublishingCalendar(UID, PID);
  assert.equal(sources.twin, "error");
  // The other three survive it.
  assert.deepEqual(
    { s: sources.social, c: sources["content-plan"], d: sources.distribution },
    { s: "ok", c: "ok", d: "ok" }
  );
  assert.equal(items.length, 3);
  assert.equal(items.some((i) => i.source === "twin"), false);
});

test("'nothing stored' and 'could not read' are different words", async () => {
  const { sources } = await resolvePublishingCalendar(UID, PID);
  assert.deepEqual(sources, {
    social: "empty",
    "content-plan": "empty",
    twin: "empty",
    distribution: "empty",
  });
});

test("an unreadable kanály store enforces NO cap — the gate fails open", async () => {
  world.throws.channels = new Error("store down");
  assert.deepEqual(await resolveCadenceRules(PID), []);
  const { rules } = await resolvePublishingCalendar(UID, PID);
  assert.deepEqual(rules, []);
});

test("the caps come from the tracked channels, through the store's own sanitizer", async () => {
  world.channels = { tracks: { "instagram-organic": { stage: "live", maxPerWeek: 99 } } };
  const rules = await resolveCadenceRules(PID);
  // sanitizeChannelState clamps the wizard's 1–14 band on the way in.
  assert.deepEqual(rules, [{ channel: "instagram", maxPerWeek: 14, organicId: "instagram-organic" }]);
});

test("from/to narrows the window without re-reading anything", async () => {
  seedAllFour();
  const { items } = await resolvePublishingCalendar(UID, PID, {
    from: iso(2026, 8, 26, 0),
    to: iso(2026, 8, 27, 23),
  });
  assert.deepEqual(items.map((i) => i.source), ["content-plan", "twin"]);
});

test("a content-plan slot the channel rejected reads as failed, not as a plan", async () => {
  world.board = [
    { id: "s9", title: "Akce", service: "S", area: "A", status: "queued", day: 1, channelPlatform: "facebook", channelSendAt: MONDAY, channelFailed: true },
  ];
  const { items } = await resolvePublishingCalendar(UID, PID);
  assert.equal(items[0].status, "failed");
});
