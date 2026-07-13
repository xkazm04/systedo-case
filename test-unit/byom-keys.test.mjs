/** Unit tests for per-user BYOM keys: key encryption at rest (round-trip, tamper
 *  detection, fail-safe when unconfigured), the sqlite config store round-trip,
 *  the vendor guard, and that publicByomConfig never leaks a key. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptByomKey, encryptByomKey, hasByomCrypto } from "@/lib/llm/keys/crypto";
import { isByomVendor, publicByomConfig } from "@/lib/llm/keys/types";
import { getByomConfig, saveByomConfig } from "@/lib/llm/keys/store.local.ts";

test("byom crypto: round-trips, and a tampered blob fails the auth tag", () => {
  process.env.BYOM_KEY_SECRET = "unit-test-byom-secret-please-ignore";
  assert.equal(hasByomCrypto(), true);

  const apiKey = "sk-live-openai-ABC123";
  const blob = encryptByomKey(apiKey);
  assert.notEqual(blob, apiKey);
  assert.match(blob, /^v1\./);
  assert.equal(decryptByomKey(blob), apiKey);

  const parts = blob.split(".");
  const wrongTag = Buffer.alloc(16, 7).toString("base64"); // 16-byte GCM tag, wrong
  assert.equal(decryptByomKey(`${parts[0]}.${parts[1]}.${wrongTag}.${parts[3]}`), null);
  assert.equal(decryptByomKey("not-a-valid-blob"), null);
});

test("byom crypto: fail-safe when no secret is configured", () => {
  const saved = {
    a: process.env.BYOM_KEY_SECRET,
    b: process.env.AUTH_SECRET,
    c: process.env.NEXTAUTH_SECRET,
  };
  delete process.env.BYOM_KEY_SECRET;
  delete process.env.AUTH_SECRET;
  delete process.env.NEXTAUTH_SECRET;
  try {
    assert.equal(hasByomCrypto(), false);
    assert.throws(() => encryptByomKey("x"));
    assert.equal(decryptByomKey("v1.a.b.c"), null);
  } finally {
    if (saved.a !== undefined) process.env.BYOM_KEY_SECRET = saved.a;
    if (saved.b !== undefined) process.env.AUTH_SECRET = saved.b;
    if (saved.c !== undefined) process.env.NEXTAUTH_SECRET = saved.c;
  }
});

test("isByomVendor guards the vendor set", () => {
  assert.equal(isByomVendor("openai"), true);
  assert.equal(isByomVendor("anthropic"), true);
  assert.equal(isByomVendor("gemini"), true);
  assert.equal(isByomVendor("claude"), false); // the API vendor is "anthropic"
  assert.equal(isByomVendor(123), false);
  assert.equal(isByomVendor(undefined), false);
});

test("publicByomConfig strips the key, keeps the metadata", () => {
  const pub = publicByomConfig({
    activeVendor: "openai",
    keys: {
      openai: {
        keyEnc: "v1.secret.blob.here",
        model: "gpt-x",
        addedAt: "2026-07-06T00:00:00.000Z",
        lastValidatedAt: "2026-07-06T01:00:00.000Z",
      },
    },
  });
  assert.equal(pub.activeVendor, "openai");
  assert.equal(pub.keys.length, 1);
  assert.equal(pub.keys[0].vendor, "openai");
  assert.equal(pub.keys[0].hasKey, true);
  assert.equal(pub.keys[0].model, "gpt-x");
  assert.equal(pub.keys[0].lastValidatedAt, "2026-07-06T01:00:00.000Z");
  assert.equal("keyEnc" in pub.keys[0], false); // the key never reaches the client
});

test("publicByomConfig drops an activeVendor with no stored key", () => {
  const pub = publicByomConfig({
    activeVendor: "gemini", // no gemini key stored
    keys: { openai: { keyEnc: "v1.x.y.z", addedAt: "2026-07-06T00:00:00.000Z" } },
  });
  assert.equal(pub.activeVendor, undefined);
  assert.equal(pub.keys.length, 1);
  assert.equal(pub.keys[0].vendor, "openai");
});

test("sqlite byom config store round-trips", async () => {
  const uid = "test-byom-user";
  await saveByomConfig(uid, {
    activeVendor: "openai",
    keys: {
      openai: { keyEnc: "v1.aaa.bbb.ccc", model: "gpt-x", addedAt: "2026-07-06T00:00:00.000Z" },
    },
  });
  const cfg = await getByomConfig(uid);
  assert.equal(cfg.activeVendor, "openai");
  assert.ok(cfg.keys.openai);
  assert.equal(cfg.keys.openai.keyEnc, "v1.aaa.bbb.ccc");
  assert.equal(cfg.keys.openai.model, "gpt-x");

  // re-save updates in place: add a second vendor + switch active
  await saveByomConfig(uid, {
    activeVendor: "anthropic",
    keys: {
      ...cfg.keys,
      anthropic: { keyEnc: "v1.ddd.eee.fff", addedAt: "2026-07-06T02:00:00.000Z" },
    },
  });
  const cfg2 = await getByomConfig(uid);
  assert.equal(cfg2.activeVendor, "anthropic");
  assert.equal(Object.keys(cfg2.keys).length, 2);
});
