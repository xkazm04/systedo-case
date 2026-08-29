/** WP W1-E — the SSRF guard and the transport contract of the outbound sender.
 *
 *  The security half is the point: a tenant supplies the URL and the server POSTs to
 *  it unattended for hours, so a loopback / RFC-1918 / cloud-metadata address must be
 *  refused BEFORE anything is written to a socket. That is asserted here by injecting
 *  a transport double and proving it is never called for a blocked address — a real
 *  local `http.createServer` cannot be used as a happy-path fixture precisely because
 *  the guard (correctly) refuses to reach 127.0.0.1.
 *
 *  The transport is dependency-injected, so the signing + status classification is
 *  exercised with no network at all. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { postGuarded, validateWebhookUrl, deliveryHeaders, OUTBOUND_TIMEOUT_MS } = await import(
  "@/lib/outbound/send"
);
const { verifyOutboundSignature } = await import("@/lib/outbound/types");
const { FeedFetchError } = await import("@/lib/catalog/feed-fetch");

const SECRET = "signing-secret";
const RAW = '{"id":"ev1","type":"ping"}';
const NOW = new Date("2026-08-29T12:00:00.000Z");

/** A transport double that records what it was handed and answers with `status`. */
function fakeTransport(status = 200) {
  const calls = [];
  const fn = async (url, body, headers) => {
    calls.push({ url, body, headers });
    return { status };
  };
  fn.calls = calls;
  return fn;
}

/* ── the guard ───────────────────────────────────────────────────────────────── */

const BLOCKED = [
  "http://127.0.0.1:8080/hook",
  "http://localhost:3000/hook", // resolves to loopback at CONNECT time
  "http://10.0.0.5/hook",
  "http://192.168.1.10/hook",
  "http://172.16.4.4/hook",
  "http://169.254.169.254/latest/meta-data/", // cloud metadata
  "http://[::1]/hook",
];

for (const url of BLOCKED.filter((u) => !u.includes("localhost"))) {
  test(`validateWebhookUrl refuses the IP literal ${url}`, () => {
    assert.throws(() => validateWebhookUrl(url, false), FeedFetchError);
  });
}

test("validateWebhookUrl refuses a non-http(s) scheme and credentials in the URL", () => {
  assert.throws(() => validateWebhookUrl("file:///etc/passwd", false), FeedFetchError);
  assert.throws(() => validateWebhookUrl("gopher://example.com/", false), FeedFetchError);
  assert.throws(() => validateWebhookUrl("https://user:pw@example.com/h", false), FeedFetchError);
  assert.throws(() => validateWebhookUrl("not a url", false), FeedFetchError);
});

test("validateWebhookUrl demands https when https is required (production)", () => {
  assert.throws(() => validateWebhookUrl("http://example.com/hook", true), FeedFetchError);
  assert.doesNotThrow(() => validateWebhookUrl("https://example.com/hook", true));
  // …and still allows plain http when it is not required (dev).
  assert.doesNotThrow(() => validateWebhookUrl("http://example.com/hook", false));
});

test("validateWebhookUrl accepts an ordinary public https URL", () => {
  const url = validateWebhookUrl("https://hooks.example.com/adamant?x=1", false);
  assert.equal(url.hostname, "hooks.example.com");
  assert.equal(url.search, "?x=1");
});

test("postGuarded refuses a loopback endpoint WITHOUT touching the transport", async () => {
  const transport = fakeTransport(200);
  const attempt = await postGuarded(
    "http://127.0.0.1:9999/hook",
    SECRET,
    RAW,
    { type: "ping" },
    "d1",
    { transport, now: NOW }
  );
  assert.equal(attempt.ok, false);
  assert.equal(attempt.code, undefined, "no HTTP status: nothing was ever sent");
  assert.equal(transport.calls.length, 0, "the guard runs BEFORE the transport");
});

test("postGuarded refuses cloud metadata without touching the transport", async () => {
  const transport = fakeTransport(200);
  const attempt = await postGuarded(
    "http://169.254.169.254/latest/meta-data/",
    SECRET,
    RAW,
    { type: "ping" },
    "d1",
    { transport, now: NOW }
  );
  assert.equal(attempt.ok, false);
  assert.equal(transport.calls.length, 0);
});

/* ── the signed request ──────────────────────────────────────────────────────── */

test("postGuarded signs the body so the receiver's verification passes", async () => {
  const transport = fakeTransport(200);
  const attempt = await postGuarded("https://example.com/hook", SECRET, RAW, { type: "ping" }, "d-42", {
    transport,
    now: NOW,
  });
  assert.equal(attempt.ok, true);
  assert.equal(attempt.code, 200);
  const { headers, body } = transport.calls[0];
  assert.equal(body, RAW);
  assert.equal(headers["x-adamant-event"], "ping");
  assert.equal(headers["x-adamant-delivery"], "d-42");
  assert.equal(headers["x-adamant-timestamp"], NOW.toISOString());
  assert.ok(headers["x-adamant-signature"].startsWith("v1="));
  assert.equal(
    verifyOutboundSignature(SECRET, headers["x-adamant-timestamp"], body, headers["x-adamant-signature"], NOW.getTime()),
    true
  );
});

