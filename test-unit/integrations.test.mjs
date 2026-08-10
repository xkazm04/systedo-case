/** Integration readiness compute (src/lib/integrations/compute.ts): HEALTH-derived
 *  status (not env existence), the summary rollup, and the BYOM health judgement
 *  shared with the settings UI. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestByomHealth,
  byomKeyHealth,
  computeIntegrationRows,
  statusSummary,
} from "@/lib/integrations/compute";

const NONE = {
  googleAdsToken: false, googleAdsCustomer: false, googleOAuth: false,
  gemini: false, resend: false, cron: false,
  firestore: false, localDb: false, devAuth: false,
  lighttrack: false, leonardo: false, adsLinked: false,
  byomKey: "none", warehouse: false, gbpImported: false,
  socialReal: false, socialDemo: false, socialCredentials: false,
  sklikUserToken: false, sklikEnvToken: false,
  micrositeEnabled: false, micrositeIllustrative: false,
};

const rowById = (rows, id) => rows.find((r) => r.id === id);
const row = (over, id) => rowById(computeIntegrationRows({ ...NONE, ...over }), id);

test("Google Ads: missing platform → missing; platform but unlinked → action + link; linked → connected", () => {
  assert.equal(row({}, "google-ads").status, "missing");
  const platform = { googleAdsToken: true, googleAdsCustomer: true, googleOAuth: true };
  const unlinked = row(platform, "google-ads");
  assert.equal(unlinked.status, "action");
  assert.equal(unlinked.detail, "ads-unlinked");
  assert.equal(unlinked.link, "home");
  assert.equal(row({ ...platform, adsLinked: true }, "google-ads").status, "connected");
});

test("AI/LLM: server key present → connected, else action (BYOM fallback)", () => {
  assert.equal(row({}, "ai-llm").status, "action");
  assert.equal(row({ gemini: true }, "ai-llm").status, "connected");
});

test("AI/LLM: only a HEALTHY own key connects — stale/incident/unvalidated stay action", () => {
  assert.equal(row({ byomKey: "ok" }, "ai-llm").status, "connected");
  for (const [health, detail] of [
    ["stale", "byom-stale"],
    ["incident", "byom-incident"],
    ["unvalidated", "byom-unvalidated"],
  ]) {
    const r = row({ byomKey: health }, "ai-llm");
    assert.equal(r.status, "action", `${health} must not read as connected`);
    assert.equal(r.detail, detail);
    assert.equal(r.link, "nastaveni");
  }
});

test("BYOM health mirrors the settings UI: incidents > never-validated > stale > ok", () => {
  assert.equal(byomKeyHealth({ present: false, stale: false }), "none");
  assert.equal(byomKeyHealth({ present: true, stale: false }), "unvalidated");
  assert.equal(byomKeyHealth({ present: true, lastValidatedAt: "x", lastError: "boom", stale: false }), "incident");
  assert.equal(byomKeyHealth({ present: true, lastValidatedAt: "x", incidents: 2, stale: false }), "incident");
  assert.equal(byomKeyHealth({ present: true, lastValidatedAt: "x", stale: true }), "stale");
  assert.equal(byomKeyHealth({ present: true, lastValidatedAt: "x", stale: false }), "ok");
});

test("bestByomHealth picks the healthiest key, and none for no keys", () => {
  assert.equal(bestByomHealth([]), "none");
  assert.equal(bestByomHealth(["incident", "stale"]), "stale");
  assert.equal(bestByomHealth(["incident", "ok", "unvalidated"]), "ok");
});

test("social: derived from LINKED accounts, never from the app-credential OR", () => {
  // The exact regression: env credentials present, zero linked accounts.
  const envOnly = row({ socialCredentials: true }, "social");
  assert.equal(envOnly.status, "action");
  assert.equal(envOnly.detail, "social-no-accounts");
  assert.equal(envOnly.link, "socialni");
  // Nothing at all.
  assert.equal(row({}, "social").status, "missing");
});

test("social: a demo connection is never the same green as a real one", () => {
  const demoLinkable = row({ socialDemo: true, socialCredentials: true }, "social");
  assert.equal(demoLinkable.status, "action");
  assert.equal(demoLinkable.detail, "social-demo-linkable");
  const demoOnly = row({ socialDemo: true }, "social");
  assert.equal(demoOnly.status, "manual");
  assert.equal(demoOnly.detail, "social-demo-only");
  assert.equal(row({ socialReal: true, socialCredentials: true }, "social").status, "connected");
});

test("warehouse probe: connected when present, optional when absent", () => {
  assert.equal(row({}, "warehouse").status, "optional");
  assert.equal(row({ warehouse: true }, "warehouse").status, "connected");
});

test("persistence: connected on firestore OR local db, else missing", () => {
  assert.equal(row({}, "persistence").status, "missing");
  assert.equal(row({ localDb: true }, "persistence").status, "connected");
  assert.equal(row({ firestore: true }, "persistence").status, "connected");
});

test("auth: oauth → connected; dev-auth only → action; neither → missing", () => {
  assert.equal(row({ googleOAuth: true }, "auth").status, "connected");
  assert.equal(row({ devAuth: true }, "auth").status, "action");
  assert.equal(row({}, "auth").status, "missing");
});

test("sklik: the user's OWN stored token wins; the env token is disclosed as such", () => {
  const none = row({}, "sklik");
  assert.equal(none.status, "manual");
  assert.equal(none.detail, "sklik-none");
  const env = row({ sklikEnvToken: true }, "sklik");
  assert.equal(env.status, "connected");
  assert.equal(env.detail, "sklik-env-token");
  const own = row({ sklikUserToken: true, sklikEnvToken: true }, "sklik");
  assert.equal(own.detail, "sklik-user-token");
});

test("gbp probe: action (import it) without an import, connected once imported", () => {
  const off = row({}, "gbp");
  assert.equal(off.status, "action");
  assert.equal(off.link, "mapa");
  assert.equal(row({ gbpImported: true }, "gbp").status, "connected");
});

test("microsite: a shipped surface now has a row — off/optional, sample/action, synced/connected", () => {
  assert.equal(row({}, "microsite").status, "optional");
  assert.equal(row({}, "microsite").detail, "microsite-off");
  const sample = row({ micrositeEnabled: true, micrositeIllustrative: true }, "microsite");
  assert.equal(sample.status, "action");
  assert.equal(sample.detail, "microsite-sample");
  assert.equal(sample.link, "branding");
  assert.equal(row({ micrositeEnabled: true }, "microsite").status, "connected");
});

test("static statuses: lighttrack optional when off", () => {
  assert.equal(row({}, "lighttrack").status, "optional");
});

test('no row can ever emit the retired "planned" vocabulary', () => {
  const combos = [
    {}, { gemini: true }, { byomKey: "ok" }, { byomKey: "stale" },
    { socialReal: true }, { socialDemo: true }, { socialCredentials: true },
    { sklikUserToken: true }, { micrositeEnabled: true },
    { micrositeEnabled: true, micrositeIllustrative: true },
    { gbpImported: true }, { warehouse: true }, { localDb: true }, { devAuth: true },
  ];
  for (const over of combos) {
    for (const r of computeIntegrationRows({ ...NONE, ...over })) {
      assert.notEqual(r.status, "planned");
    }
  }
});

test("rows are grouped by category order and summary tallies every visible row", () => {
  const rows = computeIntegrationRows(NONE);
  const order = ["ads", "ai", "content", "reviews", "reports", "infra"];
  let last = -1;
  for (const r of rows) {
    const idx = order.indexOf(r.category);
    assert.ok(idx >= last, "categories out of order");
    last = idx;
  }
  const s = statusSummary(rows);
  assert.equal(Object.values(s).reduce((a, b) => a + b, 0), rows.length);
  // The summary must have exactly the statuses the board can render — a key that no
  // row produces is dead vocabulary, which is what "planned" was.
  assert.deepEqual(Object.keys(s).sort(), ["action", "connected", "manual", "missing", "optional"]);
});
