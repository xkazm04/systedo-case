/** Pinning fixtures for the /api/ai mode descriptor table (src/app/api/ai/modes.ts).
 *
 *  These pin — for each of the 18 tool modes — the two things the table refactor
 *  MUST keep byte-identical to the pre-refactor hand-wired switch:
 *    (a) the exact `cacheValue` a mode hands to cachedRespond → hashAiInput (the
 *        response-cache key input, incl. the keyId projectId rewrites, the
 *        conditional patterns injection for ads, and the raw-client-value caching
 *        for onboarding-scan); and
 *    (b) which generator gets called, with which args (grounding threaded in).
 *
 *  The table injects every store/provider/network touch via ModeDeps, so we build
 *  it with recording fakes and assert the WIRING without Firestore — the grounding
 *  resolvers' live results are stubbed (their CALL wiring is what's pinned). Each
 *  expectation cites the original route.ts arm it transcribes. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// The table module transitively imports snapshot JSON (via the grounding resolvers'
// store deps). Accept a plain `import x from "*.json"` by injecting `type: json`,
// then load the module dynamically once the hook is live.
const JSON_HOOK =
  "data:text/javascript," +
  encodeURIComponent(`
    export async function load(url, context, next) {
      if (url.endsWith('.json')) {
        return next(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
      }
      return next(url, context);
    }
  `);

let createModeTable;
let dispatchMode;
before(async () => {
  register(JSON_HOOK, import.meta.url);
  ({ createModeTable, dispatchMode } = await import("@/app/api/ai/modes"));
});

const LOCALE = "cs";
const SIGNAL = new AbortController().signal;

// A sentinel dataset object — identity-compared so we can prove the generator
// receives the RESOLVED grounding, not a copy.
const DATA = Object.freeze({ __sentinel: "perf-data" });
const VOICE = Object.freeze({ __sentinel: "twin-voice" });

/** Build a fresh table + a recorder of every generator + persist call. */
function harness(overrides = {}) {
  const calls = [];
  const genRecorder = (name) => (...args) => {
    calls.push({ name, args });
    return Promise.resolve({ result: `R:${name}`, meta: {} });
  };
  const gen = Object.fromEntries(
    [
      "ads", "brief", "analysis", "monthlyRecap", "chat", "twinReply", "twinStyle",
      "repurpose", "localReviewReply", "articleDraft", "cohortDiagnosis",
      "keywordClusters", "comparisonOutline", "lpVariantIdeas", "leadSourceDiagnosis",
      "localDiagnosis", "channelResearch", "onboardingScan",
    ].map((n) => [n, genRecorder(n)])
  );
  const recapCalls = [];
  const deps = {
    gen,
    resolveGrounding: async (...a) => {
      calls.push({ name: "resolveGrounding", args: a });
      return { data: DATA, keyId: "KID", businessType: "BT", projectType: "eshop", groundingContext: "GC" };
    },
    resolveAdPatterns: async (...a) => {
      calls.push({ name: "resolveAdPatterns", args: a });
      return ["PATTERN"];
    },
    resolveBrandContext: async (...a) => {
      calls.push({ name: "resolveBrandContext", args: a });
      return "BRAND";
    },
    resolveTwinVoice: async (...a) => {
      calls.push({ name: "resolveTwinVoice", args: a });
      return VOICE;
    },
    resolveLeadGrounding: async (...a) => {
      calls.push({ name: "resolveLeadGrounding", args: a });
      return { text: "LEADTXT", keyId: "LKID" };
    },
    fetchSiteText: async (url) => {
      calls.push({ name: "fetchSiteText", args: [url] });
      return { title: "TITLE", description: "DESC", text: "x".repeat(60) };
    },
    onFetchError: (err) => Response.json({ error: String(err), code: "invalid" }, { status: 422 }),
    recap: {
      record: async (...a) => { recapCalls.push({ name: "record", args: a }); return {}; },
      build: (...a) => { recapCalls.push({ name: "build", args: a }); return { id: "STORED" }; },
      inputHash: () => "IH",
      uuid: () => "UUID",
    },
    ...overrides,
  };
  const table = createModeTable(deps);
  return { table, calls, recapCalls, deps };
}

const ctx = (over = {}) => ({
  body: {}, locale: LOCALE, userId: "u1", projectIdStr: "pid", signal: SIGNAL, ...over,
});

