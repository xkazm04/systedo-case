/** The ORGANIC OUTCOME LEDGER's pure half (WP W2-A, src/lib/organic-channels/outcomes.ts).
 *
 *  Everything the product will SAY about a free channel's real performance is
 *  computed here, so this is where the claims get pinned:
 *
 *   • the two rolling windows are inclusive of today and exclusive of everything
 *     older, so a click from 31 days ago cannot inflate a "30-day" headline;
 *   • many links roll into ONE channel row (the plan lists channels, not links);
 *   • a counter row for a link that no longer exists is IGNORED rather than
 *     attributed somewhere convenient;
 *   • `measuredBadge` returns null on zero — "not measured" is not "measured as
 *     zero", and the whole honesty posture of the feature rests on that distinction;
 *   • the bot predicate catches the link-unfurlers that would otherwise register as
 *     a channel's first click the moment a URL is pasted into a chat app.
 *
 *  Pure module: no store, no clock of its own (`now` is an argument), no I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const {
  rollupChannelOutcomes,
  measuredBadge,
  outcomeFor,
  measuredGrounding,
  isBotUserAgent,
  utcDay,
  windowStart,
  retentionCutoff,
  GO_LINK_CAP,
  GO_CLICK_RETENTION_DAYS,
} = await import("@/lib/organic-channels/outcomes");

/** A fixed instant so every window edge below is an exact, readable date. */
const NOW = new Date("2026-08-29T11:30:00.000Z");

const link = (id, channel) => ({
  id,
  userId: "u1",
  projectId: "p1",
  url: `https://example.cz/${id}`,
  channel,
  campaign: "kampan",
  createdAt: "2026-07-01T00:00:00.000Z",
});

const day = (linkId, d, count) => ({ linkId, day: d, count });

/* ── day math ───────────────────────────────────────────────────────────────── */

test("utcDay / windowStart / retentionCutoff pin the window edges", () => {
  assert.equal(utcDay(NOW), "2026-08-29");
  // 7 days INCLUSIVE of today → the oldest counted day is six days back.
  assert.equal(windowStart(NOW, 7), "2026-08-23");
  assert.equal(windowStart(NOW, 30), "2026-07-31");
  assert.equal(retentionCutoff(NOW), "2026-05-31");
  assert.equal(GO_CLICK_RETENTION_DAYS, 90);
  assert.equal(GO_LINK_CAP, 200);
});

/* ── the rollup ─────────────────────────────────────────────────────────────── */

test("rollupChannelOutcomes: three links, exact 7d/30d per channel (pinned)", () => {
  const links = [link("aaa", "LinkedIn"), link("bbb", "LinkedIn"), link("ccc", "Newsletter")];
  const rows = [
    day("aaa", "2026-08-29", 4), // today          → 7d + 30d
    day("aaa", "2026-08-23", 2), // 7d edge, inclusive
    day("bbb", "2026-08-22", 5), // just outside 7d → 30d only
    day("bbb", "2026-07-31", 1), // 30d edge, inclusive
    day("bbb", "2026-07-30", 99), // outside 30d → ignored entirely
    day("ccc", "2026-08-28", 3),
  ];

  const out = rollupChannelOutcomes(links, rows, NOW);
  assert.equal(out.length, 2, "one row per channel, not per link");

  // Ordered most-clicked first.
  assert.equal(out[0].channel, "LinkedIn");
  assert.equal(out[0].links, 2, "both LinkedIn links roll into the one row");
  assert.equal(out[0].clicks7d, 6, "4 today + 2 on the inclusive 7d edge");
  assert.equal(out[0].clicks30d, 12, "6 + 5 + 1; the 99 outside the window is dropped");
  assert.equal(out[0].lastClickAt, "2026-08-29");

  assert.equal(out[1].channel, "Newsletter");
  assert.deepEqual(
    { links: out[1].links, clicks7d: out[1].clicks7d, clicks30d: out[1].clicks30d },
    { links: 1, clicks7d: 3, clicks30d: 3 }
  );
});

