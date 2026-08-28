/** The onboarding scan grounds the channel plan.
 *
 *  `/kanaly` used to build its grounding from the CATALOG spine alone, so a URL-first
 *  tenant — one who scanned their homepage in onboarding but never filled a catalog —
 *  got "vaší firmy / vaší nabídky" placeholders in the seeded plan and a
 *  type+brand-only `channel-research` prompt. buildKanalyGrounding merges the applied
 *  website-scan profile in behind ONE precedence rule: the catalog wins wherever both
 *  know something, the profile only fills gaps. This file pins that rule, the
 *  no-profile byte-identity guarantee (catalog-first tenants must see no change), the
 *  deliberate refusal to promote the scan's unconfirmed competitor guesses, and the
 *  prompt builder's use of the two new fields. Pure — no model, no I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { buildKanalyGrounding } = await import("@/lib/organic-channels/grounding");
const { buildChannelResearchPrompt } = await import("@/lib/ai/tools/channel-research");

/** The catalog-only input shape the page hands the builder. */
const input = (over = {}) => ({
  categories: [],
  offeringNames: [],
  localities: [],
  competitors: [],
  competitorsUnavailable: false,
  profile: null,
  ...over,
});

const profile = (over = {}) => ({
  businessName: "Dentalis",
  summary: "Zubní ordinace v Brně s vlastní dentální hygienou.",
  offering: "zubní ordinace, dentální hygiena, implantáty",
  audience: "dospělí v Brně a okolí, kteří hledají stálého zubaře",
  toneOfVoice: "věcný, klidný",
  keywords: ["zubař Brno", "dentální hygiena Brno"],
  competitors: ["Zubovo", "SmileClinic"],
  ...over,
});

// ── no profile: byte-identical to the catalog-only grounding ────────────────────

test("no profile → grounding is exactly what the catalog spine produced before", () => {
  const { grounding } = buildKanalyGrounding(
    input({
      categories: ["kojenecké potřeby", "autosedačky", "kočárky", "hračky", "nábytek"],
      offeringNames: ["Autosedačka Mio", "Kočárek Duo", "Autosedačka Mio"],
      localities: ["Praha", "Brno"],
      competitors: ["Alza"],
    })
  );
  assert.deepEqual(grounding, {
    // only the first FOUR categories, joined — unchanged
    offering: "kojenecké potřeby, autosedačky, kočárky, hračky",
    localities: ["Praha", "Brno"],
    competitors: ["Alza"],
    // exact-string de-dupe of catalog offering names, unchanged
    keywords: ["Autosedačka Mio", "Kočárek Duo"],
  });
});

test("no profile and no catalog → an empty grounding, as before", () => {
  const { grounding, sample } = buildKanalyGrounding(input());
  assert.deepEqual(grounding, {});
  assert.deepEqual(sample, {});
});

test("a failed competitors read still degrades the grounding, profile or not", () => {
  for (const p of [null, profile()]) {
    const { grounding } = buildKanalyGrounding(input({ competitorsUnavailable: true, profile: p }));
    assert.equal(grounding.competitorsUnavailable, true);
  }
});

// ── the profile fills gaps ──────────────────────────────────────────────────────

test("empty catalog + applied profile → offering, keywords, summary and audience arrive", () => {
  const { grounding } = buildKanalyGrounding(input({ profile: profile() }));
  assert.equal(grounding.offering, "zubní ordinace, dentální hygiena, implantáty");
  assert.deepEqual(grounding.keywords, ["zubař Brno", "dentální hygiena Brno"]);
  assert.equal(grounding.businessSummary, "Zubní ordinace v Brně s vlastní dentální hygienou.");
  assert.equal(grounding.audience, "dospělí v Brně a okolí, kteří hledají stálého zubaře");
});

test("empty catalog + profile → the seeded plan's {category} stops reading 'vaší nabídky'", () => {
  const { sample } = buildKanalyGrounding(input({ profile: profile() }));
  assert.equal(sample.category, "zubní ordinace");
});

test("a catalog category still wins the seeded plan's {category} slot", () => {
  const { sample } = buildKanalyGrounding(
    input({ categories: ["kočárky"], localities: ["Brno"], profile: profile() })
  );
  assert.deepEqual(sample, { category: "kočárky", locality: "Brno" });
});

// ── precedence: the catalog wins ────────────────────────────────────────────────

test("catalog categories win the offering outright — the profile's offering is dropped", () => {
  const { grounding } = buildKanalyGrounding(
    input({ categories: ["kočárky", "autosedačky"], profile: profile() })
  );
  assert.equal(grounding.offering, "kočárky, autosedačky");
});

