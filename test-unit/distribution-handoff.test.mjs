/** `channelToPlatform` — the map that decides which Distribuce variants get a
 *  "Naplánovat na …" button at all. It had no test, and it is the kind of
 *  three-case switch that is load-bearing precisely because it looks trivial:
 *
 *   • Its default arm is what HIDES the schedule action for Newsletter and
 *     X / Twitter. If a channel ever fell through to a platform by accident, the
 *     card would offer to schedule a post the social centre cannot publish.
 *   • Its domain is exactly REPURPOSE_CHANNELS (the module header says so). This
 *     file pins that claim against the real generator constant, so adding a
 *     channel to `CHANNEL_LIMITS` without deciding its handoff is caught here
 *     rather than discovered as a missing button.
 *   • A "Facebook" case was deliberately REMOVED (no producer emits the variant).
 *     Pinned so it cannot be re-added as a tidy-up.
 *
 *  Also pins the join into the publishing calendar: every repurpose channel must
 *  resolve to a real ChannelKey, because a variant handed off on a capped channel
 *  has to consume that channel's week. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { channelToPlatform } = await import("@/lib/distribution/handoff");
const { REPURPOSE_CHANNELS, CHANNEL_LIMITS } = await import("@/lib/distribution/generate");
const { channelKeyFromRepurpose } = await import("@/lib/publishing/channel-key");
const { isSocialPlatform } = await import("@/lib/social/types");

test("the two publishable channels map to their platform", () => {
  assert.equal(channelToPlatform("LinkedIn"), "linkedin");
  assert.equal(channelToPlatform("Instagram"), "instagram");
});

test("a channel the social centre cannot publish maps to null — the button is hidden", () => {
  assert.equal(channelToPlatform("Newsletter"), null);
  assert.equal(channelToPlatform("X / Twitter"), null);
});

test("Facebook stays unmapped until a producer emits the variant", () => {
  assert.equal(channelToPlatform("Facebook"), null);
  assert.ok(!("Facebook" in CHANNEL_LIMITS), "no producer emits a Facebook variant");
});

test("nothing outside the domain is mapped by accident", () => {
  for (const junk of ["", "linkedin", "LINKEDIN", "Threads", "Bluesky"]) {
    assert.equal(channelToPlatform(junk), null, junk);
  }
});

test("the map's domain is exactly REPURPOSE_CHANNELS — every channel has a decision", () => {
  const decided = REPURPOSE_CHANNELS.map((c) => [c, channelToPlatform(c)]);
  assert.equal(decided.length, 4);
  for (const [channel, platform] of decided) {
    assert.ok(platform === null || isSocialPlatform(platform), `${channel} → ${platform}`);
  }
  // Exactly two of the four are publishable today; a new publishable channel must
  // change this number deliberately.
  assert.equal(decided.filter(([, p]) => p !== null).length, 2);
});

test("every repurpose channel joins the publishing calendar on a real channel", () => {
  // A handed-off variant consumes its channel's week; landing on "other" would
  // make a capped channel silently uncounted.
  for (const channel of REPURPOSE_CHANNELS) {
    assert.notEqual(channelKeyFromRepurpose(channel), "other", channel);
  }
});

test("the handoff and the calendar agree about which channel a variant is on", () => {
  for (const channel of REPURPOSE_CHANNELS) {
    const platform = channelToPlatform(channel);
    if (!platform) continue;
    assert.equal(channelKeyFromRepurpose(channel), platform, channel);
  }
});