/** Run a mode's prepare directly (bypassing validate) with a pre-built valid value. */
async function prepare(table, mode, value, over = {}) {
  return table[mode].prepare(value, ctx(over));
}

// ── plain tools: cacheValue === value; one generator; args [value, locale, signal] ──
for (const [mode, genName] of [
  ["local-review-reply", "localReviewReply"],
  ["cohort-diagnosis", "cohortDiagnosis"],
  ["keyword-clusters", "keywordClusters"],
  ["comparison-outline", "comparisonOutline"],
  ["lead-source-diagnosis", "leadSourceDiagnosis"],
  ["local-diagnosis", "localDiagnosis"],
  ["channel-research", "channelResearch"],
]) {
  test(`${mode}: plain — cacheValue is the value, generator gets (value, locale, signal)`, async () => {
    const { table, calls } = harness();
    const value = { k: mode };
    const prepared = await prepare(table, mode, value);
    assert.equal(prepared.cacheValue, value, "cacheValue is the exact validated value (same ref)");
    const res = await prepared.gen();
    assert.deepEqual(res, { result: `R:${genName}`, meta: {} });
    assert.deepEqual(calls, [{ name: genName, args: [value, LOCALE, SIGNAL] }]);
  });
}

// ── ads: patterns injected into value ONLY when non-empty (route.ts:395-408) ──
test("ads: non-empty patterns are attached to value; cacheValue is that mutated value", async () => {
  const { table, calls } = harness();
  const value = { product: "P", benefits: "B", audience: "A" };
  const prepared = await prepare(table, "ads", value);
  assert.deepEqual(value.patterns, ["PATTERN"], "patterns attached");
  assert.equal(prepared.cacheValue, value, "cacheValue === mutated value");
  assert.deepEqual(calls[0], { name: "resolveAdPatterns", args: ["pid", "u1", value] });
  await prepared.gen();
  assert.deepEqual(calls[1], { name: "ads", args: [value, LOCALE, SIGNAL] });
});

test("ads: empty patterns leave the value shape untouched (byte-identical cache key)", async () => {
  const { table } = harness({ resolveAdPatterns: async () => [] });
  const value = { product: "P", benefits: "B", audience: "A" };
  const prepared = await prepare(table, "ads", value);
  assert.equal("patterns" in value, false, "no patterns key added");
  assert.equal(prepared.cacheValue, value);
});

// ── brand-grounded content tools: brand enters value (route.ts:409-417, 510-516) ──
for (const [mode, genName] of [["brief", "brief"], ["article-draft", "articleDraft"]]) {
  test(`${mode}: brand grounding enters value; cacheValue === value`, async () => {
    const { table, calls } = harness();
    const value = { projectId: "proj", topic: "T" };
    const prepared = await prepare(table, mode, value);
    assert.equal(value.brand, "BRAND");
    assert.equal(prepared.cacheValue, value);
    assert.deepEqual(calls[0], { name: "resolveBrandContext", args: ["proj", "u1", LOCALE] });
    await prepared.gen();
    assert.deepEqual(calls[1], { name: genName, args: [value, LOCALE, SIGNAL] });
  });
}

// ── twin tools: brand UPGRADES the client name, falls back to it (route.ts:474-492) ──
for (const [mode, genName] of [["twin-reply", "twinReply"], ["twin-style", "twinStyle"]]) {
  test(`${mode}: brand upgrades the client-sent name`, async () => {
    const { table } = harness();
    const value = { projectId: "proj", brand: "orig" };
    const prepared = await prepare(table, mode, value);
    assert.equal(value.brand, "BRAND");
    assert.equal(prepared.cacheValue, value);
  });
  test(`${mode}: empty brand grounding falls back to the client-sent name`, async () => {
    const { table } = harness({ resolveBrandContext: async () => "" });
    const value = { projectId: "proj", brand: "orig" };
    await prepare(table, mode, value);
    assert.equal(value.brand, "orig", "falls back to the client name");
    void genName;
  });
}

