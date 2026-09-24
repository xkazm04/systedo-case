/** The Kanály playbook's measured-link door (src/lib/organic-channels/measured-link.ts).
 *
 *  Distribuce was the only client that could mint a `/go/{id}` link, and it is
 *  available to content projects only — so for eshop, app, leadgen and local tenants
 *  the outcome ledger's measured column had no way to be fed. The playbook now mints
 *  one for any plan channel through the EXISTING `POST /api/projects/{id}/go-links`
 *  and copies it; it never posts, publishes or sends. What this file pins is the
 *  pure half of that door:
 *
 *   • the destination defaults to the tenant's own site (project.domain), never
 *     to anything invented — no domain, no default, mint disabled;
 *   • a destination on the CHANNEL's own host is refused (a /go link to firmy.cz
 *     measures nothing about the tenant), and the route's http(s)-with-host floor
 *     is applied before the wire;
 *   • the body carries the plan channel's own name and a `kanaly-{id}` campaign;
 *   • the state: demo explains instead of 404ing a write, an existing (url, channel)
 *     link is reused without a POST, and the 200-link cap is honoured;
 *   • every seeded channel of every project type gets a placement hint;
 *   • a channel's link list goes through the one outcome join, so two channels
 *     never share a list.
 *  Pure — no store, no React, no I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const {
  defaultDestination,
  mintBody,
  linkState,
  placementHint,
  linksForChannel,
  channelMeasured,
  absoluteGoHref,
} = await import("@/lib/organic-channels/measured-link");
const { baseChannelPlan } = await import("@/lib/organic-channels/sample");
const { PROJECT_TYPES } = await import("@/lib/projects/types");
const { GO_LINK_CAP } = await import("@/lib/organic-channels/outcomes");

const local = baseChannelPlan("local", {}, "x");
const firmy = local.find((c) => c.id === "firmy-cz");
const gbp = local.find((c) => c.id === "google-business-profile");
const mapy = local.find((c) => c.id === "mapy-cz");

const link = (over) => ({
  id: "k3x9abcdef",
  href: "/go/k3x9abcdef",
  url: "https://mionelo.cz/",
  channel: "Firmy.cz (Seznam)",
  campaign: "kanaly-firmy-cz",
  createdAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

test("fixtures: the seeded channels the cases name exist with the expected shape", () => {
  assert.equal(firmy?.name, "Firmy.cz (Seznam)");
  assert.equal(firmy?.url, "https://www.firmy.cz");
  assert.equal(gbp?.name, "Google Business Profile");
  assert.equal(mapy?.name, "Mapy.cz a lokální katalogy");
});

test("defaultDestination: the tenant's own site root, or null when no domain is known", () => {
  assert.equal(defaultDestination({ domain: "mionelo.cz" }), "https://mionelo.cz/");
  assert.equal(defaultDestination({ domain: "https://www.mionelo.cz/eshop" }), "https://www.mionelo.cz/");
  assert.equal(defaultDestination({}), null);
  assert.equal(defaultDestination({ domain: "   " }), null);
  assert.equal(defaultDestination({ domain: "javascript:alert(1)" }), null, "never a non-http default");
});

test("mintBody: a destination on the channel's own host is refused", () => {
  assert.deepEqual(mintBody(firmy, "https://www.firmy.cz/registrace"), { error: "channel-own-host" });
  // the bare apex and a sub-host of the directory are the directory too
  assert.deepEqual(mintBody(firmy, "https://firmy.cz/"), { error: "channel-own-host" });
  assert.deepEqual(mintBody(firmy, "https://registrace.firmy.cz/x"), { error: "channel-own-host" });
  // a host that merely ENDS in the same letters is not the directory
  assert.ok(!("error" in mintBody(firmy, "https://mojefirmy.cz/")));
});

test("mintBody: the route's http(s)-with-host floor applies before the wire", () => {
  assert.deepEqual(mintBody(gbp, "javascript:alert(1)"), { error: "bad-url" });
  assert.deepEqual(mintBody(gbp, "mionelo.cz/x"), { error: "bad-url" });
  assert.deepEqual(mintBody(gbp, ""), { error: "bad-url" });
});

test("mintBody: the body carries the plan channel's own name and a kanaly-{id} campaign", () => {
  assert.deepEqual(mintBody(gbp, "https://mionelo.cz/"), {
    url: "https://mionelo.cz/",
    channel: "Google Business Profile",
    campaign: "kanaly-google-business-profile",
  });
  // whitespace is trimmed exactly as the route trims it, so reuse keys match
  assert.equal(mintBody(gbp, "  https://mionelo.cz/  ").url, "https://mionelo.cz/");
});

test("linkState: demo, at-cap, reuse and ready", () => {
  const dest = "https://mionelo.cz/";
  assert.equal(linkState({ demo: true, links: [], channel: firmy, dest }).kind, "demo");

  const others = Array.from({ length: GO_LINK_CAP }, (_, i) =>
    link({ id: `id${i}`, href: `/go/id${i}`, url: `https://mionelo.cz/p${i}`, channel: "Instagram" })
  );
  assert.equal(GO_LINK_CAP, 200);
  assert.equal(linkState({ demo: false, links: others, channel: firmy, dest }).kind, "at-cap");

  const existing = link();
  const reuse = linkState({ demo: false, links: [existing], channel: firmy, dest });
  assert.equal(reuse.kind, "reuse");
  assert.equal(reuse.href, "/go/k3x9abcdef", "the existing href is shown; no POST is needed");
  // reuse wins over the cap, exactly like the route's idempotency check
  assert.equal(linkState({ demo: false, links: [...others.slice(1), existing], channel: firmy, dest }).kind, "reuse");

  const ready = linkState({ demo: false, links: [], channel: firmy, dest });
  assert.equal(ready.kind, "ready");
  assert.deepEqual(ready.body, { url: dest, channel: "Firmy.cz (Seznam)", campaign: "kanaly-firmy-cz" });
});

test("linkState: an invalid or empty destination disables the mint with its reason", () => {
  assert.deepEqual(linkState({ demo: false, links: [], channel: firmy, dest: "" }), { kind: "invalid", error: "bad-url" });
  assert.deepEqual(
    linkState({ demo: false, links: [], channel: firmy, dest: "https://www.firmy.cz/registrace" }),
    { kind: "invalid", error: "channel-own-host" }
  );
});

test("placementHint: keyed on the channel kind", () => {
  const ch = (category) => ({ ...gbp, category });
  assert.equal(placementHint(ch("directory")), "listing-website-field");
  assert.equal(placementHint(ch("marketplace")), "listing-website-field");
  assert.equal(placementHint(ch("community")), "profile-bio");
  assert.equal(placementHint(ch("social")), "profile-bio");
  assert.equal(placementHint(ch("content")), "article-cta");
  assert.equal(placementHint(ch("newsletter")), "newsletter-cta");
  assert.equal(placementHint(ch("pr")), "pitch-signature");
  assert.equal(placementHint(ch("partnership")), "pitch-signature");
});

test("placementHint: every seeded channel of every project type gets a hint", () => {
  for (const type of PROJECT_TYPES) {
    for (const c of baseChannelPlan(type, {}, "x")) {
      assert.ok(placementHint(c), `${type}/${c.id} has no placement hint`);
    }
  }
});

test("linksForChannel: channels never share a link list", () => {
  const links = [
    link({ id: "a", channel: "Firmy.cz (Seznam)" }),
    link({ id: "b", channel: "Mapy.cz a lokální katalogy" }),
  ];
  assert.deepEqual(linksForChannel(links, firmy).map((l) => l.id), ["a"]);
  assert.deepEqual(linksForChannel(links, mapy).map((l) => l.id), ["b"]);
  // through the one outcome join, not exact label equality: a folded label joins
  assert.deepEqual(linksForChannel([link({ id: "c", channel: "Firmy.cz" })], firmy).map((l) => l.id), ["c"]);
  // and with the whole plan, a label two channels could claim joins neither
  const plan = [
    { id: "fb-skupiny", name: "Facebook skupiny" },
    { id: "fb-stranka", name: "Facebook stránka" },
  ];
  assert.deepEqual(linksForChannel([link({ channel: "Facebook" })], plan[0], plan), []);
});

test("channelMeasured: the live 30-day rollup for this channel, or null", () => {
  const outcomes = [
    { channel: "Firmy.cz (Seznam)", links: 1, clicks7d: 3, clicks30d: 14 },
    { channel: "Mapy.cz a lokální katalogy", links: 2, clicks7d: 0, clicks30d: 9 },
  ];
  assert.equal(channelMeasured(outcomes, firmy)?.clicks30d, 14);
  assert.equal(channelMeasured(outcomes, gbp), null);
  assert.equal(channelMeasured(undefined, firmy), null);
});

test("absoluteGoHref: a bare /go path is never what reaches the clipboard", () => {
  assert.equal(absoluteGoHref("/go/k3x9abcdef", "https://app.example.cz"), "https://app.example.cz/go/k3x9abcdef");
});
