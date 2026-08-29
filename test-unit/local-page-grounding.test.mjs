/** W2-C — the `local-page` tool and its server-side grounding.
 *
 *  Two things are being pinned, and both are honesty properties rather than shape
 *  checks:
 *   1. `buildLocalPageRequest` takes every FACT from the project's own catalog — the
 *      service's real spelling, its price and price model — and quotes a review ONLY
 *      when the project's review set is genuinely imported. The illustrative sample
 *      reviews are demo prose; publishing one as a customer testimonial at a public
 *      URL would be fabrication, not a labelling problem.
 *   2. The tool's normalizer BUILDS its result rather than spreading the parse, so a
 *      model-emitted price or testimonial has nowhere to land, and the deterministic
 *      floor uses nothing the request did not carry. */
process.env.LOCAL_DB = "true";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-local-page-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
register("./json-loader.mjs", import.meta.url);
// The catalog loader reaches the auth graph for its owner check; the grounding under
// test never depends on WHO the caller is (the tenancy triad is `resolveLocalPage`'s
// job, one layer up), so the session is stubbed exactly as bench-catalog-core-15 does.
mock.module("@/lib/session", {
  namedExports: { currentUserId: async () => "u-test", currentSession: async () => null },
});

const { buildLocalPageRequest, MAX_PAGE_REVIEWS } = await import(
  "@/lib/local-signals/page-grounding"
);
const { loadProjectCatalogWithSource } = await import("@/lib/catalog/load");
const { isService } = await import("@/lib/catalog/offering");
const { localitiesFor } = await import("@/lib/catalog/resolve");
const { saveLocalSignals, clearLocalSignals } = await import("@/lib/local-signals/store");
const {
  baseLocalPage,
  buildLocalPagePrompt,
  demoLocalPage,
  normalizeLocalPage,
  validateLocalPage,
  localPagePriceLine,
  LOCAL_PAGE_LIMITS,
} = await import("@/lib/ai/tools/local-page");
const { validateLocalPageRequest, validateLocalPageIntent } = await import("@/lib/ai/validation");