// ── repurpose: voice enters value; scope follows the channel (route.ts:493-505) ──
test("repurpose: social scope for non-newsletter channels; voice enters value", async () => {
  const { table, calls } = harness();
  const value = { projectId: "proj", channels: ["Instagram"] };
  const prepared = await prepare(table, "repurpose", value);
  assert.equal(value.voice, VOICE);
  assert.equal(prepared.cacheValue, value);
  assert.deepEqual(calls[0], { name: "resolveTwinVoice", args: ["proj", "u1", "social"] });
  await prepared.gen();
  assert.deepEqual(calls[1], { name: "repurpose", args: [value, LOCALE, SIGNAL] });
});

test("repurpose: email scope when a Newsletter channel is present", async () => {
  const { table, calls } = harness();
  const value = { projectId: "proj", channels: ["Newsletter", "Instagram"] };
  await prepare(table, "repurpose", value);
  assert.deepEqual(calls[0].args, ["proj", "u1", "email"]);
});

// ── analysis: grounds off projectIdStr; cacheValue rewrites projectId only when
//    data resolved; generator gets ORIGINAL value + data (route.ts:418-431) ──
test("analysis: with data — cacheValue rewrites projectId to keyId; gen gets value + data", async () => {
  const { table, calls } = harness();
  const value = { period: "30d" };
  const prepared = await prepare(table, "analysis", value);
  assert.deepEqual(prepared.cacheValue, { period: "30d", projectId: "KID" });
  assert.notEqual(prepared.cacheValue, value, "a new object, not the mutated value");
  assert.deepEqual(calls[0], { name: "resolveGrounding", args: ["pid", "u1", LOCALE] });
  await prepared.gen();
  const g = calls.find((c) => c.name === "analysis");
  assert.equal(g.args[0], value, "generator gets the ORIGINAL value");
  assert.equal(g.args[3], DATA, "generator gets the resolved dataset");
});

test("analysis: no data — cacheValue is the untouched value (base path)", async () => {
  const { table } = harness({ resolveGrounding: async () => ({ keyId: "base" }) });
  const value = { period: "30d" };
  const prepared = await prepare(table, "analysis", value);
  assert.equal(prepared.cacheValue, value, "value unchanged when no grounding");
});

// ── chat: grounds off value.projectId; cacheValue rewrites projectId (route.ts:463-473) ──
test("chat: cacheValue rewrites projectId to keyId; gen gets value + data", async () => {
  const { table, calls } = harness();
  const value = { projectId: "proj", period: "30d" };
  const prepared = await prepare(table, "chat", value);
  assert.deepEqual(prepared.cacheValue, { projectId: "KID", period: "30d" });
  assert.deepEqual(calls[0], { name: "resolveGrounding", args: ["proj", "u1", LOCALE] });
  await prepared.gen();
  const g = calls.find((c) => c.name === "chat");
  assert.equal(g.args[0], value);
  assert.equal(g.args[3], DATA);
});

// ── monthly-recap: grounding + framing + persist hook (route.ts:432-462) ──
test("monthly-recap: cacheValue rewrites projectId; gen gets value + data + framing + persists", async () => {
  const { table, calls, recapCalls } = harness();
  const value = { projectId: "realproj", period: "30d" };
  const prepared = await prepare(table, "monthly-recap", value);
  assert.deepEqual(prepared.cacheValue, { projectId: "KID", period: "30d" });
  assert.deepEqual(calls[0], { name: "resolveGrounding", args: ["realproj", "u1", LOCALE, "30d"] });
  await prepared.gen();
  const g = calls.find((c) => c.name === "monthlyRecap");
  assert.equal(g.args[0], value, "gen gets ORIGINAL value");
  assert.deepEqual(g.args.slice(3), [DATA, "BT", "GC", "eshop"], "gen gets data + framing");
  // persisted for a real, owned, non-demo project
  assert.deepEqual(recapCalls.map((c) => c.name), ["build", "record"]);
  assert.equal(recapCalls[1].args[0], "realproj", "recorded under the real project id");
});

test("monthly-recap: demo project id → NO persistence (public/shared)", async () => {
  const { table, recapCalls } = harness();
  const value = { projectId: "demo-eshop", period: "30d" };
  const prepared = await prepare(table, "monthly-recap", value);
  await prepared.gen();
  assert.equal(recapCalls.length, 0, "demo projects never persist a recap");
});

test("monthly-recap: a demo (meta.demo) generation → NO persistence", async () => {
  const { table, recapCalls } = harness({
    gen: { ...harness().deps.gen, monthlyRecap: async () => ({ result: {}, meta: { demo: true } }) },
  });
  const value = { projectId: "realproj", period: "30d" };
  const prepared = await prepare(table, "monthly-recap", value);
  await prepared.gen();
  assert.equal(recapCalls.length, 0, "a demo-degraded result isn't persisted");
});

