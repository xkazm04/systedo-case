/** The onboarding-scan keyless fallback (src/lib/ai/tools/onboarding-scan.ts):
 *  when no LLM provider is configured the wrapper degrades to demoOnboardingScan,
 *  which must (a) derive an honest starter profile deterministically from the
 *  entered domain + fetched site metadata (title / meta description — the same
 *  inputs the model would have read), (b) carry the machine-readable
 *  `source: "fallback"` marker the UI labels, and (c) keep the tail-free base
 *  floor marker-free so a real model scan backfilled by it never reads as a
 *  fallback. Also pins that the apply-route sanitizer preserves (only) the
 *  literal marker, so the label survives a refresh. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseOnboardingScan, demoOnboardingScan } from "@/lib/ai/tools/onboarding-scan";
import { sanitizeScanProfile } from "@/lib/onboarding/types";

const req = (over = {}) => ({
  url: "https://www.dentalis.cz",
  ...over,
});

// --- deterministic metadata derivation ---------------------------------------

test("base profile derives name/offering/summary/keywords from site metadata", () => {
  const r = baseOnboardingScan(
    req({
      siteTitle: "Dentalis — zubní ordinace Brno",
      siteDescription: "Komplexní zubní péče v Brně: hygiena, implantáty, bělení.",
    })
  );
  assert.equal(r.businessName, "Dentalis");
  assert.equal(r.offering, "zubní ordinace Brno");
  assert.equal(r.summary, "Komplexní zubní péče v Brně: hygiena, implantáty, bělení.");
  assert.ok(r.keywords.includes("dentalis"));
  assert.ok(r.keywords.includes("zubní ordinace brno"));
  assert.equal(r.competitors.length, 0, "the fallback never invents competitors");
});

test("brand hint beats the title segment; host is the last-resort name", () => {
  const withBrand = baseOnboardingScan(req({ brand: "Moje Firma", siteTitle: "X | tagline" }));
  assert.equal(withBrand.businessName, "Moje Firma");
  const bare = baseOnboardingScan(req());
  assert.equal(bare.businessName, "dentalis.cz", "www. is stripped from the host");
});

test("pipe/middot separators split the title too; keywords are bounded and deduped", () => {
  const r = baseOnboardingScan(
    req({ siteTitle: "Shop | nákup ořechů | ořechy online | a | b | c | d | e | f" })
  );
  assert.equal(r.businessName, "Shop");
  assert.ok(r.keywords.length <= 6, "keyword list stays bounded");
  assert.equal(new Set(r.keywords).size, r.keywords.length, "no duplicates");
});

test("no metadata at all still yields a usable per-type profile (never throws)", () => {
  const r = baseOnboardingScan(req({ projectType: "eshop" }));
  assert.equal(r.offering, "prodej zboží online");
  assert.equal(r.suggestedType, "eshop");
  assert.ok(r.summary.length > 0);
  assert.ok(r.keywords.length > 0);
});

// --- the fallback marker -----------------------------------------------------

test("demo profile carries source:'fallback' + the honest disclaimer tail; base does NOT", () => {
  const demo = demoOnboardingScan(req({ siteTitle: "Dentalis — zubní ordinace" }));
  assert.equal(demo.source, "fallback");
  assert.match(demo.summary, /Ukázkový výstup — připojte LLM/);
  const base = baseOnboardingScan(req({ siteTitle: "Dentalis — zubní ordinace" }));
  assert.equal(base.source, undefined, "the live-scan floor must never mark a real result");
  assert.doesNotMatch(base.summary, /připojte LLM/);
});

test("sanitizeScanProfile preserves the literal fallback marker and only that", () => {
  const demo = demoOnboardingScan(req({ siteTitle: "Dentalis — zubní ordinace" }));
  const kept = sanitizeScanProfile({ ...demo, scannedUrl: "dentalis.cz" });
  assert.equal(kept?.source, "fallback");
  const forged = sanitizeScanProfile({ ...demo, source: "llm" });
  assert.equal(forged?.source, undefined, "unknown provenance values are dropped");
});
