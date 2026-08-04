/** BYOM key IDENTITY: the encrypt-time fingerprint that lets a user tell which key
 *  is stored without re-pasting it, and the validation-AGE staleness rule that stops
 *  a months-old probe from rendering as a live "Verified".
 *
 *  The security contract under test is as important as the feature: the fingerprint
 *  is the ONLY key-derived value allowed to cross the wire, it is computed once at
 *  encrypt time (never by decrypting on read), and `publicByomConfig` still strips
 *  `keyEnc` so no key material of any kind reaches a client. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-byom-identity-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
process.env.BYOM_KEY_SECRET = "unit-test-byom-secret-please-ignore";
register("./json-loader.mjs", import.meta.url);

const { byomKeyFingerprint, BYOM_FINGERPRINT_CHARS } = await import("@/lib/llm/keys/crypto");
const { publicByomConfig, isByomValidationStale, BYOM_VALIDATION_STALE_DAYS } = await import(
  "@/lib/llm/keys/types"
);
const { getPublicByomConfig, putByomKey } = await import("@/lib/llm/keys/store");
const { getByomConfig } = await import("@/lib/llm/keys/store.local.ts");

const FULL_KEY = "sk-live-openai-SECRET-tail-9Q7z";

test("fingerprint is the last 4 characters, and nothing more", () => {
  assert.equal(BYOM_FINGERPRINT_CHARS, 4);
  assert.equal(byomKeyFingerprint(FULL_KEY), "9Q7z");
  assert.equal(byomKeyFingerprint(`  ${FULL_KEY}  `), "9Q7z"); // trimmed like the API does
  // A string too short to hint at safely gets NO fingerprint rather than a weak one.
  assert.equal(byomKeyFingerprint("sk-short"), undefined);
  assert.equal(byomKeyFingerprint(""), undefined);
});

test("putByomKey stores the fingerprint beside the ciphertext, at encrypt time", async () => {
  const uid = "byom-identity-user";
  await putByomKey(uid, "openai", FULL_KEY);

  const stored = await getByomConfig(uid);
  assert.equal(stored.keys.openai.keyLast4, "9Q7z");
  // The stored blob is ciphertext — the plaintext is not sitting in the row.
  assert.match(stored.keys.openai.keyEnc, /^v1\./);
  assert.equal(stored.keys.openai.keyEnc.includes(FULL_KEY), false);
});

test("a re-key replaces the fingerprint — it never describes the previous key", async () => {
  const uid = "byom-identity-rekey-user";
  await putByomKey(uid, "anthropic", "sk-ant-first-key-tail-AAAA");
  assert.equal((await getByomConfig(uid)).keys.anthropic.keyLast4, "AAAA");
  await putByomKey(uid, "anthropic", "sk-ant-second-key-tail-BBBB");
  assert.equal((await getByomConfig(uid)).keys.anthropic.keyLast4, "BBBB");
});

test("the public config carries the fingerprint and NOT a byte of the key", async () => {
  const uid = "byom-identity-user";
  const pub = await getPublicByomConfig(uid);
  const k = pub.keys.find((x) => x.vendor === "openai");
  assert.ok(k);
  assert.equal(k.keyLast4, "9Q7z");
  assert.equal("keyEnc" in k, false); // publicByomConfig still strips the blob

  // The whole serialized response — not just the one field — must be free of the key
  // and of its ciphertext. This is the assertion that must never be allowed to fail.
  const wire = JSON.stringify(pub);
  assert.equal(wire.includes(FULL_KEY), false);
  assert.equal(wire.includes("SECRET"), false);
  assert.equal(wire.includes("keyEnc"), false);
  assert.equal(wire.includes("v1."), false);
});

test("a key stored before fingerprinting degrades honestly — no keyLast4, no decrypt-on-read", () => {
  const pub = publicByomConfig({
    activeVendor: "openai",
    keys: {
      // A legacy row: ciphertext, no fingerprint.
      openai: { keyEnc: "v1.aaa.bbb.ccc", addedAt: "2026-07-06T00:00:00.000Z" },
    },
  });
  assert.equal(pub.keys.length, 1);
  assert.equal(pub.keys[0].hasKey, true);
  // Absent, not guessed and not backfilled by decrypting — the UI renders its
  // "key unidentified" state instead of inventing four characters.
  assert.equal(pub.keys[0].keyLast4, undefined);
  assert.equal("keyLast4" in pub.keys[0], false);
  assert.equal("keyEnc" in pub.keys[0], false);
});

test("validation staleness distinguishes an old verdict from a fresh one", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");
  const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000).toISOString();

  assert.equal(isByomValidationStale(daysAgo(0), now), false);
  assert.equal(isByomValidationStale(daysAgo(BYOM_VALIDATION_STALE_DAYS - 1), now), false);
  assert.equal(isByomValidationStale(daysAgo(47), now), true);
  // "Never validated" is its own state, not a stale one.
  assert.equal(isByomValidationStale(undefined, now), false);
  // An unparseable stamp proves nothing → treated as stale.
  assert.equal(isByomValidationStale("not-a-date", now), true);
});
