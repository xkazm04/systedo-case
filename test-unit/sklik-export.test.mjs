/** Sklik (Seznam) export builders (src/lib/sklik-export.ts): one wide
 *  "Kombinovaná reklama" row with Titulek 1..15 / Popisek 1..4 Czech columns
 *  plus the keyword sheet with Sklik's Czech match type. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SKLIK_MAX_DESCRIPTIONS,
  SKLIK_MAX_HEADLINES,
  SKLIK_HEADLINE_LIMIT,
  buildSklikAdSheet,
  buildSklikKeywordSheet,
} from "@/lib/sklik-export";

const SEED = {
  campaign: "Kešu ořechy natural, 500 g",
  adGroup: "Kešu ořechy natural, 500 g",
  displayUrl: "www.mionelo.cz/kesu-orechy",
  finalUrl: "https://www.mionelo.cz/kesu-orechy",
};

test("ad sheet: Czech combined-ad column set, titulky/popisky spread and padded", () => {
  const { headers, rows } = buildSklikAdSheet(
    { headlines: ["Kešu natural", " Bez soli a oleje ", ""], descriptions: ["Doprava zdarma."] },
    SEED
  );
  // 3 identity columns + 15 titulek slots + 4 popisek slots + display + final URL
  assert.equal(headers.length, 3 + SKLIK_MAX_HEADLINES + SKLIK_MAX_DESCRIPTIONS + 2);
  assert.equal(headers[0], "Kampaň");
  assert.equal(headers[1], "Sestava");
  assert.equal(headers[2], "Typ reklamy");
  assert.equal(headers[3], "Titulek 1");
  assert.equal(headers[3 + SKLIK_MAX_HEADLINES], "Popisek 1");
  assert.equal(headers.at(-2), "Zobrazovaná URL");
  assert.equal(headers.at(-1), "Cílová URL");

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.length, headers.length);
  assert.deepEqual(row.slice(0, 3), [SEED.campaign, SEED.adGroup, "Kombinovaná reklama"]);
  // trimmed, blanks dropped, unused slots padded with empty cells
  assert.equal(row[3], "Kešu natural");
  assert.equal(row[4], "Bez soli a oleje");
  assert.equal(row[5], "");
  assert.equal(row[3 + SKLIK_MAX_HEADLINES], "Doprava zdarma.");
  assert.equal(row[3 + SKLIK_MAX_HEADLINES + 1], "");
  assert.equal(row.at(-2), SEED.displayUrl);
  assert.equal(row.at(-1), SEED.finalUrl);
});

test("ad sheet: over-full asset lists truncate to the Sklik slot counts", () => {
  const { rows } = buildSklikAdSheet(
    {
      headlines: Array.from({ length: 20 }, (_, i) => `Nadpis ${i + 1}`),
      descriptions: Array.from({ length: 6 }, (_, i) => `Popisek ${i + 1}`),
    },
    SEED
  );
  const row = rows[0];
  assert.equal(row[3 + SKLIK_MAX_HEADLINES - 1], `Nadpis ${SKLIK_MAX_HEADLINES}`);
  // slot 16 does not exist — the next column is Popisek 1
  assert.equal(row[3 + SKLIK_MAX_HEADLINES], "Popisek 1");
  assert.equal(
    row[3 + SKLIK_MAX_HEADLINES + SKLIK_MAX_DESCRIPTIONS - 1],
    `Popisek ${SKLIK_MAX_DESCRIPTIONS}`
  );
});

test("ad sheet: an over-limit asset is OMITTED, not shipped mangled", () => {
  const overLimit = "x".repeat(SKLIK_HEADLINE_LIMIT + 5);
  const { rows } = buildSklikAdSheet(
    { headlines: ["Krátký", overLimit, "Druhý"], descriptions: ["Popis"] },
    SEED
  );
  const row = rows[0];
  // The over-limit headline is dropped; the following one fills its slot.
  assert.equal(row[3], "Krátký");
  assert.equal(row[4], "Druhý");
  assert.ok(!row.includes(overLimit), "over-limit asset never lands in the sheet");
});

test("keyword sheet: one Volná-match row per non-blank keyword", () => {
  const { headers, rows } = buildSklikKeywordSheet(
    ["kešu ořechy", "  ", "zdravé svačiny "],
    SEED
  );
  assert.deepEqual(headers, ["Kampaň", "Sestava", "Klíčové slovo", "Typ shody"]);
  assert.deepEqual(rows, [
    [SEED.campaign, SEED.adGroup, "kešu ořechy", "Volná"],
    [SEED.campaign, SEED.adGroup, "zdravé svačiny", "Volná"],
  ]);
});

test("keyword sheet: empty input yields headers with no rows", () => {
  const { rows } = buildSklikKeywordSheet([], SEED);
  assert.deepEqual(rows, []);
});
