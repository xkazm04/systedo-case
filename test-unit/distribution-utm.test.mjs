/** Unit tests for the Distribuce UTM stamping: links must carry the three
 *  campaign params, per-channel utm_source must match the variant channels, and
 *  any pre-existing query string must survive (joined with `&`, not clobbered).
 *  Runs the TS source directly via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withUtm,
  channelUtmSource,
  campaignSlug,
  variantLink,
  UTM_MEDIUM,
} from "@/lib/distribution/utm";

test("withUtm appends all three UTM params to a clean URL", () => {
  const out = withUtm("https://blog.example.cz/clanek", {
    source: "newsletter",
    medium: "distribution",
    campaign: "spanek-miminka",
  });
  const u = new URL(out);
  assert.equal(u.searchParams.get("utm_source"), "newsletter");
  assert.equal(u.searchParams.get("utm_medium"), "distribution");
  assert.equal(u.searchParams.get("utm_campaign"), "spanek-miminka");
});

test("withUtm preserves an existing query string and joins with &", () => {
  const out = withUtm("https://blog.example.cz/clanek?ref=patek&page=2", {
    source: "linkedin",
    medium: "distribution",
    campaign: "kampan",
  });
  assert.ok(out.includes("&"), "expected params joined with &");
  const u = new URL(out);
  // pre-existing params survive untouched
  assert.equal(u.searchParams.get("ref"), "patek");
  assert.equal(u.searchParams.get("page"), "2");
  // and the UTM params are added on top
  assert.equal(u.searchParams.get("utm_source"), "linkedin");
  assert.equal(u.searchParams.get("utm_campaign"), "kampan");
});

test("withUtm is idempotent — re-stamping overwrites, never duplicates", () => {
  const once = withUtm("https://x.cz/a", { source: "twitter", medium: "distribution", campaign: "c" });
  const twice = withUtm(once, { source: "instagram", medium: "distribution", campaign: "c" });
  const u = new URL(twice);
  // only one utm_source, with the latest value
  assert.equal(u.searchParams.getAll("utm_source").length, 1);
  assert.equal(u.searchParams.get("utm_source"), "instagram");
});

test("channelUtmSource maps every variant channel to its source slug", () => {
  assert.equal(channelUtmSource("Newsletter"), "newsletter");
  assert.equal(channelUtmSource("LinkedIn"), "linkedin");
  assert.equal(channelUtmSource("Instagram"), "instagram");
  assert.equal(channelUtmSource("X / Twitter"), "twitter");
  assert.equal(channelUtmSource("Facebook"), "facebook");
});

test("channelUtmSource falls back to a slug for unknown channels (never blank)", () => {
  assert.equal(channelUtmSource("Můj Kanál"), "muj-kanal");
  assert.equal(channelUtmSource(""), "distribution");
});

test("campaignSlug derives a diacritics-safe slug from the title", () => {
  assert.equal(
    campaignSlug({ title: "Spánek miminka: kompletní průvodce", url: "https://blog.example.cz/spanek" }),
    "spanek-miminka-kompletni-pruvodce"
  );
});

test("campaignSlug falls back to the URL path, then to a default", () => {
  assert.equal(campaignSlug({ title: "", url: "https://blog.example.cz/spanek-miminka" }), "spanek-miminka");
  assert.equal(campaignSlug({ title: "", url: "not-a-url" }), "clanek");
});

test("variantLink stamps the per-channel source plus the shared medium/campaign", () => {
  const out = variantLink("https://blog.example.cz/spanek", "LinkedIn", "spanek-miminka");
  const u = new URL(out);
  assert.equal(u.searchParams.get("utm_source"), "linkedin");
  assert.equal(u.searchParams.get("utm_medium"), UTM_MEDIUM);
  assert.equal(u.searchParams.get("utm_medium"), "distribution");
  assert.equal(u.searchParams.get("utm_campaign"), "spanek-miminka");
});