const PROJECT = {
  id: "proj-local-page",
  name: "Dentalis (ukázka)",
  type: "local",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("grounding: the request takes its service spelling, price and price model FROM THE CATALOG", async () => {
  const { offerings } = await loadProjectCatalogWithSource(PROJECT);
  const service = offerings.filter(isService)[0];
  assert.ok(service, "the local seed catalog has services");
  const area = localitiesFor(PROJECT)[0].name;

  // The caller types the service without diacritics and in lower case — the same fold
  // the coverage overlay uses must still find the catalog row.
  const typed = service.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const { request, sample, keyId } = await buildLocalPageRequest(PROJECT, typed, area);

  assert.equal(request.service, service.name, "the CATALOG spelling wins, so the payload folds back onto its cell");
  assert.equal(request.area, area);
  assert.equal(request.price, service.price > 0 ? service.price : undefined);
  assert.equal(request.priceModel, service.priceModel);
  assert.equal(request.brand, "Dentalis", "the (ukázka) marker is stripped before it reaches a prompt");
  assert.ok(request.businessType, "the business type is derived from the catalogue, not hardcoded");
  assert.equal(sample, true, "the seed catalog is honestly flagged as illustrative");
  assert.equal(keyId, PROJECT.id);
});

test("grounding: SAMPLE reviews are never quoted; imported ones are, capped at two", async () => {
  const area = localitiesFor(PROJECT)[0].name;
  const { offerings } = await loadProjectCatalogWithSource(PROJECT);
  const service = offerings.filter(isService)[0].name;

  const withoutImport = await buildLocalPageRequest(PROJECT, service, area);
  assert.equal(
    withoutImport.request.reviews,
    undefined,
    "illustrative sample reviews must never be published as customer testimonials"
  );

  await saveLocalSignals(PROJECT.id, {
    meta: { source: "import", syncedAt: "2026-08-01T00:00:00Z", rowCount: 0 },
    ladder: [],
    reviews: {
      meta: { source: "import", syncedAt: "2026-08-01T00:00:00Z", rowCount: 4 },
      items: [
        { id: "r1", author: "Jana K.", area, rating: 5, text: "Skvělá péče a rychlý termín.", daysAgo: 3 },
        { id: "r2", author: "Petr M.", area, rating: 4, text: "Spokojenost, přijdu znovu.", daysAgo: 9 },
        { id: "r3", author: "Eva H.", area, rating: 3, text: "Průměr.", daysAgo: 1 },
        { id: "r4", author: "Kdosi", area: "Jiná oblast", rating: 5, text: "Z jiné lokality.", daysAgo: 2 },
      ],
    },
  });
  const imported = await buildLocalPageRequest(PROJECT, service, area);
  const quotes = imported.request.reviews ?? [];
  assert.equal(quotes.length, MAX_PAGE_REVIEWS, "capped at two");
  assert.equal(quotes[0].author, "Jana K.", "best-rated first");
  assert.ok(
    quotes.every((q) => q.text !== "Z jiné lokality."),
    "a review from another area never appears on this area's page"
  );
  await clearLocalSignals(PROJECT.id);
});

test("prompt: only the given figures appear, and the price line vanishes without one", () => {
  const req = {
    service: "Montáž klimatizací",
    area: "Brno",
    businessType: "klimatizace",
    brand: "Klima Profi",
    price: 12900,
    priceModel: "from",
    currency: "Kč",
    reviews: [{ author: "Jana K.", rating: 5, text: "Přijeli včas." }],
  };
  const prompt = buildLocalPagePrompt(req);
  assert.match(prompt, /Montáž klimatizací/);
  assert.match(prompt, /Brno/);
  assert.match(prompt, /Přijeli včas\./, "the real review is quoted verbatim");
  assert.match(prompt, /Žádnou adresu, telefon ani otevírací dobu neuváděj/);

  assert.equal(localPagePriceLine({ ...req, price: undefined, priceModel: undefined }), "");
  assert.match(localPagePriceLine({ ...req, price: undefined, priceModel: "quote" }), /na vyžádání/);
  assert.equal(
    buildLocalPagePrompt({ ...req, price: undefined, priceModel: undefined }).includes("Cena"),
    false,
    "no price in the grounding → the prompt says nothing about price at all"
  );
  // A refine note rides the USER prompt only.
  assert.match(buildLocalPagePrompt({ ...req, refine: "kratší" }), /DODATEČNÉ POKYNY/);
});

test("normalize: unknown model keys are dropped, fields clamped, empties backfilled", () => {
  const req = { service: "Servis", area: "Praha", businessType: "servis", brand: "Acme" };
  const out = normalizeLocalPage(
    {
      headline: "H".repeat(500),
      intro: "",
      sections: [
        { heading: "A", body: "B" },
        { heading: "", body: "dropped" },
        { heading: "C", body: "D" },
        { heading: "E", body: "F" },
        { heading: "G", body: "H" },
        { heading: "I", body: "J" },
      ],
      faq: [{ q: "Q", a: "A" }],
      cta: "Zavolejte",
      // What the tool must structurally refuse to carry:
      price: 999999,
      reviews: [{ author: "Nikdo", rating: 5, text: "vymyšlené" }],
      telephone: "+420 777 123 456",
      address: "Nádražní 1, Praha",
    },
    req
  );
  assert.equal(out.headline.length, LOCAL_PAGE_LIMITS.headline);
  assert.ok(out.intro.length > 0, "an empty intro is backfilled from the deterministic floor");
  assert.equal(out.sections.length, 4, "capped at 4, the heading-less row dropped");
  assert.equal(out.faq.length, 1);
  assert.equal(out.price, undefined);
  assert.equal(out.reviews, undefined);
  assert.equal(out.telephone, undefined);
  assert.equal(out.address, undefined);
  assert.equal(out.source, undefined, "a real model draft is not marked as the fallback");
  assert.deepEqual(Object.keys(out).sort(), ["cta", "faq", "headline", "intro", "sections"]);
});

test("floor + demo: the deterministic text uses nothing the request did not carry", () => {
  const req = {
    service: "Servis a revize",
    area: "Ostrava",
    businessType: "klimatizace",
    brand: "Klima Profi",
    price: 1490,
    priceModel: "from",
    currency: "Kč",
  };
  const base = baseLocalPage(req);
  assert.equal(base.source, "fallback", "honest marker: no model wrote this");
  assert.match(base.headline, /Servis a revize/);
  assert.ok(base.sections.length >= 2 && base.faq.length >= 2);
  const text = JSON.stringify(base);
  assert.equal(/@/.test(text), false, "no invented e-mail");
  assert.equal(/\d{3} ?\d{3} ?\d{3}/.test(text), false, "no invented phone number");
  assert.equal(/[Aa]dresa/.test(text), false, "no invented address");

  // No price in the grounding → the floor states no price either.
  const unpriced = baseLocalPage({ ...req, price: undefined, priceModel: undefined });
  assert.equal(/1\s?490/.test(JSON.stringify(unpriced)), false);

  // The keyless demo is the floor plus the honest disclaimer — and only there.
  assert.match(demoLocalPage(req).intro, /Ukázkový výstup/);
  assert.equal(/Ukázkový výstup/.test(base.intro), false);
});

test("validate: a hollow page is re-prompted, not published", () => {
  assert.deepEqual(validateLocalPage({ headline: "H", intro: "I", cta: "C", sections: [{ heading: "A", body: "B" }, { heading: "C", body: "D" }] }), []);
  assert.ok(validateLocalPage("not an object").length > 0, "a non-object always fails");
  assert.ok(validateLocalPage({ headline: "H", intro: "I", cta: "C", sections: [] }).some((v) => /sekce/.test(v)));
  assert.ok(validateLocalPage({ intro: "I", cta: "C" }).some((v) => /headline/.test(v)));
});

test("wire validators: the intent carries no numbers, the request clamps them", () => {
  const intent = validateLocalPageIntent({ projectId: "p1", service: "Servis", area: "Brno", refine: "kratší" });
  assert.equal(intent.valid, true);
  assert.deepEqual(intent.value, { projectId: "p1", service: "Servis", area: "Brno", refine: "kratší" });
  assert.equal(validateLocalPageIntent({ projectId: "p1", service: "", area: "Brno" }).valid, false);
  assert.equal(validateLocalPageIntent({ service: "S", area: "B" }).valid, false, "no project → refused");

  const req = validateLocalPageRequest({
    service: "Servis",
    area: "Brno",
    brand: "Acme (ukázka)",
    businessType: "servis",
    price: -5,
    priceModel: "nonsense",
    currency: "Kč",
    reviews: [
      { author: "A", rating: 5, text: "jedna" },
      { author: "B", rating: 4, text: "dvě" },
      { author: "C", rating: 3, text: "tři" },
    ],
  });
  assert.equal(req.valid, true);
  assert.equal(req.value.brand, "Acme", "the sample marker never reaches a public page");
  assert.equal(req.value.price, undefined, "a negative price is dropped, not printed");
  assert.equal(req.value.priceModel, undefined, "an unknown price model is dropped");
  assert.equal(req.value.reviews.length, 2, "at most two quotes");
});