test("deliveryHeaders is the four-header contract, lower-cased", () => {
  const h = deliveryHeaders(SECRET, NOW.toISOString(), RAW, { type: "digest.weekly" }, "d9");
  assert.deepEqual(Object.keys(h).sort(), [
    "x-adamant-delivery",
    "x-adamant-event",
    "x-adamant-signature",
    "x-adamant-timestamp",
  ]);
});

/* ── status classification ───────────────────────────────────────────────────── */

test("any 2xx is a success", async () => {
  for (const status of [200, 201, 202, 204, 299]) {
    const attempt = await postGuarded("https://example.com/h", SECRET, RAW, { type: "ping" }, "d", {
      transport: fakeTransport(status),
      now: NOW,
    });
    assert.equal(attempt.ok, true, `status ${status}`);
    assert.equal(attempt.code, status);
  }
});

test("a 3xx is a FAILURE — redirects are never followed for a webhook", async () => {
  for (const status of [301, 302, 307, 308]) {
    const attempt = await postGuarded("https://example.com/h", SECRET, RAW, { type: "ping" }, "d", {
      transport: fakeTransport(status),
      now: NOW,
    });
    assert.equal(attempt.ok, false, `status ${status}`);
    assert.equal(attempt.code, status);
    assert.match(attempt.error, /esměrování/);
  }
});

test("a 4xx / 5xx is a failure that carries its status code", async () => {
  for (const status of [400, 401, 404, 410, 500, 503]) {
    const attempt = await postGuarded("https://example.com/h", SECRET, RAW, { type: "ping" }, "d", {
      transport: fakeTransport(status),
      now: NOW,
    });
    assert.equal(attempt.ok, false);
    assert.equal(attempt.code, status);
  }
});

test("a transport that THROWS becomes a failure with no code — postGuarded never throws", async () => {
  const attempt = await postGuarded("https://example.com/h", SECRET, RAW, { type: "ping" }, "d", {
    transport: async () => {
      throw new Error("ECONNRESET while talking to the receiver");
    },
    now: NOW,
  });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.code, undefined);
  assert.match(attempt.error, /ECONNRESET/);
});

test("an error message is truncated, so a hostile endpoint cannot flood the log", async () => {
  const attempt = await postGuarded("https://example.com/h", SECRET, RAW, { type: "ping" }, "d", {
    transport: async () => {
      throw new Error("x".repeat(5000));
    },
    now: NOW,
  });
  assert.ok(attempt.error.length <= 200);
});

test("the send timeout is the 12 s ceiling the feed fetch uses", () => {
  assert.equal(OUTBOUND_TIMEOUT_MS, 12_000);
});

test("src/lib/outbound contains no bare fetch( — every request is guarded", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = "src/lib/outbound";
  const hits = readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => /(?<![.\w])fetch\s*\(/.test(readFileSync(`${dir}/${f}`, "utf8")));
  assert.deepEqual(hits, [], "fetch() cannot be given a guarded DNS lookup");
});

/* ── PUT-body validation (the route's shared, pure half) ─────────────────────── */

const { parseEndpointsInput } = await import("@/lib/outbound/config-input");

test("parseEndpointsInput accepts a well-formed list and defaults `events` to all", () => {
  const r = parseEndpointsInput({ endpoints: [{ url: "https://a.example/h" }] });
  assert.equal(r.ok, true);
  assert.equal(r.endpoints[0].events, "all");
  assert.equal(r.endpoints[0].enabled, true);
});

test("parseEndpointsInput refuses a missing list, an empty URL and a private URL", () => {
  assert.equal(parseEndpointsInput({}).ok, false);
  assert.equal(parseEndpointsInput({ endpoints: [{ url: "  " }] }).code, "bad-request");
  const priv = parseEndpointsInput({ endpoints: [{ url: "http://10.0.0.1/h" }] });
  assert.equal(priv.ok, false);
  assert.equal(priv.code, "unprocessable");
});

test("parseEndpointsInput enforces the 3-endpoint cap and refuses duplicate URLs", () => {
  const four = Array.from({ length: 4 }, (_, i) => ({ url: `https://a${i}.example/h` }));
  assert.equal(parseEndpointsInput({ endpoints: four }).ok, false);
  const dup = parseEndpointsInput({
    endpoints: [{ url: "https://a.example/h" }, { url: "https://A.example/h" }],
  });
  assert.equal(dup.ok, false);
  assert.match(dup.error, /dvakrát/);
});

test("parseEndpointsInput refuses an unknown event type and dedupes a valid list", () => {
  assert.equal(
    parseEndpointsInput({ endpoints: [{ url: "https://a.example/h", events: ["nope"] }] }).ok,
    false
  );
  const r = parseEndpointsInput({
    endpoints: [{ url: "https://a.example/h", events: ["ping", "ping"] }],
  });
  assert.deepEqual(r.endpoints[0].events, ["ping"]);
});
