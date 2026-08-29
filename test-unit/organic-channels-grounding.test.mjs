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

// ── the SAMPLE-CATALOG rule (2026-08-29 L2 run) ────────────────────────────────
//
// `loadProjectCatalog` hands back the illustrative seed for any project that never
// saved a catalog, and the builder used to assert those rows to the model as this
// tenant's offering and keywords. The live run measured both halves of the damage:
// a leadgen tenant advised to "Vytvořit článek na téma Ukázková služba A" (the
// seed's own placeholder service name), and an app tenant whose applied website
// scan was overruled by the seed's "Předplatné / Free / Pro / Team".

test("sample catalog + no profile → the seed grounds nothing it could invent around", () => {
  const { grounding } = buildKanalyGrounding(
    input({
      categories: ["Služby"],
      offeringNames: ["Ukázková služba A", "Ukázková služba B"],
      localities: ["Praha", "Brno"],
      catalogIsSample: true,
    })
  );
  assert.equal(grounding.offering, undefined);
  assert.equal(grounding.keywords, undefined);
  // Localities are derived from the project TYPE, not from the seed rows, so they
  // stay: they are the one thing about this tenant the page actually knows.
  assert.deepEqual(grounding.localities, ["Praha", "Brno"]);
});

test("sample catalog + profile → the tenant's own scan wins instead of the seed", () => {
  const { grounding } = buildKanalyGrounding(
    input({
      categories: ["Předplatné"],
      offeringNames: ["Free", "Pro", "Team"],
      catalogIsSample: true,
      profile: profile({
        offering: "online fakturace, správa nákladů",
        keywords: ["fakturace online", "vystavit fakturu"],
      }),
    })
  );
  assert.equal(grounding.offering, "online fakturace, správa nákladů");
  assert.deepEqual(grounding.keywords, ["fakturace online", "vystavit fakturu"]);
  assert.ok(!JSON.stringify(grounding).includes("Ukázk"));
  assert.ok(!JSON.stringify(grounding).includes("Předplatné"));
});

test("a REAL catalog is unaffected — the flag is opt-in and defaults to off", () => {
  const rows = { categories: ["Ořechy"], offeringNames: ["Kešu"], profile: profile() };
  const off = buildKanalyGrounding(input({ ...rows })).grounding;
  const explicitOff = buildKanalyGrounding(input({ ...rows, catalogIsSample: false })).grounding;
  assert.deepEqual(explicitOff, off);
  assert.equal(off.offering, "Ořechy");
  assert.deepEqual(off.keywords, ["Kešu", "zubař Brno", "dentální hygiena Brno"]);
});

test("the SEEDED plan's fill still uses the sample category — that plan says it is a sample", () => {
  const { sample } = buildKanalyGrounding(
    input({ categories: ["Služby"], localities: ["Brno"], catalogIsSample: true })
  );
  assert.deepEqual(sample, { category: "Služby", locality: "Brno" });
});

// ── placeholder starter rows never ground the model ───────────────────────────
//
// `POST /api/projects` PERSISTS a starter catalog (src/lib/catalog/starter.ts) so a
// new project's modules have project-owned data on day one. Those rows are saved, so
// they are legitimately "the tenant's catalog" — but "Ukázková služba A" is not a fact
// about the business, and the 2026-08-29 L2 run watched it come back as advice:
// "Vytvořit článek na téma Ukázková služba A".

test("a placeholder starter row is dropped from the grounding, in cs and en", () => {
  const { grounding } = buildKanalyGrounding(
    input({
      categories: ["Služby"],
      offeringNames: ["Ukázková služba A", "Ukázkový produkt B", "Sample plan", "Konzultace SEO"],
      localities: ["Praha"],
    })
  );
  assert.deepEqual(grounding.keywords, ["Konzultace SEO"]);
  assert.ok(!JSON.stringify(grounding).includes("Ukázk"));
  assert.ok(!JSON.stringify(grounding).includes("Sample"));
});

test("every placeholder row → the catalog grounds nothing and the profile fills in", () => {
  const { grounding } = buildKanalyGrounding(
    input({
      categories: ["Ukázková kategorie"],
      offeringNames: ["Ukázková služba A", "Ukázková služba B"],
      profile: profile(),
    })
  );
  assert.equal(grounding.offering, "zubní ordinace, dentální hygiena, implantáty");
  assert.deepEqual(grounding.keywords, ["zubař Brno", "dentální hygiena Brno"]);
});

test("a real row that merely CONTAINS the word is kept — only a leading marker matches", () => {
  const { grounding } = buildKanalyGrounding(
    input({ categories: ["Ořechy"], offeringNames: ["Kešu na ukázku", "Vzorkovnice"] })
  );
  assert.deepEqual(grounding.keywords, ["Kešu na ukázku", "Vzorkovnice"]);
});

test("the starter catalog's stand-in CATEGORY is a placeholder too, and the scan fills it", () => {
  const { grounding } = buildKanalyGrounding(
    input({
      categories: ["Hlavní kategorie"],
      offeringNames: ["Ukázkový produkt A", "Ukázkový produkt B"],
      profile: profile(),
    })
  );
  assert.equal(grounding.offering, "zubní ordinace, dentální hygiena, implantáty");
});

test("a real category that merely CONTAINS the words is untouched (whole-string only)", () => {
  const { grounding } = buildKanalyGrounding(
    input({ categories: ["Hlavní kategorie kočárků"], offeringNames: [] })
  );
  assert.equal(grounding.offering, "Hlavní kategorie kočárků");
});
