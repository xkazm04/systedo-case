/** Direction 2 — key health learned from REAL generations, so the app tells you
 *  your key stopped working instead of waiting for you to press "test".
 *
 *  The whole feature hinges on ONE distinction, so that is what this file pins:
 *  a DEFINITIVE failure (a ByomUserError — revoked key, no permission, exhausted
 *  account, an unavailable model) marks the key and benches it for generation, while
 *  a TRANSIENT one (provider 5xx / throttle / timeout / transport / an unclassified
 *  throw) is recorded for the user to see and NOTHING ELSE. A single blip must never
 *  render as "your key is broken" — that is the sticky-failure bug markByomValidation
 *  guards, and this path fires far more often than a manual probe.
 *
 *  Also pinned: the write-back rides signals that already exist (no provider call in
 *  sight here), no-ops for the probe path (a key with no `owner`), keeps the incident
 *  ring capped, and never leaks key material through publicByomConfig. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-byom-health-test.db");
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

const { ByomUserError, LlmCallError } = await import("@/lib/llm/errors");
const { byomIncidentFor, reportByomCallFailure } = await import("@/lib/llm/keys/health");
const { BYOM_INCIDENT_LIMIT, BYOM_INCIDENT_REASONS, publicByomConfig } = await import(
  "@/lib/llm/keys/types"
);
const { getPublicByomConfig, putByomKey, recordByomKeyFailure, resolveByomForOperation } =
  await import("@/lib/llm/keys/store");
const { getByomConfig } = await import("@/lib/llm/keys/store.local.ts");

const KEY = "sk-live-openai-SECRET-tail-9Q7z";

/** Wait for the fire-and-forget write-back to land (it is deliberately not awaited
 *  by the generation path — see health.ts). */
const settle = () => new Promise((r) => setTimeout(r, 30));

// ── the pure classifier: definitive vs transient ────────────────────────────

test("byomIncidentFor: a ByomUserError is DEFINITIVE and keeps its code", () => {
  for (const code of ["auth", "permission", "quota", "model", "invalid"]) {
    const inc = byomIncidentFor("ads", new ByomUserError(code, "openai", `bad ${code}`, 401));
    assert.equal(inc.definitive, true, code);
    assert.equal(inc.code, code);
    assert.equal(inc.toolId, "ads");
    assert.equal(inc.message, `bad ${code}`);
    assert.ok(Number.isFinite(Date.parse(inc.at)));
  }
});

test("byomIncidentFor: a typed provider blip is TRANSIENT, never definitive", () => {
  for (const code of ["server", "rate_limited", "timeout", "network", "empty", "malformed_json"]) {
    const inc = byomIncidentFor("social", new LlmCallError(code, `blip ${code}`));
    assert.equal(inc.definitive, false, code);
    assert.equal(inc.code, code);
  }
});

test("byomIncidentFor: an unclassified throw is conservatively transient", () => {
  const inc = byomIncidentFor("brief", new Error("boom"));
  assert.equal(inc.definitive, false);
  assert.equal(inc.code, "unknown");
  assert.equal(inc.message, "boom");
  const inc2 = byomIncidentFor("brief", "weird");
  assert.equal(inc2.definitive, false);
  assert.equal(inc2.code, "unknown");
});

test("every incident code the classifier can emit has cs + en copy", () => {
  const codes = [
    "auth", "permission", "quota", "model", "invalid",
    "timeout", "empty", "malformed_json", "rate_limited", "server", "network",
    "safety_blocked", "aborted", "unknown",
  ];
  for (const code of codes) {
    assert.ok(BYOM_INCIDENT_REASONS.cs[code], `missing cs copy for ${code}`);
    assert.ok(BYOM_INCIDENT_REASONS.en[code], `missing en copy for ${code}`);
  }
});

// ── the store write-back ────────────────────────────────────────────────────

test("a DEFINITIVE failure during real use marks the key AND benches it", async () => {
  const uid = "byom-health-definitive";
  await putByomKey(uid, "openai", KEY);
  // Fresh key, no probe run: it resolves for generation.
  assert.ok(await resolveByomForOperation(uid, "ads"));

  await recordByomKeyFailure(uid, "openai", byomIncidentFor("ads", new ByomUserError("auth", "openai", "Klíč odvolán")));

  const stored = await getByomConfig(uid);
  assert.equal(stored.keys.openai.lastError, "Klíč odvolán");
  assert.ok(stored.keys.openai.lastErrorAt);
  assert.equal(stored.keys.openai.incidents.length, 1);
  assert.equal(stored.keys.openai.incidents[0].toolId, "ads");

  // The point of the whole direction: the NEXT generation stops routing through a
  // key we now know is broken, without anyone pressing "test".
  assert.equal(await resolveByomForOperation(uid, "ads"), null);

  // ...and the user sees it in settings.
  const pub = await getPublicByomConfig(uid);
  const k = pub.keys.find((x) => x.vendor === "openai");
  assert.equal(k.lastError, "Klíč odvolán");
  assert.equal(k.incidents[0].definitive, true);
});

