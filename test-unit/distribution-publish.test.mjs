/** The Distribuce publish seam (src/lib/distribution/publish.ts +
 *  src/lib/activity/publish.ts): every "content leaves the app" action in the
 *  module must map onto the SHARED asset-publish taxonomy, exactly once per user
 *  action. Before this seam existed the context that ships content recorded
 *  nothing at all, so these are its first tests. Runs the TS source directly via
 *  the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distributionPublishEvent,
  variantPublishKind,
  NEWSLETTER_CHANNEL,
} from "@/lib/distribution/publish";
import { REPURPOSE_CHANNELS } from "@/lib/distribution/generate";
import {
  isPublishAssetKind,
  isPublishVia,
  publishActivityDetail,
  publishActivityTitle,
} from "@/lib/activity/publish";

test("copy-text handler reports the variant's own kind as a clipboard publish", () => {
  assert.deepEqual(distributionPublishEvent("copyVariant", "LinkedIn"), {
    kind: "social_post",
    via: "copy",
  });
  assert.deepEqual(distributionPublishEvent("copyVariant", NEWSLETTER_CHANNEL), {
    kind: "newsletter",
    via: "copy",
  });
});

test("copy-link handler reports the same asset as the variant it belongs to", () => {
  for (const channel of REPURPOSE_CHANNELS) {
    const text = distributionPublishEvent("copyVariant", channel);
    const link = distributionPublishEvent("copyLink", channel);
    assert.deepEqual(link, text, `${channel}: link and text must report the same asset`);
  }
});

test("newsletter copy handler reports newsletter/copy", () => {
  assert.deepEqual(distributionPublishEvent("copyNewsletter", NEWSLETTER_CHANNEL), {
    kind: "newsletter",
    via: "copy",
  });
});

test("newsletter HTML download handler reports newsletter/export", () => {
  assert.deepEqual(distributionPublishEvent("downloadNewsletter", NEWSLETTER_CHANNEL), {
    kind: "newsletter",
    via: "export",
  });
});

test("social handoff reports NO client event — the route records it, so it is not double-counted", () => {
  for (const channel of REPURPOSE_CHANNELS) {
    assert.equal(distributionPublishEvent("scheduleToSocial", channel), null);
  }
});

test("every repurpose channel maps to a valid, route-accepted publish event", () => {
  for (const channel of REPURPOSE_CHANNELS) {
    const kind = variantPublishKind(channel);
    assert.ok(isPublishAssetKind(kind), `${channel} → ${kind} is not an accepted kind`);
    const event = distributionPublishEvent("copyVariant", channel);
    assert.ok(isPublishVia(event.via));
  }
  // Only the Newsletter channel is an email; everything else is a social post.
  const emails = REPURPOSE_CHANNELS.filter((c) => variantPublishKind(c) === "newsletter");
  assert.deepEqual(emails, [NEWSLETTER_CHANNEL]);
});

test("the channel via — used by POST /api/social/posts — is a real, labelled event", () => {
  assert.ok(isPublishVia("channel"));
  const title = publishActivityTitle("social_post", "channel");
  const detail = publishActivityDetail("social_post", "channel");
  // The feed row has to read as a sentence, not as an enum pair, and must not
  // claim the post was downloaded or copied.
  assert.match(title, /Příspěvek na sociální sítě/);
  assert.doesNotMatch(title, /staženo|zkopírováno/);
  assert.match(detail, /odeslán do napojeného kanálu/);
});

test("the newsletter kind is labelled in the feed (no enum leaking into the timeline)", () => {
  assert.ok(isPublishAssetKind("newsletter"));
  const title = publishActivityTitle("newsletter", "export");
  assert.equal(title, "Newsletter — staženo");
  assert.match(publishActivityDetail("newsletter", "export"), /stažen do souboru/);
});
