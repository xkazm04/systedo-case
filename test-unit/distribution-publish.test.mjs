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
  socialPostActivityRow,
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
  const title = publishActivityTitle("social_post", "channel", "cs");
  const detail = publishActivityDetail("social_post", "channel", "cs");
  // The feed row has to read as a sentence, not as an enum pair, and must not
  // claim the post was downloaded or copied.
  assert.match(title, /Příspěvek na sociální sítě/);
  assert.doesNotMatch(title, /staženo|zkopírováno/);
  assert.match(detail, /odeslán do napojeného kanálu/);

  // Same row for an English writer: the taxonomy is identical, the prose is not.
  assert.match(publishActivityTitle("social_post", "channel", "en"), /Social post/);
  assert.match(publishActivityDetail("social_post", "channel", "en"), /sent to a connected channel/);
});

test("the newsletter kind is labelled in the feed (no enum leaking into the timeline)", () => {
  assert.ok(isPublishAssetKind("newsletter"));
  const title = publishActivityTitle("newsletter", "export", "cs");
  assert.equal(title, "Newsletter — staženo");
  assert.match(publishActivityDetail("newsletter", "export", "cs"), /stažen do souboru/);
  assert.equal(publishActivityTitle("newsletter", "export", "en"), "Newsletter — downloaded");
  assert.match(publishActivityDetail("newsletter", "export", "en"), /downloaded to a file/);
});

// --- social post lifecycle: WHEN the publish event fires ----------------------

test("a SCHEDULED post is not a publish event — nothing has left the app yet", () => {
  const row = socialPostActivityRow("scheduled", "cs");
  assert.equal(row.publish, false);
  assert.equal(row.title, "Příspěvek naplánován");
  assert.equal(socialPostActivityRow("scheduled", "en").title, "Post scheduled");
  // The scheduling row must not be mistakable for the publish row the rollup counts.
  assert.notEqual(row.title, publishActivityTitle("social_post", "channel", "cs"));
});

test("a PUBLISHED post is the publish event, titled from the shared taxonomy", () => {
  const row = socialPostActivityRow("published", "cs");
  assert.equal(row.publish, true);
  assert.equal(row.title, publishActivityTitle("social_post", "channel", "cs"));
  // The `publish` verdict is locale-independent — only the title is copy.
  assert.equal(socialPostActivityRow("published", "en").publish, true);
});

test("a FAILED publish is not a publish event", () => {
  const row = socialPostActivityRow("failed", "cs");
  assert.equal(row.publish, false);
  assert.notEqual(row.title, publishActivityTitle("social_post", "channel", "cs"));
});

test("a scheduled post publishes exactly once — the promise never counts, the cron result does", () => {
  // The life of one post handed off from Distribuce: scheduled by the route, then
  // sent by the cron. Exactly one publish event, and it is the cron's.
  const rows = (outcomes) => outcomes.map((o) => socialPostActivityRow(o, "cs"));
  const succeeded = rows(["scheduled", "published"]);
  assert.equal(succeeded.filter((r) => r.publish).length, 1);

  // The same post whose cron attempt fails must leave NO publish event behind.
  const bounced = rows(["scheduled", "failed"]);
  assert.equal(bounced.filter((r) => r.publish).length, 0);

  // One cron sweep over a mixed batch counts one event per post that went out.
  const sweep = rows(["published", "failed", "published"]);
  assert.equal(sweep.filter((r) => r.publish).length, 2);
});
