/** Unit tests for the Google Ads Editor Responsive Search Ad CSV export: the wide
 *  Campaign / Ad group / Headline N / Description N / Final URL layout, one row
 *  per ad, and RFC 4180 escaping of fields that contain a comma or a quote. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assetGroupCsv } from "@/lib/catalog/export";

/** Minimal AssetGroup-shaped fixture (only the fields the exporter reads). */
const mk = (text) => ({ text, len: text.length, max: 30 });

const GROUP = {
  sku: "MIO-DRIFT3",
  finalUrl: "https://mionelo.cz/p/mio-drift3",
  headlines: [mk("Kočárek 3v1"), mk('Sleva: "akce", dnes')],
  longHeadlines: [mk("Kočárek Mionelo Drift 3v1 s dopravou zdarma")],
  descriptions: [mk("Skladem, expedice 24 h")],
};

const META = { campaign: "Kočárky – PMax", assetGroupName: "Drift 3v1" };

test("the header row is the wide RSA layout with one column per asset", () => {
  const [header] = assetGroupCsv(GROUP, META).split("\r\n");
  assert.equal(
    header,
    "Campaign,Ad group,Headline 1,Headline 2,Description 1,Final URL"
  );
});

test("there is exactly one data row (one ad), not one row per asset", () => {
  const lines = assetGroupCsv(GROUP, META).split("\r\n");
  assert.equal(lines.length, 2); // header + one ad row
});

test("the ad row carries campaign, ad group, headlines, description, final URL", () => {
  const [, row] = assetGroupCsv(GROUP, META).split("\r\n");
  assert.ok(row.startsWith("Kočárky – PMax,Drift 3v1,Kočárek 3v1,"));
  // the description has a comma → RFC 4180-quoted
  assert.ok(row.includes('"Skladem, expedice 24 h"'));
  assert.ok(row.endsWith(",https://mionelo.cz/p/mio-drift3"));
});

test("a value with a comma and a quote is CSV-escaped (quoted, quotes doubled)", () => {
  const csv = assetGroupCsv(GROUP, META);
  // 'Sleva: "akce", dnes' → wrapped in quotes, embedded quotes doubled
  assert.ok(csv.includes('"Sleva: ""akce"", dnes"'));
});

test("long headlines (a PMax asset type) are excluded from the RSA CSV", () => {
  const csv = assetGroupCsv(GROUP, META);
  assert.ok(!csv.includes("s dopravou zdarma"));
});
