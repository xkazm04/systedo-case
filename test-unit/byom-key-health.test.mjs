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
const { byomIncidentDetail, byomIncidentFor, redactKeyShaped, reportByomCallFailure } = await import(
  "@/lib/llm/keys/health"
);
const { BYOM_INCIDENT_DETAIL_CHARS, BYOM_INCIDENT_LIMIT, BYOM_INCIDENT_REASONS, publicByomConfig } =
  await import("@/lib/llm/keys/types");
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
  // The MESSAGE is app copy, not the raw throw — the raw text only survives as the
  // operator-only detail.
  assert.equal(inc.message, BYOM_INCIDENT_REASONS.cs.unknown);
  assert.equal(inc.detail, "boom");
  const inc2 = byomIncidentFor("brief", "weird");
  assert.equal(inc2.definitive, false);
  assert.equal(inc2.code, "unknown");
  assert.equal(inc2.detail, undefined);
});

// ── provider-controlled text must never be persisted or shipped ──────────────
//
// The adapters build transient messages as `Poskytovatel X selhal (HTTP 500).
// ${body.slice(0, 200)}` — 200 characters of RAW provider response body. An
// incident is scoped to the key's own owner, so this was never a cross-user leak,
// but unbounded third-party text has no business in a config document or in the
// settings panel, and a key echoed back in an error body must not be stored.

test("redactKeyShaped: key-shaped runs are removed, ordinary copy is untouched", () => {
  assert.equal(redactKeyShaped("sk-live-abcdefghijkl").includes("abcdefghijkl"), false);
  assert.equal(redactKeyShaped("AIzaSyD-9kLmNoPqRsTuVwXyZ0123").includes("AIzaSy"), false);
  assert.equal(redactKeyShaped("ghp_0123456789abcdef").includes("0123456789"), false);
  // A long opaque run of unknown shape (what an echoed credential looks like).
  const opaque = "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MA";
  assert.equal(redactKeyShaped(`token=${opaque}`).includes(opaque), false);

  // ...and it is a no-op on our own copy + on catalog model ids.
  for (const safe of [
    "Neplatný nebo chybějící API klíč (openai).",
    "The provider account is out of credit or over its limit.",
    "gemini-3.1-flash-lite",
    "deepseek/deepseek-v4-flash",
    "claude-haiku-4-5",
  ]) {
    assert.equal(redactKeyShaped(safe), safe, safe);
  }
});

test("byomIncidentDetail: collapsed, redacted and hard-capped", () => {
  assert.equal(byomIncidentDetail(undefined), undefined);
  assert.equal(byomIncidentDetail("   "), undefined);
  assert.equal(byomIncidentDetail("a\n  b\tc"), "a b c");
  const long = byomIncidentDetail("x".repeat(500));
  assert.ok(long.length <= BYOM_INCIDENT_DETAIL_CHARS, `detail was ${long.length} chars`);
  assert.ok(BYOM_INCIDENT_DETAIL_CHARS < 200, "must be far below the adapters' 200-char body slice");
});

test("a provider body that echoes a key never reaches the store or the wire", async () => {
  const uid = "byom-health-leak";
  await putByomKey(uid, "openrouter", KEY);

  // Exactly the shape adapters.ts builds: app prefix + raw provider body, here with
  // a credential echoed back in it (the realistic worst case).
  const leaked = "sk-live-openai-SECRET-tail-9Q7z";
  const err = new LlmCallError(
    "server",
    `Poskytovatel openrouter selhal (HTTP 401). {"error":{"message":"Incorrect API key provided: ${leaked}. Visit https://openrouter.ai/keys to check.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}`
  );

  const inc = byomIncidentFor("social", err);
  assert.equal(inc.message, BYOM_INCIDENT_REASONS.cs.server, "message must be app copy, not the body");
  assert.equal(JSON.stringify(inc).includes(leaked), false, "the incident must not carry the key");
  assert.equal(JSON.stringify(inc).includes("9Q7z"), false);

  await recordByomKeyFailure(uid, "openrouter", inc);
  const stored = JSON.stringify(await getByomConfig(uid));
  // The stored blob obviously contains the ENCRYPTED key; what must not appear is
  // the plaintext, via the incident.
  assert.equal(stored.includes(leaked), false, "plaintext key reached the config document");

  // And the wire view drops the operator-only detail wholesale.
  const pub = await getPublicByomConfig(uid);
  const shipped = pub.keys.find((k) => k.vendor === "openrouter").incidents[0];
  assert.equal("detail" in shipped, false, "detail must never cross the wire");
  assert.equal(JSON.stringify(pub).includes(leaked), false);
  // The user still gets a usable explanation — from the code, not the body.
  assert.equal(shipped.code, "server");
  assert.equal(shipped.definitive, false);
});

test("publicByomConfig strips `detail` from every incident, definitive or not", () => {
  const cfg = {
    keys: {
      openai: {
        keyEnc: "v1.aaa.bbb.ccc",
        addedAt: "2026-08-01T00:00:00.000Z",
        incidents: [
          { at: "2026-08-02T00:00:00.000Z", toolId: "ads", code: "auth", message: "x", definitive: true, detail: "leak-me" },
          { at: "2026-08-02T00:00:00.000Z", toolId: "social", code: "server", message: "y", definitive: false, detail: "leak-me-too" },
        ],
      },
    },
  };
  const pub = publicByomConfig(cfg);
  assert.equal(JSON.stringify(pub).includes("leak-me"), false);
  assert.equal(pub.keys[0].incidents.length, 2);
  assert.deepEqual(Object.keys(pub.keys[0].incidents[0]).sort(), [
    "at",
    "code",
    "definitive",
    "message",
    "toolId",
  ]);
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
