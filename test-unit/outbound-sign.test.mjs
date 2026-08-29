/** WP W1-E — the pure half of the outbound event bus: the signature contract a
 *  receiver must be able to re-implement, the replay window, the retry backoff table,
 *  the event filter and the payload cap.
 *
 *  These are the rules an integrator reads once and codes against, so they are pinned
 *  here rather than only exercised through the emit path: a silent change to the
 *  signing input or the header format breaks every already-deployed receiver, and
 *  nothing else in the suite would notice. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const {
  OUTBOUND_EVENT_TYPES,
  DELIVERY_MAX_ATTEMPTS,
  MAX_ENDPOINTS,
  MAX_EVENT_ITEMS,
  MAX_PAYLOAD_BYTES,
  SIGNATURE_TOLERANCE_MS,
  backoffMs,
  capItems,
  endpointsFor,
  isOutboundEventType,
  publicDelivery,
  publicEndpoint,
  serializeEvent,
  signPayload,
  signatureHeader,
  signingInput,
  verifyOutboundSignature,
} = await import("@/lib/outbound/types");

// A FIXTURE value, not a credential — the signing round-trip needs some string.
const SECRET = "s3cr3t-signing-key"; // gitleaks:allow
const NOW = Date.parse("2026-08-29T12:00:00.000Z");
const TS = new Date(NOW).toISOString();

const endpoint = (over = {}) => ({
  id: "e1",
  url: "https://example.com/hook",
  events: "all",
  enabled: true,
  secretEnc: "v1.a.b.c.d",
  createdAt: TS,
  ...over,
});

/* ── signature contract ──────────────────────────────────────────────────────── */

test("signPayload is HMAC-SHA256 hex over `${ts}.${body}` — the documented input", () => {
  const raw = '{"hello":"world"}';
  assert.equal(signingInput(TS, raw), `${TS}.${raw}`);
  const expected = createHmac("sha256", SECRET).update(`${TS}.${raw}`).digest("hex");
  assert.equal(signPayload(SECRET, TS, raw), expected);
  assert.equal(signatureHeader(SECRET, TS, raw), `v1=${expected}`);
});

test("a signature produced by the sender verifies for the receiver", () => {
  const raw = '{"id":"abc","type":"ping"}';
  const header = signatureHeader(SECRET, TS, raw);
  assert.equal(verifyOutboundSignature(SECRET, TS, raw, header, NOW), true);
});

test("a tampered BODY fails verification", () => {
  const raw = '{"amount":100}';
  const header = signatureHeader(SECRET, TS, raw);
  assert.equal(verifyOutboundSignature(SECRET, TS, '{"amount":900}', header, NOW), false);
});

test("a tampered TIMESTAMP fails verification (the ts is inside the digest)", () => {
  const raw = '{"a":1}';
  const header = signatureHeader(SECRET, TS, raw);
  const other = new Date(NOW - 1000).toISOString();
  assert.equal(verifyOutboundSignature(SECRET, other, raw, header, NOW), false);
});

test("a different secret fails verification", () => {
  const raw = '{"a":1}';
  assert.equal(
    verifyOutboundSignature("other-secret", TS, raw, signatureHeader(SECRET, TS, raw), NOW),
    false
  );
});

test("a stale timestamp is refused even when the digest is valid (replay window)", () => {
  const old = new Date(NOW - SIGNATURE_TOLERANCE_MS - 1000).toISOString();
  const raw = '{"a":1}';
  const header = signatureHeader(SECRET, old, raw);
  assert.equal(verifyOutboundSignature(SECRET, old, raw, header, NOW), false);
  // …and one inside the window still passes, so the cut is the window, not the clock.
  const fresh = new Date(NOW - SIGNATURE_TOLERANCE_MS + 1000).toISOString();
  assert.equal(
    verifyOutboundSignature(SECRET, fresh, raw, signatureHeader(SECRET, fresh, raw), NOW),
    true
  );
});

test("a FUTURE timestamp beyond the window is refused too (symmetric skew)", () => {
  const ahead = new Date(NOW + SIGNATURE_TOLERANCE_MS + 1000).toISOString();
  const raw = '{"a":1}';
  assert.equal(
    verifyOutboundSignature(SECRET, ahead, raw, signatureHeader(SECRET, ahead, raw), NOW),
    false
  );
});

test("a malformed header / empty secret / unparseable ts returns false, never throws", () => {
  const raw = '{"a":1}';
  assert.equal(verifyOutboundSignature(SECRET, TS, raw, "garbage", NOW), false);
  assert.equal(verifyOutboundSignature(SECRET, TS, raw, "", NOW), false);
  assert.equal(verifyOutboundSignature("", TS, raw, signatureHeader(SECRET, TS, raw), NOW), false);
  assert.equal(verifyOutboundSignature(SECRET, "not-a-date", raw, "v1=deadbeef", NOW), false);
});

/* ── backoff table ───────────────────────────────────────────────────────────── */

test("backoffMs is the documented 1m / 5m / 30m / 2h / 12h table", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map(backoffMs),
    [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]
  );
});

