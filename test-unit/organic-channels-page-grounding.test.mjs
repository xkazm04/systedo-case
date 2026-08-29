/** The PAGE-LEVEL half of the Kanály grounding assembly
 *  (`kanalyGroundingInput`, src/lib/organic-channels/grounding.ts).
 *
 *  `buildKanalyGrounding` — the catalog-vs-scan precedence rule — has been covered
 *  since it was written (organic-channels-grounding.test.mjs). What was NOT covered
 *  is the step BEFORE it: turning one server page's raw reads into that builder's
 *  input. It lived inline in /kanaly's page component, where nothing could reach it,
 *  and a near-copy of it lived in visibility-plan-resolve — two copies of "what may
 *  ground the plan", which is exactly the shape that lets two pages describe the same
 *  project differently. It is one exported function now, and this file is why that
 *  matters: both of its decisions are RULES, not plumbing.
 *
 *  Pure — no store, no Next, no model. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { kanalyGroundingInput, buildKanalyGrounding } = await import(
  "@/lib/organic-channels/grounding"
);

const offering = (name, category) => ({ name, category });
const loc = (name) => ({ name });

const reads = (over = {}) => ({ catalog: [], localities: [], ...over });

// --- the catalog spine ------------------------------------------------------

test("categories are deduped and keep catalog order; blanks are dropped", () => {
  const input = kanalyGroundingInput(
    reads({
      catalog: [
        offering("Kešu", "Ořechy"),
        offering("Mandle", "Ořechy"),
        offering("Datle", ""),
        offering("Chia", "Semínka"),
      ],
    })
  );
  assert.deepEqual(input.categories, ["Ořechy", "Semínka"]);
  // offering NAMES are not deduped here — buildKanalyGrounding owns that, and it
  // dedupes case-sensitively against the scan's keywords. Passing them through
  // untouched is what keeps that rule in one place.
  assert.deepEqual(input.offeringNames, ["Kešu", "Mandle", "Datle", "Chia"]);
});

test("localities arrive as names, in the order localitiesFor produced them", () => {
  const input = kanalyGroundingInput(reads({ localities: [loc("Brno"), loc("Praha 3")] }));
  assert.deepEqual(input.localities, ["Brno", "Praha 3"]);
});

test("an empty project grounds nothing and claims no degradation", () => {
  const input = kanalyGroundingInput(reads());
  assert.deepEqual(input, {
    categories: [],
    offeringNames: [],
    localities: [],
    competitors: [],
    competitorsUnavailable: false,
    profile: null,
    // a caller that does not say keeps the pre-2026-08-29 behaviour: the rows it
    // handed over are treated as the tenant's own and may ground the model
    catalogIsSample: false,
  });
});

test("the page's catalog SOURCE reaches the builder", () => {
  assert.equal(kanalyGroundingInput(reads({ catalogIsSample: true })).catalogIsSample, true);
  assert.equal(kanalyGroundingInput(reads()).catalogIsSample, false);
});

// --- rule 1: CURATED competitors only ---------------------------------------

test("an unconfirmed scan guess never reaches the grounding", () => {
  const input = kanalyGroundingInput(
    reads({
      competitorRead: {
        failed: false,
        competitors: [
          { name: "Alza", source: "manual" },
          { name: "Guessed s.r.o.", source: "scan" },
          { name: "Kept s.r.o.", source: "scan", confirmed: true },
          { name: "Legacy" }, // no source at all = pre-provenance = manual
        ],
      },
    })
  );
  assert.deepEqual(input.competitors, ["Alza", "Kept s.r.o.", "Legacy"]);
  // and it must not sneak back in through the grounding the model actually reads
  const { grounding } = buildKanalyGrounding(input);
  assert.ok(!grounding.competitors.includes("Guessed s.r.o."));
});

test("a set of nothing but unconfirmed guesses grounds no competitors at all", () => {
  const input = kanalyGroundingInput(
    reads({ competitorRead: { failed: false, competitors: [{ name: "Guess", source: "scan" }] } })
  );
  assert.deepEqual(input.competitors, []);
  assert.equal(input.competitorsUnavailable, false, "a filtered-out guess is not a failed read");
});

// --- rule 2: "unavailable" is not "none" ------------------------------------

test("a FAILED competitors read degrades the grounding", () => {
  const input = kanalyGroundingInput(reads({ competitorRead: { failed: true, competitors: null } }));
  assert.equal(input.competitorsUnavailable, true);
  assert.equal(buildKanalyGrounding(input).grounding.competitorsUnavailable, true);
});

test("a tenant who genuinely has no competitors is NOT warned", () => {
  const input = kanalyGroundingInput(reads({ competitorRead: { failed: false, competitors: [] } }));
  assert.equal(input.competitorsUnavailable, false);
  assert.equal(
    buildKanalyGrounding(input).grounding.competitorsUnavailable,
    undefined,
    "an absent warning must stay absent, not become `false` on the wire"
  );
});

test("a caller that never reads competitors is not treated as a failed read", () => {
  // visibility-plan-resolve deliberately omits the leg: competitors ground the AI
  // REGENERATION prompt, not the seeded plan's fill. Omission must read as "not
  // asked", never as "asked and broken" — otherwise the shared plan would show a
  // degradation warning no page could act on.
  const input = kanalyGroundingInput(reads({ catalog: [offering("Kešu", "Ořechy")] }));
  assert.deepEqual(input.competitors, []);
  assert.equal(input.competitorsUnavailable, false);
});

// --- the profile passes through untouched -----------------------------------

test("the scan profile is handed on for the builder to apply, not pre-merged here", () => {
  const profile = { businessName: "Dentalis", offering: "zubní ordinace" };
  assert.equal(kanalyGroundingInput(reads({ profile })).profile, profile);
  assert.equal(kanalyGroundingInput(reads({ profile: undefined })).profile, null);
  assert.equal(kanalyGroundingInput(reads({ profile: null })).profile, null);
});
