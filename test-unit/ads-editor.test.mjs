/** Google Ads Editor export builders (src/lib/ads-editor.ts): one wide RSA row
 *  with Headline 1..15 / Description 1..4 columns plus the keyword sheet. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADS_EDITOR_MAX_DESCRIPTIONS,
  ADS_EDITOR_MAX_HEADLINES,
  buildAdsEditorAdSheet,
  buildAdsEditorKeywordSheet,
} from "@/lib/ads-editor";

const SEED = {
  campaign: "Kešu ořechy natural, 500 g",
  adGroup: "Kešu ořechy natural, 500 g",
  path1: "kesu-orechy",
  finalUrl: "https://www.mionelo.cz/kesu-orechy",
};

test("ad sheet: fixed column set with headlines/descriptions spread and padded", () => {
  const { headers, rows } = buildAdsEditorAdSheet(
    { headlines: ["Kešu natural", " Bez soli a oleje ", ""], descriptions: ["Doprava zdarma."] },
    SEED
  );
  // 3 identity columns + 15 headline slots + 4 description slots + path + URL
  assert.equal(headers.length, 3 + ADS_EDITOR_MAX_HEADLINES + ADS_EDITOR_MAX_DESCRIPTIONS + 2);
  assert.equal(headers[0], "Campaign");
  assert.equal(headers[3], "Headline 1");
  assert.equal(headers[3 + ADS_EDITOR_MAX_HEADLINES], "Description 1");
  assert.equal(headers.at(-2), "Path 1");
  assert.equal(headers.at(-1), "Final URL");

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.length, headers.length);
  assert.deepEqual(row.slice(0, 3), [SEED.campaign, SEED.adGroup, "Responsive search ad"]);
  // trimmed, blanks dropped, unused slots padded with empty cells
  assert.equal(row[3], "Kešu natural");
  assert.equal(row[4], "Bez soli a oleje");
  assert.equal(row[5], "");
  assert.equal(row[3 + ADS_EDITOR_MAX_HEADLINES], "Doprava zdarma.");
  assert.equal(row[3 + ADS_EDITOR_MAX_HEADLINES + 1], "");
  assert.equal(row.at(-2), SEED.path1);
  assert.equal(row.at(-1), SEED.finalUrl);
});

test("ad sheet: over-full asset lists truncate to the RSA slot counts", () => {
  const { rows } = buildAdsEditorAdSheet(
    {
      headlines: Array.from({ length: 20 }, (_, i) => `Nadpis ${i + 1}`),
      descriptions: Array.from({ length: 6 }, (_, i) => `Popisek ${i + 1}`),
    },
    SEED
  );
  const row = rows[0];
  assert.equal(row[3 + ADS_EDITOR_MAX_HEADLINES - 1], `Nadpis ${ADS_EDITOR_MAX_HEADLINES}`);
  // slot 16 does not exist — the next column is Description 1
  assert.equal(row[3 + ADS_EDITOR_MAX_HEADLINES], "Popisek 1");
  assert.equal(
    row[3 + ADS_EDITOR_MAX_HEADLINES + ADS_EDITOR_MAX_DESCRIPTIONS - 1],
    `Popisek ${ADS_EDITOR_MAX_DESCRIPTIONS}`
  );
});

test("keyword sheet: one broad-match row per non-blank keyword", () => {
  const { headers, rows } = buildAdsEditorKeywordSheet(
    ["kešu ořechy", "  ", "zdravé svačiny "],
    SEED
  );
  assert.deepEqual(headers, ["Campaign", "Ad group", "Keyword", "Match type"]);
  assert.deepEqual(rows, [
    [SEED.campaign, SEED.adGroup, "kešu ořechy", "Broad"],
    [SEED.campaign, SEED.adGroup, "zdravé svačiny", "Broad"],
  ]);
});

test("keyword sheet: empty input yields headers with no rows", () => {
  const { rows } = buildAdsEditorKeywordSheet([], SEED);
  assert.deepEqual(rows, []);
});
