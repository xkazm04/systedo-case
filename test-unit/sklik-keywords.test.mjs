/** Direction 2 — Sklik keyword source: the SklikClient suggestion call + the neutral
 *  mapping seam (sklik/keywords.ts) run against a FIXTURE transport (no network), and the
 *  pure keyword-merge (keywords/types mergeRawIdeas) that folds Sklik ideas into the
 *  Google/sample result deduped-by-keyword, richer-record-wins, labeled by source. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SklikClient, SKLIK_KEYWORDS_METHOD } from "@/lib/sklik/client";
import {
  fetchSklikKeywordIdeas,
  mapSklikSuggestion,
  SKLIK_DEFAULT_VOLUME,
  SKLIK_DEFAULT_COMPETITION_INDEX,
} from "@/lib/sklik/keywords";
import { mergeRawIdeas } from "@/lib/keywords/types";

const SUGGESTIONS = [
  { keyword: "crm systém", searchCount: 2400, avgCpc: 18, competition: 0.8 }, // full
  { keyword: "crm zdarma", searchCount: 900, competition: 40 }, // 0–100 competition, no cpc
  { keyword: "crm pro malé firmy" }, // bare phrase → conservative defaults
  { avgCpc: 5 }, // no keyword → dropped
];

function fixtureTransport() {
  const calls = [];
  let n = 0;
  return {
    calls,
    async call(method, params) {
      calls.push({ method, params });
      if (method === "client.loginByToken") return { session: `s-${++n}`, status: 200 };
      if (method === SKLIK_KEYWORDS_METHOD) return { session: `s-${++n}`, status: 200, suggestions: SUGGESTIONS };
      throw new Error(`unexpected Sklik method ${method}`);
    },
  };
}

test("mapSklikSuggestion: full record maps to a neutral idea labeled sklik", () => {
  const idea = mapSklikSuggestion({ keyword: "  crm systém  ", searchCount: 2400.6, avgCpc: 18, competition: 0.8 });
  assert.equal(idea.keyword, "crm systém");
  assert.equal(idea.avgMonthlySearches, 2401);
  assert.equal(idea.competitionIndex, 80); // 0.8 fraction → 80
  assert.equal(idea.competition, "high");
  assert.equal(idea.source, "sklik");
  // Bid band derives from avgCpc through the moneyToCzk seam (0.7×/1.3×).
  assert.equal(idea.lowBidCzk, 13);
  assert.equal(idea.highBidCzk, 23);
});

test("mapSklikSuggestion: conservative defaults for absent metrics; 0–100 competition passthrough", () => {
  const noCpc = mapSklikSuggestion({ keyword: "crm zdarma", searchCount: 900, competition: 40 });
  assert.equal(noCpc.competitionIndex, 40); // already 0–100
  assert.equal(noCpc.lowBidCzk, 0);
  assert.equal(noCpc.highBidCzk, 0);

  const bare = mapSklikSuggestion({ keyword: "crm pro malé firmy" });
  assert.equal(bare.avgMonthlySearches, SKLIK_DEFAULT_VOLUME);
  assert.equal(bare.competitionIndex, SKLIK_DEFAULT_COMPETITION_INDEX);

  assert.equal(mapSklikSuggestion({ avgCpc: 5 }), null); // no keyword → dropped
});

test("fetchSklikKeywordIdeas: maps via the injectable client, drops the keyword-less row, one login", async () => {
  const transport = fixtureTransport();
  const client = new SklikClient(transport, "tok");
  const ideas = await fetchSklikKeywordIdeas(client, "crm");

  assert.deepEqual(ideas.map((i) => i.keyword), ["crm systém", "crm zdarma", "crm pro malé firmy"]);
  assert.ok(ideas.every((i) => i.source === "sklik"));
  // The suggestion call carries the { session } user struct + the seed.
  const call = transport.calls.find((c) => c.method === SKLIK_KEYWORDS_METHOD);
  assert.equal(typeof call.params[0].session, "string");
  assert.equal(call.params[1].seed, "crm");
  assert.equal(transport.calls.filter((c) => c.method === "client.loginByToken").length, 1);
});

test("client.suggestKeywords: reads the `keywords` envelope key as a fallback", async () => {
  const transport = {
    async call(method) {
      if (method === "client.loginByToken") return { session: "s", status: 200 };
      return { status: 200, keywords: [{ keyword: "alt" }] }; // no `suggestions` key
    },
  };
  const ideas = await fetchSklikKeywordIdeas(new SklikClient(transport, "t"), "seed");
  assert.deepEqual(ideas.map((i) => i.keyword), ["alt"]);
});

// --- pure merge ---------------------------------------------------------------

const g = (keyword, vol, hi = 0) => ({
  keyword,
  avgMonthlySearches: vol,
  competition: "medium",
  competitionIndex: 50,
  lowBidCzk: hi ? Math.round(hi * 0.6) : 0,
  highBidCzk: hi,
  source: "google",
});
const s = (keyword, vol, hi = 0) => ({ ...g(keyword, vol, hi), source: "sklik" });

test("mergeRawIdeas: unions, dedupes case-insensitively, keeps the higher-volume record", () => {
  const base = [g("crm systém", 2000, 20), g("crm zdarma", 500)];
  const extra = [s("CRM Systém", 3000, 15), s("crm mobilní", 300)];
  const merged = mergeRawIdeas(base, extra);

  // 3 distinct keywords (deduped case-insensitively), base first-seen order preserved,
  // then the new extra-only one. The kept record retains its OWN keyword string, so the
  // richer Sklik record brings "CRM Systém".
  assert.deepEqual(merged.map((i) => i.keyword), ["CRM Systém", "crm zdarma", "crm mobilní"]);
  // The duplicate resolves to the richer (higher-volume) Sklik record + its label.
  const dup = merged[0];
  assert.equal(dup.avgMonthlySearches, 3000);
  assert.equal(dup.source, "sklik");
  // The Sklik-only keyword carries its label.
  assert.equal(merged[2].source, "sklik");
});

test("mergeRawIdeas: equal volume keeps the record carrying CPC bid data", () => {
  const base = [g("crm", 1000, 0)]; // google, no bid
  const extra = [s("crm", 1000, 12)]; // sklik, has bid → richer on the tie
  const merged = mergeRawIdeas(base, extra);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].highBidCzk, 12);
  assert.equal(merged[0].source, "sklik");
});