test("a TRANSIENT failure is visible but NEVER sticky-disables a healthy key", async () => {
  const uid = "byom-health-transient";
  await putByomKey(uid, "gemini", KEY);

  for (const code of ["server", "timeout", "rate_limited"]) {
    await recordByomKeyFailure(uid, "gemini", byomIncidentFor("social", new LlmCallError(code, `blip ${code}`)));
  }

  const stored = await getByomConfig(uid);
  // Recorded so the user can see WHICH operations fell back and why...
  assert.equal(stored.keys.gemini.incidents.length, 3);
  assert.equal(stored.keys.gemini.incidents.every((i) => i.definitive === false), true);
  // ...but the key itself is untouched: no lastError, so nothing benches it.
  assert.equal(stored.keys.gemini.lastError, undefined);
  assert.equal(stored.keys.gemini.lastErrorAt, undefined);
  assert.ok(await resolveByomForOperation(uid, "social"), "a blip must not bench a healthy key");
});

test("incidents are newest-first and capped, so the config can't become a log", async () => {
  const uid = "byom-health-ring";
  await putByomKey(uid, "anthropic", KEY);
  for (let i = 0; i < BYOM_INCIDENT_LIMIT + 4; i++) {
    await recordByomKeyFailure(
      uid,
      "anthropic",
      byomIncidentFor(`op-${i}`, new LlmCallError("server", `blip ${i}`))
    );
  }
  const stored = await getByomConfig(uid);
  assert.equal(stored.keys.anthropic.incidents.length, BYOM_INCIDENT_LIMIT);
  assert.equal(stored.keys.anthropic.incidents[0].toolId, `op-${BYOM_INCIDENT_LIMIT + 3}`);
});

test("recordByomKeyFailure is a no-op for a vendor with no stored key", async () => {
  const uid = "byom-health-missing";
  await recordByomKeyFailure(uid, "openrouter", byomIncidentFor("ads", new Error("x")));
  const stored = await getByomConfig(uid);
  assert.equal(stored.keys.openrouter, undefined);
});

// ── the reporter seam ───────────────────────────────────────────────────────

test("reportByomCallFailure no-ops without an owner (the probe path is untouched)", async () => {
  const uid = "byom-health-probe";
  await putByomKey(uid, "openai", KEY);
  // The "test connection" flow resolves a bare key — no owner, so no write-back.
  reportByomCallFailure({ vendor: "openai", apiKey: KEY }, new ByomUserError("auth", "openai", "nope"));
  await settle();
  const stored = await getByomConfig(uid);
  assert.equal(stored.keys.openai.lastError, undefined);
  assert.equal(stored.keys.openai.incidents, undefined);
});

test("reportByomCallFailure writes back for an owned key — and never throws", async () => {
  const uid = "byom-health-owned";
  await putByomKey(uid, "openai", KEY);
  const owned = { vendor: "openai", apiKey: KEY, owner: { userId: uid, toolId: "brief" } };

  // Returns synchronously (the generation path must not wait on it) and swallows
  // anything that goes wrong inside.
  assert.equal(
    reportByomCallFailure(owned, new ByomUserError("quota", "openai", "Došel kredit")),
    undefined
  );
  assert.doesNotThrow(() => reportByomCallFailure(owned, undefined));
  await settle();

  const stored = await getByomConfig(uid);
  assert.equal(stored.keys.openai.lastError, "Došel kredit");
  assert.ok(stored.keys.openai.incidents.some((i) => i.toolId === "brief" && i.code === "quota"));
});

test("incidents carry no key material across the wire", async () => {
  const cfg = {
    keys: {
      openai: {
        keyEnc: "v1.aaa.bbb.ccc",
        keyLast4: "9Q7z",
        addedAt: "2026-08-01T00:00:00.000Z",
        incidents: [
          { at: "2026-08-02T00:00:00.000Z", toolId: "ads", code: "auth", message: "x", definitive: true },
        ],
      },
    },
  };
  const pub = publicByomConfig(cfg);
  const serialized = JSON.stringify(pub);
  assert.equal(serialized.includes("keyEnc"), false);
  assert.equal(serialized.includes("v1.aaa"), false);
  assert.equal(pub.keys[0].incidents.length, 1);
});
