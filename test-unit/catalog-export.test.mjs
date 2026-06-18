/** Unit tests for the Google Ads asset-group CSV export: the fixed header row,
 *  one data row per asset (headlines + long headlines + descriptions), and
 *  RFC 4180 escaping of fields that contain a comma or a quote. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetGroupCsv,
  ASSET_GROUP_CSV_HEADERS,
} from "@/lib/catalog/export";

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

test("the first line is the fixed Google Ads header row", () => {
  const lines = assetGroupCsv(GROUP, META).split("\r\n");
  assert.equal(lines[0], "Campaign,Asset group,Asset type,Asset text,Final URL");
  assert.equal(lines[0], ASSET_GROUP_CSV_HEADERS.join(","));
});

test("there is exactly one data row per asset across all sections", () => {
  const lines = assetGroupCsv(GROUP, META).split("\r\n");
  const assetCount =
    GROUP.headlines.length + GROUP.longHeadlines.length + GROUP.descriptions.length;
  // header + one row per asset
  assert.equal(lines.length, assetCount + 1);
  // asset types appear in render order
  assert.ok(lines[1].includes(",Headline,"));
  assert.ok(lines[3].includes(",Long headline,"));
  assert.ok(lines[4].includes(",Description,"));
});

test("a value with a comma and a quote is CSV-escaped (quoted, quotes doubled)", () => {
  const csv = assetGroupCsv(GROUP, META);
  // 'Sleva: "akce", dnes' → wrapped in quotes, embedded quotes doubled
  assert.ok(csv.includes('"Sleva: ""akce"", dnes"'));
});

test("plain values are not needlessly quoted", () => {
  const lines = assetGroupCsv(GROUP, META).split("\r\n");
  // first headline has no comma/quote/newline → emitted raw
  assert.ok(lines[1].includes(",Headline,Kočárek 3v1,"));
});