test("backoffMs clamps out-of-range attempts instead of producing NaN or a busy-loop", () => {
  assert.equal(backoffMs(0), 60_000);
  assert.equal(backoffMs(-3), 60_000);
  assert.equal(backoffMs(99), 43_200_000);
  assert.equal(backoffMs(Number.NaN), 60_000);
  assert.ok(backoffMs(2.7) > 0);
});

test("the backoff table covers exactly DELIVERY_MAX_ATTEMPTS attempts", () => {
  assert.equal(DELIVERY_MAX_ATTEMPTS, 5);
  assert.notEqual(backoffMs(DELIVERY_MAX_ATTEMPTS - 1), backoffMs(1));
});

/* ── event filter ────────────────────────────────────────────────────────────── */

test('endpointsFor: "all" receives every registered type', () => {
  const cfg = { endpoints: [endpoint()] };
  for (const type of OUTBOUND_EVENT_TYPES) {
    assert.equal(endpointsFor(cfg, type).length, 1, type);
  }
});

test("endpointsFor: an explicit list receives only its own types", () => {
  const cfg = { endpoints: [endpoint({ events: ["alert.critical"] })] };
  assert.equal(endpointsFor(cfg, "alert.critical").length, 1);
  assert.equal(endpointsFor(cfg, "digest.weekly").length, 0);
});

test("endpointsFor: a DISABLED endpoint receives nothing, whatever its filter", () => {
  const cfg = { endpoints: [endpoint({ enabled: false })] };
  assert.equal(endpointsFor(cfg, "ping").length, 0);
});

test("endpointsFor: an EMPTY filter subscribes to nothing (never fails open)", () => {
  const cfg = { endpoints: [endpoint({ events: [] })] };
  for (const type of OUTBOUND_EVENT_TYPES) assert.equal(endpointsFor(cfg, type).length, 0);
});

test("isOutboundEventType rejects anything outside the closed union", () => {
  assert.equal(isOutboundEventType("ping"), true);
  assert.equal(isOutboundEventType("alert.made.up"), false);
  assert.equal(isOutboundEventType(7), false);
  assert.equal(isOutboundEventType(undefined), false);
});

/* ── client-safe projections ─────────────────────────────────────────────────── */

test("publicEndpoint never leaks the encrypted secret — only whether one exists", () => {
  const pub = publicEndpoint(endpoint({ secretEnc: "v1.super.secret.blob.here" }));
  assert.equal(pub.hasSecret, true);
  assert.equal("secretEnc" in pub, false);
  assert.equal(JSON.stringify(pub).includes("super"), false);
  assert.equal(publicEndpoint(endpoint({ secretEnc: "" })).hasSecret, false);
});

test("publicDelivery replaces the payload bytes with their size", () => {
  const pub = publicDelivery({
    id: "d1",
    userId: "u1",
    projectId: "p1",
    endpointId: "e1",
    eventId: "ev1",
    type: "ping",
    status: "ok",
    attempts: 1,
    nextAt: null,
    createdAt: TS,
    updatedAt: TS,
    payload: '{"secretish":"body"}',
  });
  assert.equal("payload" in pub, false);
  assert.equal(pub.payloadBytes, 20);
});

/* ── payload caps ────────────────────────────────────────────────────────────── */

const event = (over = {}) => ({
  id: "ev1",
  type: "alert.critical",
  at: TS,
  projectId: "p1",
  title: "t",
  body: "b",
  ...over,
});

test("capItems truncates an alert's items to MAX_EVENT_ITEMS and says so", () => {
  const items = Array.from({ length: MAX_EVENT_ITEMS + 5 }, (_, i) => ({ name: `c${i}` }));
  const capped = capItems(event({ data: { items } }));
  assert.equal(capped.data.items.length, MAX_EVENT_ITEMS);
  assert.equal(capped.data.truncated, true);
});

test("capItems leaves a short list (and a dataless event) untouched", () => {
  const short = event({ data: { items: [{ name: "one" }] } });
  assert.equal(capItems(short), short);
  const bare = event();
  assert.equal(capItems(bare), bare);
});

test("serializeEvent stays under the payload cap by dropping oversized data", () => {
  const huge = event({ data: { blob: "x".repeat(MAX_PAYLOAD_BYTES * 2) } });
  const raw = serializeEvent(huge);
  assert.ok(Buffer.byteLength(raw, "utf8") <= MAX_PAYLOAD_BYTES);
  const parsed = JSON.parse(raw);
  assert.deepEqual(parsed.data, { truncated: true });
  // The event itself survives — a receiver still learns something happened.
  assert.equal(parsed.id, "ev1");
  assert.equal(parsed.type, "alert.critical");
});

test("serializeEvent round-trips a normal event unchanged", () => {
  const ev = event({ href: "/app/p1", data: { items: [{ name: "c" }] } });
  assert.deepEqual(JSON.parse(serializeEvent(ev)), ev);
});

test("MAX_ENDPOINTS is the 3 the settings card and the route both enforce", () => {
  assert.equal(MAX_ENDPOINTS, 3);
});
