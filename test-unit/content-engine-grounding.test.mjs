/** "Grounded means grounded" — Tvorba's header chips used to claim grounding the
 *  brief prompt never received. This suite pins the single derivation that now backs
 *  both sides:
 *
 *    (a) the PURE selectors in lib/content-engine/grounding, which the chips count
 *        and the mode row injects — so a chip can never over-claim; and
 *    (b) the /api/ai `brief` row itself (mode-table level, injected fakes — the
 *        conventions of ai-mode-table.test.mjs), including the byte-identical
 *        request shape the ungrounded / demo path must keep for its cache key.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Same JSON-import hook ai-mode-table.test.mjs installs: the table transitively
// imports snapshot JSON through the grounding resolvers' store deps.
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
let G;
before(async () => {
  register(JSON_HOOK, import.meta.url);
  ({ createModeTable } = await import("@/app/api/ai/modes"));
  G = await import("@/lib/content-engine/grounding");
});

const LOCALE = "cs";
const SIGNAL = new AbortController().signal;

// ── (a) the pure selectors ─────────────────────────────────────────────────────

const list = (id, keywords) => ({ id, name: id, seed: id, source: "sample", keywords });
const kw = (keyword, opportunity, tag = "core", avgMonthlySearches = 100) => ({
  keyword,
  intent: "informational",
  opportunity,
  avgMonthlySearches,
  competition: "low",
  tag,
});

test("groundableKeywords: drops negatives, de-dupes across lists, ranks by opportunity", () => {
  const out = G.groundableKeywords([
    list("a", [kw("boty", 40), kw("levné boty", 90, "negative"), kw("Boty", 70)]),
    list("b", [kw("kabelky", 80), kw("", 99)]),
  ]);
  assert.deepEqual(
    out.map((k) => k.keyword),
    ["kabelky", "Boty"],
    "negatives out (they are what the account wants OUT of its traffic); the richer duplicate wins"
  );
});

test("groundableKeywords: capped at what the brief prompt actually reads", () => {
  const many = Array.from({ length: 30 }, (_, i) => kw(`k${i}`, i));
  assert.equal(G.groundableKeywords([list("a", many)]).length, G.BRIEF_KEYWORD_LIMIT);
  assert.equal(G.BRIEF_KEYWORD_LIMIT, 12, "mirrors the slice(0, 12) in lib/ai/tools/brief.ts");
});

test("mergeBriefKeywords: seeded rows lead, saved rows fill, de-duped, capped", () => {
  const seeded = [{ keyword: "spánek miminka", volume: 4200, competition: "" }];
  const saved = [
    { keyword: "Spánek miminka", volume: 10, competition: "low" },
    { keyword: "kojení", volume: 3100, competition: "low" },
  ];
  const out = G.mergeBriefKeywords(seeded, saved);
  assert.deepEqual(out.map((k) => k.keyword), ["spánek miminka", "kojení"]);
  assert.equal(out[0].volume, 4200, "the seed's own datum wins over the saved duplicate");
  assert.equal(G.mergeBriefKeywords(undefined, saved).length, 2, "no seed → the saved rows alone");
});

test("groundablePatternCount: contradicted pins and (for a real tenant) sample lessons never count", () => {
  const p = (id, insight, extra = {}) => ({
    id,
    title: id,
    category: "structure",
    insight,
    evidence: "",
    source: "auto",
    createdAt: "",
    ...extra,
  });
  const library = {
    saved: [p("s1", "pin"), p("s2", "stale pin", { contradicted: true })],
    auto: [p("a1", "mined"), p("a2", `demo lekce ${G.SAMPLE_LESSON_MARKER}`)],
  };
  assert.equal(G.groundablePatternCount(library, false), 2, "real tenant: no sample lesson, no stale pin");
  assert.equal(G.groundablePatternCount(library, true), 3, "demo surface: the labelled lesson counts");
  const big = { auto: Array.from({ length: 20 }, (_, i) => p(`a${i}`, "x")) };
  assert.equal(G.groundablePatternCount(big, false), G.BRIEF_PATTERN_LIMIT, "capped at what is injected");
  assert.equal(G.BRIEF_PATTERN_LIMIT, 6, "mirrors the getPatternLines limit resolveAdPatterns passes");
});

test("composeBriefBrand: byte-identical without patterns; a labelled block with them", () => {
  assert.equal(G.composeBriefBrand("BRAND", []), "BRAND", "no patterns → the brand string, untouched");
  assert.equal(G.composeBriefBrand("", []), "", "the ungrounded path stays exactly \"\"");
  const out = G.composeBriefBrand("BRAND", ["lekce A", " ", "lekce B"]);
  assert.ok(out.startsWith("BRAND\n\n"), "brand context leads");
  assert.ok(out.includes("- lekce A") && out.includes("- lekce B"), "each line is its own bullet");
  assert.ok(!out.includes("-  "), "blank lines are dropped, not bulleted");
  assert.ok(G.composeBriefBrand("", ["lekce A"]).startsWith("Co se v tomto účtu"), "no brand → block alone");
});

test("briefPatternQuery: the brief's analogue of the ad brief the RAG resolver takes", () => {
  assert.deepEqual(G.briefPatternQuery({ topic: "T", primaryKeyword: "K", audience: "A" }), {
    product: "T",
    benefits: "K",
    audience: "A",
  });
});

// ── (b) the brief mode row ─────────────────────────────────────────────────────

function harness(overrides = {}) {
  const calls = [];
  const deps = {
    gen: {
      brief: (...args) => {
        calls.push({ name: "brief", args });
        return Promise.resolve({ result: "R:brief", meta: {} });
      },
    },
    resolveBrandContext: async (...a) => {
      calls.push({ name: "resolveBrandContext", args: a });
      return "BRAND";
    },
    resolveAdPatterns: async (...a) => {
      calls.push({ name: "resolveAdPatterns", args: a });
      return ["lekce A", "lekce B"];
    },
    resolveSavedKeywords: async (...a) => {
      calls.push({ name: "resolveSavedKeywords", args: a });
      return [{ keyword: "kojení", volume: 3100, competition: "low" }];
    },
    ...overrides,
  };
  return { table: createModeTable(deps), calls };
}

const ctx = (over = {}) => ({
  body: {}, locale: LOCALE, userId: "u1", projectIdStr: "pid", signal: SIGNAL, ...over,
});

const briefValue = () => ({ projectId: "proj", topic: "T", primaryKeyword: "K", audience: "A" });

test("brief: patterns + saved keywords + brand are ALL injected; cacheValue === value", async () => {
  const { table, calls } = harness();
  const value = briefValue();
  const prepared = await table.brief.prepare(value, ctx());

  // The pattern lines ride the brand grounding channel (USER prompt only — the
  // system prompt + schema, and so the gate golden, are untouched).
  assert.ok(value.brand.startsWith("BRAND\n\n"), "brand context still leads the block");
  assert.ok(value.brand.includes("- lekce A"), "the account's proven pattern lines are IN the prompt");
  assert.deepEqual(value.keywords, [{ keyword: "kojení", volume: 3100, competition: "low" }]);
  assert.equal(prepared.cacheValue, value, "cacheValue === the mutated value (grounding busts the cache)");

  // All three resolvers are tenancy-checked off the request's own projectId — the
  // same id the brand grounding has always used.
  const byName = (n) => calls.find((c) => c.name === n);
  assert.deepEqual(byName("resolveBrandContext").args, ["proj", "u1", LOCALE]);
  assert.deepEqual(byName("resolveSavedKeywords").args, ["proj", "u1"]);
  assert.deepEqual(byName("resolveAdPatterns").args, [
    "proj",
    "u1",
    { product: "T", benefits: "K", audience: "A" },
  ]);

  await prepared.gen();
  assert.deepEqual(calls.at(-1), { name: "brief", args: [value, LOCALE, SIGNAL] });
});

test("brief: no patterns + no saved keywords → byte-identical request shape (cache key holds)", async () => {
  const { table } = harness({
    resolveAdPatterns: async () => [],
    resolveSavedKeywords: async () => [],
    resolveBrandContext: async () => "",
  });
  const value = briefValue();
  await table.brief.prepare(value, ctx());
  assert.equal(value.brand, "", "brand stays exactly the ungrounded \"\"");
  assert.equal("keywords" in value, false, "no keywords key added — the demo path's shape is untouched");
});

test("brief: a seed's own keywords survive and lead the merged block", async () => {
  const { table } = harness();
  const value = { ...briefValue(), keywords: [{ keyword: "spánek miminka", volume: 4200, competition: "" }] };
  await table.brief.prepare(value, ctx());
  assert.deepEqual(
    value.keywords.map((k) => k.keyword),
    ["spánek miminka", "kojení"],
    "the clicked cluster's datum leads; the account's saved keywords fill in behind it"
  );
});

test("brief: an unowned / project-less call grounds in nothing (no cross-tenant leak by shape)", async () => {
  const seen = [];
  const { table } = harness({
    resolveBrandContext: async (...a) => { seen.push(a); return ""; },
    resolveAdPatterns: async (...a) => { seen.push(a); return []; },
    resolveSavedKeywords: async (...a) => { seen.push(a); return []; },
  });
  const value = { topic: "T", primaryKeyword: "K", audience: "A" };
  await table.brief.prepare(value, ctx({ userId: null }));
  assert.ok(seen.every(([pid, uid]) => pid === undefined && uid === null), "every resolver sees the anonymous, project-less caller");
  assert.equal(value.brand, "");
  assert.equal("keywords" in value, false);
});