test("a counter row for an unknown link is ignored, never attributed", () => {
  const out = rollupChannelOutcomes(
    [link("aaa", "LinkedIn")],
    [day("aaa", "2026-08-29", 2), day("ghost", "2026-08-29", 50)],
    NOW
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].clicks30d, 2);
});

test("a minted-but-unclicked channel still appears, with zeroes and no lastClickAt", () => {
  const out = rollupChannelOutcomes([link("aaa", "Reddit")], [], NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].links, 1);
  assert.equal(out[0].clicks30d, 0);
  assert.equal(out[0].lastClickAt, undefined);
});

test("ordering is deterministic: clicks desc, then channel name", () => {
  const links = [link("a", "Zboží.cz"), link("b", "Firmy.cz"), link("c", "Heureka")];
  const rows = [day("a", "2026-08-29", 5), day("b", "2026-08-29", 5), day("c", "2026-08-29", 9)];
  assert.deepEqual(
    rollupChannelOutcomes(links, rows, NOW).map((o) => o.channel),
    ["Heureka", "Firmy.cz", "Zboží.cz"]
  );
});

test("a negative or fractional stored count cannot corrupt the total", () => {
  const out = rollupChannelOutcomes(
    [link("aaa", "LinkedIn")],
    [day("aaa", "2026-08-29", -7), day("aaa", "2026-08-28", 2.9)],
    NOW
  );
  assert.equal(out[0].clicks30d, 2, "negatives floor at 0, fractions truncate");
});

/* ── the honesty rules ──────────────────────────────────────────────────────── */

test("measuredBadge is null with zero clicks — 'not measured' is not 'measured as zero'", () => {
  assert.equal(measuredBadge({ channel: "X", links: 3, clicks7d: 0, clicks30d: 0 }), null);
  assert.equal(measuredBadge(null), null);
  assert.equal(measuredBadge(undefined), null);
  const badge = measuredBadge({
    channel: "X",
    links: 3,
    clicks7d: 1,
    clicks30d: 4,
    lastClickAt: "2026-08-29",
  });
  assert.deepEqual(badge, { clicks30d: 4, clicks7d: 1, lastClickAt: "2026-08-29" });
});

test("outcomeFor joins case- and whitespace-insensitively", () => {
  const outcomes = [{ channel: "LinkedIn", links: 1, clicks7d: 1, clicks30d: 1 }];
  assert.ok(outcomeFor(outcomes, " linkedin "));
  assert.equal(outcomeFor(outcomes, "Reddit"), null);
  assert.equal(outcomeFor(undefined, "LinkedIn"), null);
});

test("measuredGrounding hands the model only channels with real clicks, capped", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    channel: `K${i}`,
    links: 1,
    clicks7d: 0,
    clicks30d: 20 - i,
  }));
  many.push({ channel: "Nikdy", links: 4, clicks7d: 0, clicks30d: 0 });
  const rows = measuredGrounding(many);
  assert.equal(rows.length, 12, "capped at MEASURED_GROUNDING_CAP");
  assert.ok(!rows.some((r) => r.channel === "Nikdy"), "a zero-click channel is never grounded");
  assert.deepEqual(rows[0], { channel: "K0", clicks30d: 20, links: 1 });
  assert.deepEqual(measuredGrounding(undefined), []);
});

/* ── the bot predicate ──────────────────────────────────────────────────────── */

test("link-unfurlers and crawlers are not clicks; a real browser is", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "TelegramBot (like TwitterBot)",
    "HeadlessChrome/120.0.0.0",
  ]) {
    assert.equal(isBotUserAgent(ua), true, ua);
  }
  assert.equal(
    isBotUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    false
  );
  assert.equal(isBotUserAgent(null), false, "a missing UA is counted — we do not require one");
  assert.equal(isBotUserAgent(""), false);
});
