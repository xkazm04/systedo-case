/** Unit tests for the AI route request validators (src/lib/ai/validation.ts).
 *  These 13 pure `unknown → Valid<T>` functions are the gatekeeper for every AI
 *  endpoint: they reject malformed input, clamp/slice to the model's limits, and
 *  — critically — re-derive some fields so the model can't be fed contradictory
 *  numbers. The tests pin those non-obvious behaviors (rate recomputation, channel
 *  filtering, case-insensitive dedup, finite-number coercion, enum gating, and the
 *  cs/en localized error messages), not just the happy path. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAdRequest,
  validateBriefRequest,
  validateAnalysisRequest,
  validateTwinReplyRequest,
  validateTwinStyleRequest,
  validateRepurposeRequest,
  validateLocalReviewReplyRequest,
  validateArticleDraftRequest,
  validateCohortDiagnosisRequest,
  validateLeadSourceDiagnosisRequest,
  validateComparisonOutlineRequest,
  validateLpVariantIdeasRequest,
  validateEvaluationRequest,
  validateKeywordClustersRequest,
} from "@/lib/ai/validation";

// --- shared shape guards --------------------------------------------------

test("every validator rejects a non-object input with the localized 'missing data' error", () => {
  const validators = [
    validateAdRequest,
    validateBriefRequest,
    validateAnalysisRequest,
    validateTwinReplyRequest,
    validateTwinStyleRequest,
    validateRepurposeRequest,
    validateLocalReviewReplyRequest,
    validateArticleDraftRequest,
    validateCohortDiagnosisRequest,
    validateLeadSourceDiagnosisRequest,
    validateComparisonOutlineRequest,
    validateLpVariantIdeasRequest,
    validateEvaluationRequest,
    validateKeywordClustersRequest,
  ];
  for (const v of validators) {
    for (const bad of [null, undefined, "string", 42, true]) {
      const cs = v(bad);
      assert.equal(cs.valid, false, `${v.name} should reject ${String(bad)}`);
      assert.equal(cs.error, "Chybí data požadavku.");
      const en = v(bad, "en");
      assert.equal(en.error, "Missing request data.", `${v.name} en message`);
    }
  }
});

// --- validateAdRequest ----------------------------------------------------

test("validateAdRequest accepts a valid request and trims its strings", () => {
  const r = validateAdRequest({
    product: "  Kešu ořechy  ",
    benefits: "Křupavé a zdravé",
    audience: "Fanoušci superpotravin",
    platform: "google",
    tone: "pratelsky",
  });
  assert.equal(r.valid, true);
  assert.deepEqual(r.value, {
    product: "Kešu ořechy",
    benefits: "Křupavé a zdravé",
    audience: "Fanoušci superpotravin",
    platform: "google",
    tone: "pratelsky",
  });
});

test("validateAdRequest enforces length bounds and enum membership", () => {
  const base = { product: "Kešu", benefits: "Zdravé", audience: "Lidé", platform: "google", tone: "vecny" };
  assert.equal(validateAdRequest({ ...base, product: "x" }).valid, false, "product too short");
  assert.equal(validateAdRequest({ ...base, product: "x".repeat(201) }).valid, false, "product too long");
  assert.equal(validateAdRequest({ ...base, benefits: "x".repeat(601) }).valid, false, "benefits too long");
  assert.equal(validateAdRequest({ ...base, audience: "x".repeat(301) }).valid, false, "audience too long");
  assert.equal(validateAdRequest({ ...base, platform: "meta" }).valid, false, "unknown platform");
  assert.equal(validateAdRequest({ ...base, tone: "sarcastic" }).valid, false, "unknown tone");
  assert.equal(validateAdRequest(base).valid, true, "boundary-valid request passes");
});

// --- validateBriefRequest + parseKeywords ---------------------------------

test("validateBriefRequest sanitizes optional grounding keywords", () => {
  const r = validateBriefRequest({
    topic: "Superpotraviny",
    primaryKeyword: "kešu ořechy",
    audience: "Zdravý životní styl",
    contentType: "blog",
    keywords: [
      { keyword: "kešu", volume: 1200, competition: "low" },
      { keyword: "", volume: 5 }, // dropped: no keyword
      { keyword: "mandle", volume: "not-a-number" }, // volume → 0
      "garbage", // dropped: not an object
      { keyword: "x".repeat(200), competition: "y".repeat(50) }, // sliced
    ],
  });
  assert.equal(r.valid, true);
  assert.equal(r.value.keywords.length, 3, "malformed rows dropped");
  assert.equal(r.value.keywords[1].volume, 0, "non-finite volume coerced to 0");
  assert.equal(r.value.keywords[2].keyword.length, 120, "keyword sliced to 120");
  assert.equal(r.value.keywords[2].competition.length, 20, "competition sliced to 20");
});

test("validateBriefRequest caps keywords at 12 and returns undefined for none", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ keyword: `kw${i}` }));
  const capped = validateBriefRequest({
    topic: "Téma", primaryKeyword: "klíč", audience: "Publikum", contentType: "blog", keywords: many,
  });
  assert.equal(capped.value.keywords.length, 12, "keyword list capped at 12");

  const none = validateBriefRequest({
    topic: "Téma", primaryKeyword: "klíč", audience: "Publikum", contentType: "blog", keywords: [{ bad: 1 }],
  });
  assert.equal(none.value.keywords, undefined, "all-malformed → undefined, not empty array");
});

// --- validateAnalysisRequest ----------------------------------------------

test("validateAnalysisRequest gates on the period enum", () => {
  assert.equal(validateAnalysisRequest({ period: "90d" }).valid, true);
  assert.equal(validateAnalysisRequest({ period: "7d" }).valid, false);
  assert.equal(validateAnalysisRequest({ period: "7d" }, "en").error, "Invalid analysis period.");
});

// --- validateTwinReplyRequest ----------------------------------------------

test("validateTwinReplyRequest threads optional BANT qualification + brand through", () => {
  const r = validateTwinReplyRequest({
    inbound: "Mám zájem o vaše služby",
    channel: "leads",
    arrival: "form",
    projectType: "e-shop",
    contact: "Jana",
    qualification: "Rozpočet 50k, rozhoduje do měsíce",
    brand: "Adamant",
  });
  assert.equal(r.valid, true);
  assert.equal(r.value.contact, "Jana");
  assert.equal(r.value.arrival, "form");
  assert.equal(r.value.qualification, "Rozpočet 50k, rozhoduje do měsíce");
  assert.equal(r.value.brand, "Adamant");
});

test("validateTwinReplyRequest omits optional fields when blank and gates the channel", () => {
  const minimal = validateTwinReplyRequest({ inbound: "Dobrý den", channel: "email", projectType: "služby" });
  assert.equal(minimal.valid, true);
  assert.equal("contact" in minimal.value, false, "blank contact not copied");
  assert.equal("qualification" in minimal.value, false);
  assert.equal("brand" in minimal.value, false);
  assert.equal("voice" in minimal.value, false);
  assert.equal(validateTwinReplyRequest({ inbound: "x", channel: "email", projectType: "s" }).valid, false, "inbound too short");
  assert.equal(validateTwinReplyRequest({ inbound: "hello", channel: "pigeon", projectType: "s" }).valid, false, "unknown channel");
});

test("validateTwinReplyRequest drops an unrecognised arrival kind rather than passing it on", () => {
  const r = validateTwinReplyRequest({ inbound: "Dobrý den", channel: "leads", arrival: "pigeon", projectType: "služby" });
  assert.equal(r.valid, true);
  assert.equal("arrival" in r.value, false);
});

test("validateTwinReplyRequest splits the voice into always/never and bounds the thread", () => {
  const r = validateTwinReplyRequest({
    inbound: "Dobrý den, kolik to stojí?",
    channel: "chat",
    projectType: "e-shop",
    voice: { directives: "Vykej.", traits: ["věcný"], lengthHint: "2 věty", always: ["Poděkuj"], never: ["Neslibuj cenu"] },
    thread: [
      { direction: "in", content: "první" },
      { direction: "sideways", content: "podvržený směr" },
      { direction: "out", content: "druhá" },
    ],
  });
  assert.equal(r.valid, true);
  assert.deepEqual(r.value.voice.always, ["Poděkuj"]);
  assert.deepEqual(r.value.voice.never, ["Neslibuj cenu"]);
  // A turn with an unknown direction is dropped, never coerced — mislabelling who
  // said what would poison the draft more subtly than losing the turn.
  assert.equal(r.value.thread.length, 2);
  assert.deepEqual(r.value.thread.map((t) => t.direction), ["in", "out"]);
});

// --- validateTwinStyleRequest ----------------------------------------------

test("validateTwinStyleRequest gates the tone scope and keeps samples + answers", () => {
  const r = validateTwinStyleRequest({
    scope: "email",
    projectType: "leadgen",
    samples: ["Dobrý den, pane Nováku, díky za poptávku.", "  ", "Cenu pošlu do pátku."],
    answers: [
      { question: "Tykáte?", answer: "Vykáme." },
      { question: "", answer: "zahozeno" },
    ],
  });
  assert.equal(r.valid, true);
  assert.equal(r.value.samples.length, 2, "blank sample dropped");
  assert.equal(r.value.answers.length, 1, "answer without a question dropped");
  assert.equal(r.value.answers[0].answer, "Vykáme.");

  assert.equal(validateTwinStyleRequest({ scope: "generic", projectType: "leadgen" }).valid, true, "generic is a scope");
  assert.equal(validateTwinStyleRequest({ scope: "carrier-pigeon", projectType: "s" }).valid, false, "unknown scope");
});

// --- validateRepurposeRequest ---------------------------------------------

test("validateRepurposeRequest filters channels to the known set and requires at least one", () => {
  const r = validateRepurposeRequest({
    title: "Jak vybrat ořechy",
    url: "https://example.com/clanek",
    tone: "vecny",
    channels: ["LinkedIn", "Nonsense", "Instagram", 42],
  });
  assert.equal(r.valid, true);
  assert.ok(r.value.channels.includes("LinkedIn") && r.value.channels.includes("Instagram"));
  assert.ok(!r.value.channels.includes("Nonsense"), "unknown channel dropped");
  assert.equal(r.value.channels.length, 2, "non-string / unknown entries filtered out");

  const noneKnown = validateRepurposeRequest({
    title: "T", url: "https://x.com", tone: "vecny", channels: ["Nonsense"],
  });
  assert.equal(noneKnown.valid, false, "no known channel → rejected");
});

test("validateRepurposeRequest rejects an unparseable URL and an over-long body", () => {
  const badUrl = validateRepurposeRequest({ title: "Titulek", url: "not a url", tone: "vecny", channels: ["LinkedIn"] });
  assert.equal(badUrl.valid, false);
  assert.equal(validateRepurposeRequest({ title: "Titulek", url: "not a url", tone: "vecny", channels: ["LinkedIn"] }, "en").error, "Invalid source article URL.");

  const hugeBody = validateRepurposeRequest({
    title: "T", url: "https://x.com", tone: "vecny", channels: ["LinkedIn"], body: "a".repeat(100_001),
  });
  assert.equal(hugeBody.valid, false, "body over 100k rejected");
});

// --- validateLocalReviewReplyRequest --------------------------------------

test("validateLocalReviewReplyRequest rounds the rating and enforces the 1–5 range", () => {
  const ok = validateLocalReviewReplyRequest({ reviewText: "Skvělé!", rating: 4.6, area: "Brno" });
  assert.equal(ok.valid, true);
  assert.equal(ok.value.rating, 5, "rating rounded");

  assert.equal(validateLocalReviewReplyRequest({ reviewText: "x", rating: 5, area: "Brno" }).valid, false, "review too short");
  assert.equal(validateLocalReviewReplyRequest({ reviewText: "Dobré", rating: 0, area: "Brno" }).valid, false, "rating below range");
  assert.equal(validateLocalReviewReplyRequest({ reviewText: "Dobré", rating: 6, area: "Brno" }).valid, false, "rating above range");
  assert.equal(validateLocalReviewReplyRequest({ reviewText: "Dobré", rating: "x", area: "Brno" }).valid, false, "non-numeric rating");
});

// --- validateArticleDraftRequest ------------------------------------------

test("validateArticleDraftRequest requires a title (tag or h1) and a non-empty outline", () => {
  const outline = [{ heading: "Úvod", points: ["a", "b"] }];
  assert.equal(validateArticleDraftRequest({ titleTag: "", h1: "", outline }).valid, false, "no title at all");
  assert.equal(validateArticleDraftRequest({ h1: "Nadpis", outline: [] }).valid, false, "no outline");
  assert.equal(validateArticleDraftRequest({ h1: "Nadpis", outline: [{ points: ["x"] }] }).valid, false, "outline rows without heading dropped → empty");

  const ok = validateArticleDraftRequest({ titleTag: "Titulek", outline, keywords: ["kešu", 5, "  "] });
  assert.equal(ok.valid, true, "titleTag alone is enough");
  assert.deepEqual(ok.value.keywords, ["kešu"], "non-string / blank keywords filtered");
});

test("validateArticleDraftRequest only sets contentType when it is a known value", () => {
  const outline = [{ heading: "H", points: [] }];
  const bad = validateArticleDraftRequest({ h1: "N", outline, contentType: "novella" });
  assert.equal("contentType" in bad.value, false, "unknown contentType dropped");
  const good = validateArticleDraftRequest({ h1: "N", outline, contentType: "blog" });
  assert.equal(good.value.contentType, "blog");
});

// --- validateCohortDiagnosisRequest ---------------------------------------

test("validateCohortDiagnosisRequest drops cohorts without a month and coerces numbers", () => {
  const r = validateCohortDiagnosisRequest({
    cohorts: [
      { month: "2025-01", cac: 500, ltv: 1500, ltvCac: 3, paybackMonth: 4, m3: 0.6, signups: 120 },
      { cac: 1, ltv: 1 }, // dropped: no month
      { month: "2025-02", cac: "oops", paybackMonth: 0 }, // cac→0, paybackMonth 0→null
    ],
    blendedCac: "x",
    avgLtvCac: 2.5,
    avgPayback: null,
    trend: "improving",
  });
  assert.equal(r.valid, true);
  assert.equal(r.value.cohorts.length, 2, "monthless cohort dropped");
  assert.equal(r.value.cohorts[1].cac, 0, "non-finite cac coerced to 0");
  assert.equal(r.value.cohorts[1].paybackMonth, null, "non-positive paybackMonth → null");
  assert.equal(r.value.blendedCac, 0, "non-finite blendedCac coerced to 0");
  assert.equal(r.value.trend, "improving", "valid trend kept");
});

test("validateCohortDiagnosisRequest rejects when no cohort survives and ignores an invalid trend", () => {
  assert.equal(validateCohortDiagnosisRequest({ cohorts: [{ cac: 1 }] }).valid, false, "no addressable cohort");
  assert.equal(validateCohortDiagnosisRequest({ cohorts: "nope" }, "en").error, "Missing cohort data for diagnosis.");
  const r = validateCohortDiagnosisRequest({ cohorts: [{ month: "2025-01" }], blendedCac: 1, avgLtvCac: 1, avgPayback: 1, trend: "sideways" });
  assert.equal("trend" in r.value, false, "unknown trend dropped");
});

// --- validateLeadSourceDiagnosisRequest -----------------------------------

test("validateLeadSourceDiagnosisRequest recomputes rates from counts, ignoring supplied contradictory rates", () => {
  const r = validateLeadSourceDiagnosisRequest({
    source: "Meta lead formuláře",
    leads: 200,
    qualified: 50,
    won: 10,
    qualRate: 0.99, // contradictory — must be ignored
    winRate: 0.99, // contradictory — must be ignored
  });
  assert.equal(r.valid, true);
  assert.equal(r.value.qualRate, 50 / 200, "qualRate recomputed from qualified/leads");
  assert.equal(r.value.winRate, 10 / 50, "winRate recomputed from won/qualified");
});

test("validateLeadSourceDiagnosisRequest derives spend-based costs and clamps peers", () => {
  const r = validateLeadSourceDiagnosisRequest({
    source: "Google Ads",
    leads: 100,
    qualified: 40,
    won: 8,
    spend: 20000,
    peers: [
      { source: "SEO", qualRate: 2, winRate: -1 }, // clamped to [0,1]
      { source: "", qualRate: 0.5 }, // dropped: no source
      { qualRate: 0.3 }, // dropped: no source
    ],
  });
  assert.equal(r.value.spend, 20000);
  assert.equal(r.value.cpql, 20000 / 100, "cpql derived from spend/leads when omitted");
  assert.equal(r.value.costPerQualified, 20000 / 40, "costPerQualified derived from spend/qualified");
  assert.equal(r.value.peers.length, 1, "peers without a source dropped");
  assert.equal(r.value.peers[0].qualRate, 1, "peer qualRate clamped to 1");
  assert.equal(r.value.peers[0].winRate, 0, "peer winRate clamped to 0");
});

test("validateLeadSourceDiagnosisRequest requires a source and at least one lead", () => {
  assert.equal(validateLeadSourceDiagnosisRequest({ source: "", leads: 10 }).valid, false, "no source");
  assert.equal(validateLeadSourceDiagnosisRequest({ source: "X", leads: 0 }).valid, false, "no leads");
  assert.equal(validateLeadSourceDiagnosisRequest({ source: "X", leads: 0 }, "en").error, "The source has no leads to diagnose.");
  const noSpend = validateLeadSourceDiagnosisRequest({ source: "Organic", leads: 30, qualified: 9, won: 2 });
  assert.equal("spend" in noSpend.value, false, "no spend → no cost fields");
  assert.equal("cpql" in noSpend.value, false);
});

// --- validateComparisonOutlineRequest -------------------------------------

test("validateComparisonOutlineRequest gates query length + intent and keeps optional grounding", () => {
  const r = validateComparisonOutlineRequest({
    query: "adamant vs konkurence",
    intent: "vs",
    volume: 480,
    competitor: "Konkurent",
    positioning: "Levnější a rychlejší",
  });
  assert.equal(r.valid, true);
  assert.equal(r.value.volume, 480);
  assert.equal(r.value.competitor, "Konkurent");
  assert.equal(validateComparisonOutlineRequest({ query: "x", intent: "vs" }).valid, false, "query too short");
  assert.equal(validateComparisonOutlineRequest({ query: "adamant recenze", intent: "unknown" }).valid, false, "bad intent");
  const noVol = validateComparisonOutlineRequest({ query: "adamant cena", intent: "pricing", volume: -5 });
  assert.equal("volume" in noVol.value, false, "non-positive volume dropped");
});

// --- validateLpVariantIdeasRequest ----------------------------------------

test("validateLpVariantIdeasRequest de-dupes keywords case-insensitively and threads losers + controlCvr", () => {
  const r = validateLpVariantIdeasRequest({
    topic: "Landing page pro ořechy",
    keywords: ["Kešu", "kešu", "KEŠU", "mandle"], // → 2 unique
    controlLabel: "Původní",
    controlDescription: "Klasická varianta",
    losers: ["Sleva 10 %", ""],
    controlCvr: 0.045,
  });
  assert.equal(r.valid, true);
  assert.equal(r.value.keywords.length, 2, "case-insensitive dedup");
  assert.deepEqual(r.value.losers, ["Sleva 10 %"], "blank loser dropped");
  assert.equal(r.value.controlCvr, 0.045);
});

test("validateLpVariantIdeasRequest rejects controlCvr outside (0,1] and a short topic", () => {
  assert.equal(validateLpVariantIdeasRequest({ topic: "x" }).valid, false, "topic too short");
  const outOfRange = validateLpVariantIdeasRequest({ topic: "Ořechová LP", controlCvr: 1.5 });
  assert.equal("controlCvr" in outOfRange.value, false, "controlCvr > 1 dropped");
  const zero = validateLpVariantIdeasRequest({ topic: "Ořechová LP", controlCvr: 0 });
  assert.equal("controlCvr" in zero.value, false, "controlCvr 0 dropped");
});

// --- validateEvaluationRequest --------------------------------------------

test("validateEvaluationRequest requires a campaignId for campaign scope but not for overall", () => {
  const campaign = validateEvaluationRequest({ scope: "campaign", campaignId: "camp-1", period: "30d" });
  assert.equal(campaign.valid, true);
  assert.equal(campaign.value.campaignId, "camp-1");

  const missingId = validateEvaluationRequest({ scope: "campaign", period: "30d" });
  assert.equal(missingId.valid, false, "campaign scope without id rejected");

  const overall = validateEvaluationRequest({ scope: "overall", period: "30d" });
  assert.equal(overall.valid, true);
  assert.equal("campaignId" in overall.value, false, "overall scope omits campaignId");

  assert.equal(validateEvaluationRequest({ scope: "galaxy", period: "30d" }).valid, false, "bad scope");
  assert.equal(validateEvaluationRequest({ scope: "overall", period: "eternity" }).valid, false, "bad period");
});

// --- validateKeywordClustersRequest ---------------------------------------

test("validateKeywordClustersRequest de-dupes, coerces per-keyword fields, and requires >= 2", () => {
  const r = validateKeywordClustersRequest({
    keywords: [
      { keyword: "Kešu", volume: 1200, intent: "Transactional" },
      { keyword: "kešu" }, // dup (case-insensitive) → dropped
      { keyword: "mandle", volume: -5, intent: "weird" }, // volume dropped, intent dropped
      { keyword: "" }, // dropped
    ],
    topic: "ořechy",
  });
  assert.equal(r.valid, true);
  assert.equal(r.value.keywords.length, 2, "case-insensitive dedup + blank drop");
  assert.equal(r.value.keywords[0].intent, "transactional", "intent lowercased + kept");
  assert.equal("volume" in r.value.keywords[1], false, "non-positive volume dropped");
  assert.equal(r.value.topic, "ořechy");
});

test("validateKeywordClustersRequest rejects fewer than 2 usable keywords", () => {
  assert.equal(validateKeywordClustersRequest({ keywords: [{ keyword: "solo" }] }).valid, false);
  assert.equal(validateKeywordClustersRequest({ keywords: [{ keyword: "a" }, { keyword: "A" }] }).valid, false, "dedup leaves 1");
  assert.equal(validateKeywordClustersRequest({ keywords: [] }, "en").error, "Please provide at least 2 keywords to cluster.");
});
