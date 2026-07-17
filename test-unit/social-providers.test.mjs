/** Direction 2 — social publishing provider seam. Runs the real Meta / LinkedIn
 *  adapters against a FIXTURE transport (no network) to pin the wire mapping; exercises
 *  the simulated-vs-real DECISION in publishPost across the connection matrix; and
 *  round-trips a per-account token through the account-crypto helpers (encrypt at rest →
 *  strip for the client → decrypt for publish), both the current v2 blob and a stripped
 *  public view. All offline. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { metaProvider, linkedinProvider, socialProvider } from "@/lib/social/providers";
import { publishPost, publishReply } from "@/lib/social/publish";
import { buildSocialAccount, stripToken, readAccountToken } from "@/lib/social/account";

const SECRET = "unit-test-social-secret-please-ignore";

/** A fixture SocialTransport: canned responses per host, recording each call so the
 *  bearer token + body mapping can be asserted. No network. */
function fixtureTransport(response) {
  const calls = [];
  return {
    calls,
    async post(url, init) {
      calls.push({ url, init });
      return response;
    },
  };
}

// ── adapter mapping ───────────────────────────────────────────────────────────

test("meta adapter maps { id, permalink_url } → { externalId, url }, bearer + message body", async () => {
  const t = fixtureTransport({ id: "12345_67890", permalink_url: "https://www.facebook.com/12345_67890" });
  const res = await metaProvider.publish({ token: "tok-abc", content: "Ahoj světe" }, t);
  assert.equal(res.externalId, "12345_67890");
  assert.equal(res.url, "https://www.facebook.com/12345_67890");
  // The transport received the token (for the bearer header) + the caption.
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].init.token, "tok-abc");
  assert.equal(t.calls[0].init.body.message, "Ahoj světe");
});

test("meta adapter synthesises a permalink when Graph omits permalink_url", async () => {
  const t = fixtureTransport({ id: "999" });
  const res = await metaProvider.publish({ token: "x", content: "c" }, t);
  assert.equal(res.url, "https://www.facebook.com/999");
});

test("linkedin adapter maps the post URN → a feed permalink, commentary body", async () => {
  const t = fixtureTransport({ id: "urn:li:share:6789" });
  const res = await linkedinProvider.publish({ token: "li-tok", content: "Novinka" }, t);
  assert.equal(res.externalId, "urn:li:share:6789");
  assert.equal(res.url, "https://www.linkedin.com/feed/update/urn:li:share:6789");
  assert.equal(t.calls[0].init.body.commentary, "Novinka");
});

test("socialProvider routing: meta owns FB+IG, linkedin owns LinkedIn, tiktok has none", () => {
  assert.equal(socialProvider("facebook"), metaProvider);
  assert.equal(socialProvider("instagram"), metaProvider);
  assert.equal(socialProvider("linkedin"), linkedinProvider);
  assert.equal(socialProvider("tiktok"), null);
});

// ── simulated-vs-real decision ──────────────────────────────────────────────────

test("publishPost: no provider for the platform → simulated (labelled preview URL)", async () => {
  const r = await publishPost("tiktok", "hi", "p1");
  assert.equal(r.simulated, true);
  assert.equal(r.ok, true);
  assert.equal(r.externalUrl, "https://demo.social/tiktok/p1");
});

test("publishPost: provider unconfigured (no env creds) → simulated even with a token", async () => {
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;
  const account = { platform: "facebook", handle: "X", connectedAt: "t", demo: false };
  const r = await publishPost("facebook", "hi", "p2", { account, token: "tok", transport: fixtureTransport({ id: "1" }) });
  assert.equal(r.simulated, true);
});

test("publishPost: configured + demo connection → simulated (a demo connection stays demo)", async () => {
  process.env.META_APP_ID = "app";
  process.env.META_APP_SECRET = "sec";
  const demo = { platform: "facebook", handle: "demo", connectedAt: "t", demo: true };
  const r = await publishPost("facebook", "hi", "p3", { account: demo, token: null });
  assert.equal(r.simulated, true);
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;
});