test("keywords: catalog names come first, profile keywords only top up to the cap", () => {
  const { grounding } = buildKanalyGrounding(
    input({ offeringNames: ["Kočárek Duo", "Autosedačka Mio"], profile: profile() })
  );
  assert.deepEqual(grounding.keywords, [
    "Kočárek Duo",
    "Autosedačka Mio",
    "zubař Brno",
    "dentální hygiena Brno",
  ]);
});

test("keywords: a full catalog leaves no room, so the profile adds nothing", () => {
  const names = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  const { grounding } = buildKanalyGrounding(
    input({ offeringNames: names, profile: profile() })
  );
  assert.deepEqual(grounding.keywords, names.slice(0, 8));
});

test("keywords: a profile keyword the catalog already names (any casing) is not repeated", () => {
  const { grounding } = buildKanalyGrounding(
    input({ offeringNames: ["Zubař Brno"], profile: profile({ keywords: ["zubař brno", "implantáty"] }) })
  );
  assert.deepEqual(grounding.keywords, ["Zubař Brno", "implantáty"]);
});

// ── what the profile is NOT allowed to ground ───────────────────────────────────

test("the scan's competitor guesses never reach the grounding", () => {
  const { grounding } = buildKanalyGrounding(input({ profile: profile() }));
  assert.equal(grounding.competitors, undefined);
});

test("only the CURATED competitor set grounds the plan; the scan cannot add to it", () => {
  const { grounding } = buildKanalyGrounding(
    input({ competitors: ["Alza"], profile: profile() })
  );
  assert.deepEqual(grounding.competitors, ["Alza"]);
});

// ── bounds (mirroring the wire validator, so nothing is silently truncated) ──────

test("profile text is bounded before it leaves the builder", () => {
  const { grounding } = buildKanalyGrounding(
    input({
      profile: profile({
        summary: "s".repeat(900),
        audience: "a".repeat(500),
        offering: "o".repeat(400),
        keywords: ["k".repeat(200)],
      }),
    })
  );
  assert.equal(grounding.businessSummary.length, 600);
  assert.equal(grounding.audience.length, 300);
  assert.equal(grounding.offering.length, 300);
  assert.equal(grounding.keywords[0].length, 120);
});

test("a blank-valued profile contributes nothing (no empty keys)", () => {
  const { grounding } = buildKanalyGrounding(
    input({
      profile: profile({ summary: "   ", audience: "", offering: "", keywords: ["", "  "] }),
    })
  );
  assert.deepEqual(grounding, {});
});

// ── the prompt builder actually shows the model the new fields ──────────────────

const req = (over = {}) => ({ projectType: "local", brand: "Dentalis", ...over });

test("prompt: businessSummary and audience are labelled and threaded through", () => {
  const p = buildChannelResearchPrompt(
    req({
      businessSummary: "Zubní ordinace v Brně.",
      audience: "dospělí v Brně",
      offering: "dentální hygiena",
    })
  );
  assert.match(p, /Čím se firma zabývá: Zubní ordinace v Brně\./);
  assert.match(p, /Cílové publikum: dospělí v Brně/);
  // ordered: what the firm does → what it sells → who it sells to
  assert.ok(
    p.indexOf("Čím se firma zabývá") < p.indexOf("Nabídka:"),
    "business summary precedes the offering"
  );
  assert.ok(p.indexOf("Nabídka:") < p.indexOf("Cílové publikum"), "offering precedes the audience");
});

test("prompt: a catalog-first request (no scan fields) is unchanged", () => {
  const before = buildChannelResearchPrompt(
    req({ offering: "dentální hygiena", localities: ["Brno"], keywords: ["zubař Brno"] })
  );
  assert.ok(!before.includes("Čím se firma zabývá"), "no summary line without a summary");
  assert.ok(!before.includes("Cílové publikum"), "no audience line without an audience");
  assert.match(before, /Typ podnikání: lokální podnik \/ služby s provozovnou/);
  assert.match(before, /Značka \/ firma: Dentalis/);
});

test("prompt: the grounding the builder produces round-trips into the prompt", () => {
  const { grounding } = buildKanalyGrounding(input({ profile: profile() }));
  const p = buildChannelResearchPrompt(
    req({
      ...(grounding.offering ? { offering: grounding.offering } : {}),
      ...(grounding.businessSummary ? { businessSummary: grounding.businessSummary } : {}),
      ...(grounding.audience ? { audience: grounding.audience } : {}),
      ...(grounding.keywords?.length ? { keywords: grounding.keywords } : {}),
    })
  );
  assert.match(p, /Zubní ordinace v Brně s vlastní dentální hygienou\./);
  assert.match(p, /dospělí v Brně a okolí/);
  assert.match(p, /zubař Brno, dentální hygiena Brno/);
});
