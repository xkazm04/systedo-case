/** Unit tests for the robots.txt policy builder (src/app/robots.ts). Runs the
 *  TS source directly via the shared resolve hook
 *  (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { robotsPolicy } from "@/app/robots";

test("production: crawlable, hides /app + /api, advertises the sitemap", () => {
  const policy = robotsPolicy(true);
  assert.deepEqual(policy.rules, {
    userAgent: "*",
    allow: "/",
    disallow: ["/app", "/api"],
  });
  assert.ok(typeof policy.sitemap === "string", "sitemap must be advertised");
  assert.ok(policy.sitemap.endsWith("/sitemap.xml"), "sitemap points at /sitemap.xml");
  assert.ok(policy.sitemap.startsWith("https://"), "sitemap URL is absolute");
});

test("non-production (previews, local): everything crawl-blocked, no sitemap", () => {
  const policy = robotsPolicy(false);
  assert.deepEqual(policy.rules, { userAgent: "*", disallow: "/" });
  assert.equal(policy.sitemap, undefined, "previews must not advertise a sitemap");
});

test("preview policy blocks before fetching (single root disallow, no allow leak)", () => {
  const policy = robotsPolicy(false);
  assert.equal(policy.rules.allow, undefined);
  assert.equal(policy.rules.disallow, "/");
});