test("publishPost: configured + real account + token → routes through the adapter (real)", async () => {
  process.env.META_APP_ID = "app";
  process.env.META_APP_SECRET = "sec";
  const account = { platform: "facebook", handle: "Mionelo", connectedAt: "t", demo: false };
  const transport = fixtureTransport({ id: "555", permalink_url: "https://www.facebook.com/555" });
  const r = await publishPost("facebook", "Živý příspěvek", "p4", { account, token: "real-tok", transport });
  assert.equal(r.simulated, false);
  assert.equal(r.ok, true);
  assert.equal(r.externalUrl, "https://www.facebook.com/555");
  assert.equal(transport.calls[0].init.token, "real-tok");
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;
});

test("publishPost: a real adapter throw → failed + not simulated (never fake-published)", async () => {
  process.env.META_APP_ID = "app";
  process.env.META_APP_SECRET = "sec";
  const account = { platform: "facebook", handle: "Mionelo", connectedAt: "t", demo: false };
  const throwing = { async post() { throw new Error("upstream 401"); } };
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a);
  try {
    const r = await publishPost("facebook", "hi", "p5", { account, token: "tok", transport: throwing });
    assert.equal(r.ok, false);
    assert.equal(r.simulated, false);
    assert.ok(!r.externalUrl, "a failed real publish carries no URL");
    // raw error server-logged only
    assert.ok(logged.some((a) => JSON.stringify(a).includes("upstream 401")));
  } finally {
    console.error = orig;
  }
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;
});

// ── reply is never routed through publish ───────────────────────────────────────

test("publishReply: real Meta account + token but no reply adapter → simulated, NEVER published", async () => {
  process.env.META_APP_ID = "app";
  process.env.META_APP_SECRET = "sec";
  const account = { platform: "facebook", handle: "Mionelo", connectedAt: "t", demo: false };
  const transport = fixtureTransport({ id: "should-not-happen" });
  const r = await publishReply("facebook", "msg-1", "díky za dotaz", { account, token: "real-tok", transport });
  // No adapter implements reply → honest simulation, and crucially the publish
  // transport was NOT called (a reply must never become a standalone public post).
  assert.equal(r.simulated, true);
  assert.equal(r.ok, true);
  assert.ok(!r.externalUrl, "a simulated reply carries no real URL");
  assert.equal(transport.calls.length, 0, "the reply must not route through publish()");
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;
});

// ── token round-trip (encrypt at rest → strip → decrypt) ────────────────────────

test("token round-trip: real connect encrypts, strip hides it, read decrypts back", () => {
  process.env.CATALOG_TOKEN_SECRET = SECRET;
  const stored = buildSocialAccount("linkedin", { token: "oauth-XYZ", realConfigured: true, now: "t0" });
  assert.equal(stored.demo, false);
  assert.equal(stored.handle, "LinkedIn"); // real handle, not the demo one
  assert.ok(stored.tokenEnc, "a real connection stores an encrypted blob");
  assert.match(stored.tokenEnc, /^v2\./, "reuses token-crypto v2 (per-token salt)");
  assert.notEqual(stored.tokenEnc, "oauth-XYZ", "never at rest in plaintext");

  // The public view a client receives carries NO token bytes.
  const pub = stripToken(stored);
  assert.ok(!("tokenEnc" in pub));
  assert.equal(pub.platform, "linkedin");

  // The server can decrypt it back for publishing.
  assert.equal(readAccountToken(stored), "oauth-XYZ");
});

test("token round-trip: a demo connect stays demo — no token stored or readable", () => {
  process.env.CATALOG_TOKEN_SECRET = SECRET;
  // No token, or configured=false → demo; either way no blob.
  const noToken = buildSocialAccount("facebook", { realConfigured: true, now: "t0" });
  assert.equal(noToken.demo, true);
  assert.ok(!noToken.tokenEnc);
  assert.equal(readAccountToken(noToken), null);

  const notConfigured = buildSocialAccount("facebook", { token: "t", realConfigured: false, now: "t0" });
  assert.equal(notConfigured.demo, true);
  assert.ok(!notConfigured.tokenEnc);
  assert.match(notConfigured.handle, /demo/);
});
