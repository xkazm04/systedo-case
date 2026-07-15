/** Direction 2 — the live-fetch retry classifier (src/lib/google/ads.ts
 *  classifyLiveError): the pure decision behind ONE bounded retry before a live
 *  sync degrades to sample data. 401 → refresh the token & retry; 429/5xx/network →
 *  short backoff & retry; 400/403/anything unrecognised → permanent, degrade now. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLiveError, AdsApiError } from "@/lib/google/ads";

test("401 is a token failure — retried once with a fresh token", () => {
  assert.equal(classifyLiveError({ status: 401 }), "token");
  assert.equal(classifyLiveError(new AdsApiError(401, "Google Ads searchStream 401: expired")), "token");
});

test("429 and 5xx are transient — retried once after a backoff", () => {
  assert.equal(classifyLiveError({ status: 429 }), "backoff");
  assert.equal(classifyLiveError(new AdsApiError(500, "boom")), "backoff");
  assert.equal(classifyLiveError(new AdsApiError(503, "unavailable")), "backoff");
});

test("network failures (no status) are transient too", () => {
  assert.equal(classifyLiveError(new TypeError("fetch failed")), "backoff");
  assert.equal(classifyLiveError(new Error("network timeout")), "backoff");
  assert.equal(classifyLiveError(new Error("ECONNRESET")), "backoff");
});

test("4xx client errors are permanent — degrade immediately, never retried", () => {
  assert.equal(classifyLiveError(new AdsApiError(400, "bad request")), "permanent");
  assert.equal(classifyLiveError(new AdsApiError(403, "forbidden")), "permanent");
  assert.equal(classifyLiveError({ status: 404 }), "permanent");
});

test("an unrecognised, status-less error degrades rather than retrying blindly", () => {
  assert.equal(classifyLiveError(new Error("malformed JSON")), "permanent");
  assert.equal(classifyLiveError("weird string"), "permanent");
  assert.equal(classifyLiveError(null), "permanent");
});