// ── lp-variant-ideas: lead grounding; cacheValue rewrites projectId (route.ts:529-540) ──
test("lp-variant-ideas: cacheValue rewrites projectId to keyId; gen gets value + text", async () => {
  const { table, calls } = harness();
  const value = { projectId: "proj" };
  const prepared = await prepare(table, "lp-variant-ideas", value);
  assert.deepEqual(prepared.cacheValue, { projectId: "LKID" });
  assert.deepEqual(calls[0], { name: "resolveLeadGrounding", args: ["proj", "u1"] });
  await prepared.gen();
  const g = calls.find((c) => c.name === "lpVariantIdeas");
  assert.equal(g.args[0], value);
  assert.equal(g.args[3], "LEADTXT");
});

// ── onboarding-scan: auth guard + SSRF fetch; cacheValue is the RAW client value,
//    generator gets the FULL request with pageText (route.ts:553-588) ──
test("onboarding-scan: guard blocks anonymous callers with a 401", async () => {
  const { table } = harness();
  const r = table["onboarding-scan"].guard(ctx({ userId: null }));
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: "Pro sken webu se přihlaste.", code: "auth" });
});

test("onboarding-scan: guard passes for a signed-in caller", () => {
  const { table } = harness();
  assert.equal(table["onboarding-scan"].guard(ctx({ userId: "u1" })), null);
});

test("onboarding-scan: cacheValue is the raw client value; gen gets the fetched fulltext", async () => {
  const { table, calls } = harness();
  const value = { url: "https://ex.com", type: "eshop", brand: "B" };
  const prepared = await prepare(table, "onboarding-scan", value);
  assert.equal(prepared.cacheValue, value, "cache keyed by the client value, NOT the page text");
  assert.equal("pageText" in value, false, "raw value never gains pageText");
  const g = (await prepared.gen(), calls.find((c) => c.name === "onboardingScan"));
  assert.deepEqual(g.args[0], {
    url: "https://ex.com", type: "eshop", brand: "B",
    pageText: "x".repeat(60), siteTitle: "TITLE", siteDescription: "DESC",
  });
});

test("onboarding-scan: too-short page text → 422 short-circuit (no generation)", async () => {
  const { table, calls } = harness({
    fetchSiteText: async () => ({ title: "", description: "", text: "short" }),
  });
  const prepared = await prepare(table, "onboarding-scan", { url: "https://ex.com" });
  assert.ok(prepared instanceof Response);
  assert.equal(prepared.status, 422);
  assert.equal(calls.some((c) => c.name === "onboardingScan"), false);
});

test("onboarding-scan: a fetch failure becomes the onFetchError 422 response", async () => {
  const { table } = harness({
    fetchSiteText: async () => { throw new Error("boom"); },
  });
  const prepared = await prepare(table, "onboarding-scan", { url: "https://ex.com" });
  assert.ok(prepared instanceof Response);
  assert.equal(prepared.status, 422);
});

// ── the generic dispatch loop: unknown mode + validate-fail + guard wiring ──
test("dispatchMode: unknown mode → historical 400 'invalid'", async () => {
  const { table } = harness();
  const r = await dispatchMode(table, "no-such-mode", ctx(), async () => new Response("gen"));
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "Neznámý režim nástroje.", code: "invalid" });
});

test("dispatchMode: a validation failure → historical 422 'invalid'", async () => {
  const { table } = harness();
  // local-review-reply with a bogus body fails its real validator.
  const r = await dispatchMode(
    table, "local-review-reply", ctx({ body: { mode: "local-review-reply" } }), async () => new Response("gen")
  );
  assert.equal(r.status, 422);
  assert.equal((await r.json()).code, "invalid");
});

test("dispatchMode: onboarding-scan guard short-circuits before validate/cachedRespond", async () => {
  const { table } = harness();
  let cachedCalled = false;
  const r = await dispatchMode(
    table, "onboarding-scan", ctx({ userId: null }),
    async () => { cachedCalled = true; return new Response("gen"); }
  );
  assert.equal(r.status, 401);
  assert.equal(cachedCalled, false);
});
