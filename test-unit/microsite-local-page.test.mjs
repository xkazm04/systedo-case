/** W2-C — the local-landing microsite's wire door and its structured data.
 *
 *  The load-bearing assertion in this file is a NEGATIVE one: the LocalBusiness
 *  JSON-LD must carry NO `address` (and no telephone / opening hours / geo). This
 *  repo has no NAP data model, so any of those would have to be invented, and
 *  structured data is a machine-readable claim — inventing one is worse than omitting
 *  it. Re-adding an address key therefore turns this suite red on purpose.
 *
 *  Also pins the wire-door bounds (slug minting, page-text clamping, the tel:/mailto:
 *  contact allowlist) — the pure half of the publish path, provable without a request. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url);

const { localBusinessJsonLd, isoCurrency } = await import("@/lib/microsite/local-jsonld");
const { mintLocalSlug, sanitizeLocalPageText, isOperatorContact } = await import(
  "@/lib/microsite/local-page"
);
const { MICROSITE_SLUG_RE } = await import("@/lib/microsite-identity");

const PAGE = {
  headline: "Montáž klimatizací Brno",
  intro: "Montujeme a servisujeme klimatizace v Brně a okolí.",
  sections: [{ heading: "Jak to probíhá", body: "Domluvíme termín a přijedeme." }],
  faq: [{ q: "Kolik to stojí?", a: "Od 12 900 Kč podle rozsahu." }],
  cta: "Napište nám poptávku.",
};

const PAYLOAD = {
  service: "Montáž klimatizací",
  area: "Brno",
  page: PAGE,
  price: 12900,
  priceModel: "from",
  currency: "Kč",
  generatedAt: "2026-08-29T10:00:00.000Z",
};

test("JSON-LD: a LocalBusiness graph with areaServed and the catalog offer", () => {
  const ld = localBusinessJsonLd(PAYLOAD, { brandName: "Klima Profi", slug: "klima-montaz-brno" });
  assert.equal(ld["@context"], "https://schema.org");
  assert.equal(ld["@type"], "LocalBusiness");
  assert.equal(ld.name, "Klima Profi");
  assert.match(ld.url, /\/m\/klima-montaz-brno$/);
  assert.equal(ld.description, PAGE.intro);
  assert.deepEqual(ld.areaServed, { "@type": "Place", name: "Brno" });
  assert.equal(ld.makesOffer["@type"], "Offer");
  assert.equal(ld.makesOffer.itemOffered.name, "Montáž klimatizací");
  assert.deepEqual(ld.makesOffer.itemOffered.areaServed, { "@type": "Place", name: "Brno" });
  assert.equal(ld.makesOffer.price, 12900);
  assert.equal(ld.makesOffer.priceCurrency, "CZK", "the display 'Kč' is mapped to ISO-4217");
  // "from" is a lower bound, not the price — said as a PriceSpecification, not as fact.
  assert.equal(ld.makesOffer.priceSpecification.minPrice, 12900);
});

test("JSON-LD: NO address, phone, opening hours, geo or rating — the repo has no NAP data", () => {
  const ld = localBusinessJsonLd(PAYLOAD, { brandName: "Klima Profi", slug: "s" });
  const serialized = JSON.stringify(ld);
  assert.equal("address" in ld, false, "an address would have to be invented");
  for (const key of [
    "address",
    "telephone",
    "openingHours",
    "openingHoursSpecification",
    "geo",
    "aggregateRating",
    "review",
  ]) {
    assert.equal(serialized.includes(`"${key}"`), false, `${key} must not be emitted`);
  }
});

test("JSON-LD: an unmappable currency drops the price rather than guessing at one", () => {
  const ld = localBusinessJsonLd({ ...PAYLOAD, currency: "kredit" }, { brandName: "B", slug: "s" });
  assert.equal(ld.makesOffer.price, undefined);
  assert.equal(ld.makesOffer.priceCurrency, undefined);
  assert.equal(ld.makesOffer.itemOffered.name, "Montáž klimatizací", "the offer itself survives");
  // A quote-only service publishes no price at all.
  const quote = localBusinessJsonLd(
    { ...PAYLOAD, price: undefined, priceModel: "quote", currency: "Kč" },
    { brandName: "B", slug: "s" }
  );
  assert.equal(quote.makesOffer.price, undefined);
  assert.equal(isoCurrency("Kč"), "CZK");
  assert.equal(isoCurrency("EUR"), "EUR");
  assert.equal(isoCurrency("kredity"), null);
  assert.equal(isoCurrency(undefined), null);
});

test("mintLocalSlug: client-service-area, folded, bounded, and always registry-valid", () => {
  const slug = mintLocalSlug("Klima Profi s.r.o.", "Montáž klimatizací", "Plzeň");
  assert.ok(MICROSITE_SLUG_RE.test(slug), `"${slug}" must match the registry grammar`);
  assert.ok(slug.startsWith("klima-profi"), slug);
  assert.ok(slug.length <= 40);
  assert.equal(slug.endsWith("-"), false, "trimmed at a word boundary, never on a dash");
  // Two different gaps for the same client mint two different public addresses.
  assert.notEqual(
    mintLocalSlug("Acme", "Servis", "Brno"),
    mintLocalSlug("Acme", "Servis", "Praha")
  );
  // Nothing slug-shaped survives → "" (the route answers the same 422 as before).
  assert.equal(mintLocalSlug("!!!", "???", "***"), "");
});

test("sanitizeLocalPageText: clamps every field, drops unknown keys, refuses an empty page", () => {
  const dirty = {
    headline: "H".repeat(400),
    intro: "I".repeat(2000),
    sections: [
      { heading: "A", body: "B".repeat(3000) },
      { heading: "", body: "dropped — no heading" },
      { heading: "C", body: "D" },
      { heading: "E", body: "F" },
      { heading: "G", body: "H" },
      { heading: "I", body: "J" },
    ],
    faq: [{ q: "Q", a: "A" }, { q: "", a: "dropped" }],
    cta: "C".repeat(300),
    // Anti-fabrication: a client cannot smuggle a price or a testimonial through the
    // page body — the payload's facts are re-derived server-side, and unknown keys
    // never survive the sanitizer.
    price: 999999,
    reviews: [{ author: "Fake", rating: 5, text: "invented" }],
    source: "definitely-a-model",
  };
  const page = sanitizeLocalPageText(dirty);
  assert.equal(page.headline.length, 120);
  assert.equal(page.intro.length, 800);
  assert.equal(page.sections.length, 4, "capped at 4, the empty-heading row dropped");
  assert.ok(page.sections[0].body.length <= 1200);
  assert.equal(page.faq.length, 1);
  assert.equal(page.cta.length, 120);
  assert.equal(page.price, undefined, "an unknown key never reaches the published payload");
  assert.equal(page.reviews, undefined);
  assert.equal(page.source, undefined, "only the literal 'fallback' marker is trusted");
  assert.equal(sanitizeLocalPageText({ ...PAGE, source: "fallback" }).source, "fallback");

  // A page with no usable text is refused, not published blank at an indexable URL.
  assert.equal(sanitizeLocalPageText(null), null);
  assert.equal(sanitizeLocalPageText({ headline: "x", intro: "" }), null);
  assert.equal(sanitizeLocalPageText({ headline: "x", intro: "y", sections: [] }), null);
});

test("isOperatorContact: only tel: / mailto: — a page never links anything else", () => {
  assert.equal(isOperatorContact("tel:+420777123456"), true);
  assert.equal(isOperatorContact("mailto:info@klimaprofi.cz"), true);
  assert.equal(isOperatorContact("https://evil.example"), false);
  assert.equal(isOperatorContact("javascript:alert(1)"), false);
  assert.equal(isOperatorContact("777 123 456"), false);
  assert.equal(isOperatorContact(undefined), false);
});
