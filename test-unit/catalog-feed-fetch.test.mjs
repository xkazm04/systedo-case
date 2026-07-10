/** Unit tests for the SSRF guards on the feed URL fetch (the security-critical part;
 *  the network transfer itself isn't exercised here). isPublicIp must reject every
 *  private/reserved range incl. cloud metadata + v4-mapped IPv6, and validateFeedUrl
 *  must reject bad schemes, credentials, and IP-literal hosts pointing inward. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FeedFetchError, isPublicIp, validateFeedUrl } from "@/lib/catalog/feed-fetch.ts";

test("isPublicIp blocks private / reserved / metadata addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1", // v4-mapped loopback (dotted)
    "::ffff:7f00:1", // v4-mapped loopback (hex form — must not slip past)
    "::ffff:a9fe:a9fe", // v4-mapped cloud metadata 169.254.169.254 (hex form)
    "not-an-ip",
  ]) {
    assert.equal(isPublicIp(ip), false, `${ip} must be blocked`);
  }
});

test("isPublicIp allows routable public addresses", () => {
  for (const ip of [
    "1.1.1.1",
    "8.8.8.8",
    "93.184.216.34",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8", // public v4-mapped (dotted) stays allowed
    "::ffff:808:808", // public v4-mapped (hex) resolves to 8.8.8.8
  ]) {
    assert.equal(isPublicIp(ip), true, `${ip} must be allowed`);
  }
});

test("validateFeedUrl rejects non-http(s), credentials, and inward IP literals", () => {
  const bad = [
    "ftp://example.com/feed.xml",
    "file:///etc/passwd",
    "gopher://example.com/",
    "http://user:pass@example.com/feed.xml",
    "http://127.0.0.1/feed.xml",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/feed.xml",
    "https://192.168.0.10/feed.xml",
    "not a url",
  ];
  for (const u of bad) {
    assert.throws(() => validateFeedUrl(u), FeedFetchError, `${u} must throw`);
  }
});

test("validateFeedUrl accepts a normal public https feed URL", () => {
  const url = validateFeedUrl("https://shop.example.com/heureka.xml?token=abc");
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "shop.example.com");
});
